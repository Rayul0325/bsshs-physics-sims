// Tests for the design-token loader and its derived outputs (CSS variables, PhET roles, font stacks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { splashSvg } from '../../brand/bsshs/wordmark.mjs';
import {
  loadTokens, validateTokens, toCssVariables, toPhetColors, toPhetTheme, fontStack, fontFaces, flattenTokens, TOKENS_JSON
} from '../../theme/index.mjs';

const raw = () => JSON.parse( readFileSync( TOKENS_JSON, 'utf8' ) );

test( 'tokens.json loads, validates and has the pinned groups and keys', () => {
  const t = loadTokens();
  for ( const k of [ 'bg', 'surface', 'surfaceAlt', 'text', 'textMuted', 'border', 'accent', 'accentText', 'focus', 'success', 'warning', 'danger' ] ) {
    assert.equal( typeof t.color[ k ], 'string', `color.${k}` );
  }
  for ( const k of [ 'sans', 'serif', 'mono', 'koreanFallback', 'sizes' ] ) { assert.ok( k in t.font, `font.${k}` ); }
  for ( const g of [ 'tracking', 'radius', 'space', 'shadow' ] ) { assert.equal( typeof t[ g ], 'object', g ); }
  assert.deepEqual( validateTokens( t ), [] );
} );

test( 'validateTokens reports missing keys, non-PhET colors and bad role mappings', () => {
  const t = raw();
  delete t.color.focus;
  assert.ok( validateTokens( t ).some( e => e.includes( 'color.focus' ) ) );
  const u = raw();
  u.color.accent = 'oklch(0.5 0.2 250)';
  assert.ok( validateTokens( u ).some( e => e.includes( 'color.accent' ) ) );
  const v = raw();
  v.phet.panelFill = 'nope';
  assert.ok( validateTokens( v ).some( e => e.includes( 'phet.panelFill' ) ) );
  const w = raw();
  w.font.koreanFallback = 'Apple SD Gothic Neo, Malgun Gothic';
  assert.ok( validateTokens( w ).some( e => e.includes( 'koreanFallback' ) ) );
  assert.throws( () => loadTokens( '/nonexistent/tokens.json' ) );
} );

test( 'toCssVariables emits one --bsshs-* custom property per flattened token', () => {
  const t = loadTokens();
  const css = toCssVariables( t );
  assert.match( css, /^:root \{\n/ );
  assert.ok( css.trimEnd().endsWith( '}' ) );
  const decls = css.split( '\n' ).filter( l => l.startsWith( '  --bsshs-' ) );
  assert.equal( decls.length, flattenTokens( t ).length );
  assert.ok( decls.includes( `  --bsshs-color-surface-alt: ${t.color.surfaceAlt};` ) );
  assert.ok( decls.includes( `  --bsshs-tracking-tight: ${t.tracking.tight};` ) );
  assert.ok( decls.includes( `  --bsshs-radius-md: ${t.radius.md};` ) );
  assert.ok( decls.includes( `  --bsshs-font-sans: ${fontStack( t, 'sans' )};` ) );
  assert.ok( decls.includes( `  --bsshs-shadow-card: ${t.shadow.card};` ) );
  assert.match( toCssVariables( t, { selector: '.drawer' } ), /^\.drawer \{/ );
} );

test( 'fontStack puts the token family first, then the Korean fallback, then the generic family', () => {
  const t = loadTokens();
  const s = fontStack( t, 'sans' );
  assert.ok( s.startsWith( t.font.sans ) );
  for ( const f of t.font.koreanFallback ) { assert.ok( s.includes( f ) ); }
  assert.ok( s.endsWith( t.font.genericSans ) );
  assert.ok( !fontStack( t, 'sans', { generic: false } ).endsWith( t.font.genericSans ) );
  // A changed Korean fallback flows through without code changes.
  const u = { ...t, font: { ...t.font, koreanFallback: [ 'Pretendard' ] } };
  assert.equal( fontStack( u, 'sans' ), `${t.font.sans}, Pretendard, ${t.font.genericSans}` );
} );

test( 'toPhetColors / toPhetTheme resolve the phet role map to token values', () => {
  const t = loadTokens();
  const c = toPhetColors( t );
  assert.equal( c.panelFill, t.color[ t.phet.panelFill ] );
  assert.equal( c.pushButtonBase, t.color[ t.phet.pushButtonBase ] );
  assert.equal( c.homeScreenBackground, t.color[ t.phet.homeScreenBackground ] );
  const p = toPhetTheme( t );
  assert.equal( p.panelCornerRadius, Number.parseFloat( t.radius[ t.phet.panelCornerRadius ] ) );
  assert.equal( p.fontFamily, fontStack( t, 'sans', { generic: false } ) );
} );

test( 'every font face file and its OFL license exist next to each other', () => {
  const t = loadTokens();
  const faces = fontFaces( t );
  assert.ok( faces.length >= 1 );
  for ( const f of faces ) {
    assert.ok( existsSync( f.file ), f.file );
    assert.ok( existsSync( f.license ), f.license );
    assert.match( readFileSync( f.license, 'utf8' ), /SIL OPEN FONT LICENSE Version 1\.1/ );
  }
  assert.ok( fontFaces( t, { simsOnly: true } ).every( f => f.family === t.font.sans ) );
} );

test( 'wordmark and splash type sizes come from the tokens, not from wordmark.mjs', () => {
  const t = loadTokens();
  assert.ok( t.font.sizes.wordmark && t.font.sizes.splash );
  assert.match( splashSvg( t ), new RegExp( `font-size="${Number.parseFloat( t.font.sizes.splash )}"` ) );
  const u = { ...t, font: { ...t.font, sizes: { ...t.font.sizes, splash: '40px' } } };
  assert.match( splashSvg( u ), /font-size="40"/ );
  const src = readFileSync( new URL( '../../brand/bsshs/wordmark.mjs', import.meta.url ), 'utf8' );
  assert.doesNotMatch( src, /FONT_PX\s*=/ );
} );
