// The `sim` token group: shape, validation, palette, placeholder resolver. Values are never repeated here:
// the tests read them from tokens.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadTokens, validateTokens, validateSimTokens, simPalette, resolveColorToken, resolveSvgPlaceholders, svgPlaceholders, parseTokenColor,
  SIM_PHYSICS_KEYS, SIM_CHECK_KEYS, TOKENS_JSON
} from '../../theme/index.mjs';

const raw = () => JSON.parse( readFileSync( TOKENS_JSON, 'utf8' ) );
const tokens = loadTokens();

test( 'tokens.json has the sim group with every documented key', () => {
  for ( const k of [ 'canvas', 'canvasDark', 'surface', 'line', 'control', 'controlActive', 'text', 'textOnDark' ] ) { assert.ok( parseTokenColor( tokens.sim[ k ] ), `sim.${k}` ); }
  for ( const k of SIM_PHYSICS_KEYS ) { assert.ok( parseTokenColor( tokens.sim.physics[ k ] ), `sim.physics.${k}` ); }
  assert.deepEqual( Object.keys( tokens.sim.physics ).sort(), [ ...SIM_PHYSICS_KEYS ].sort(), 'no undocumented physics key' );
  assert.deepEqual( Object.keys( tokens.sim.check ).sort(), [ ...SIM_CHECK_KEYS ].sort(), 'no undocumented check key' );
  assert.deepEqual( validateTokens( tokens ), [] );
} );

test( 'the sim canvas and surface come from BSS Drive\'s own background and card colors', () => {
  assert.equal( tokens.sim.canvas, tokens.color.bg );
  assert.equal( tokens.sim.surface, tokens.color.surface );
  assert.equal( tokens.sim.text, tokens.color.text );
  assert.notEqual( tokens.sim.canvasDark, tokens.sim.canvas, 'a dark canvas exists and is another color' );
} );

test( 'pure black is not a token anywhere in the sim group (spec 3.1: no black borders, no black canvas)', () => {
  const walk = ( o, p = 'sim' ) => Object.entries( o ).flatMap( ( [ k, v ] ) => ( typeof v === 'object' ? walk( v, `${p}.${k}` ) : [ [ `${p}.${k}`, v ] ] ) );
  for ( const [ p, v ] of walk( tokens.sim ) ) {
    const c = parseTokenColor( v );
    if ( c ) { assert.ok( !( c.r === 0 && c.g === 0 && c.b === 0 && c.a === 1 ), `${p} is opaque black` ); }
  }
  const t = raw();
  t.sim.line = '#000000';
  assert.ok( validateTokens( t ).some( e => /sim\.line must not be pure black/.test( e ) ) );
  t.sim.line = 'rgb(0, 0, 0)';
  assert.ok( validateTokens( t ).some( e => /pure black/.test( e ) ) );
} );

test( 'the physics colors read on both canvases (a flat mid-tone, not near the canvas color)', () => {
  const lum = hex => { const c = parseTokenColor( hex ); const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ( ( s + 0.055 ) / 1.055 ) ** 2.4; }; return 0.2126 * f( c.r ) + 0.7152 * f( c.g ) + 0.0722 * f( c.b ); };
  const ratio = ( a, b ) => ( Math.max( lum( a ), lum( b ) ) + 0.05 ) / ( Math.min( lum( a ), lum( b ) ) + 0.05 );
  for ( const [ k, v ] of Object.entries( tokens.sim.physics ) ) {
    assert.ok( ratio( v, tokens.sim.canvas ) >= 1.7, `${k} on the light canvas` );
    assert.ok( ratio( v, tokens.sim.canvasDark ) >= 3, `${k} on the dark canvas` );
  }
  assert.ok( ratio( tokens.sim.text, tokens.sim.canvas ) >= 4.5 && ratio( tokens.sim.textOnDark, tokens.sim.canvasDark ) >= 4.5 );
  assert.ok( ratio( '#ffffff', tokens.sim.controlActive ) >= 4.5, 'white text on the active control' );
} );

test( 'validateSimTokens reports missing keys, bad colors and bad thresholds', () => {
  assert.deepEqual( validateSimTokens( tokens.sim ), [] );
  assert.ok( validateSimTokens( undefined ).length );
  const t = JSON.parse( JSON.stringify( tokens.sim ) );
  delete t.physics.copper;
  t.physics.water = 'blue';
  t.check.minContrast = '4.5';
  t.canvas = 'oklch(0.9 0 0)';
  const e = validateSimTokens( t );
  for ( const re of [ /missing sim\.physics\.copper/, /sim\.physics\.water must be/, /sim\.check\.minContrast/, /sim\.canvas must be/ ] ) { assert.ok( e.some( x => re.test( x ) ), String( re ) ); }
  const u = raw();
  delete u.sim;
  assert.ok( validateTokens( u ).some( x => /missing group sim/.test( x ) ) );
} );

test( 'simPalette lists every color token with its path; resolveColorToken finds them by path', () => {
  const pal = simPalette( tokens );
  assert.ok( pal.some( p => p.path === 'sim.physics.copper' && p.value === tokens.sim.physics.copper ) );
  assert.ok( pal.some( p => p.path === 'color.accent' ) );
  assert.ok( pal.some( p => p.path === 'color.border' && p.rgba.a < 1 ), 'translucent tokens keep their alpha' );
  assert.equal( new Set( pal.map( p => p.path ) ).size, pal.length );
  assert.equal( pal.length, Object.keys( tokens.color ).length + 8 + SIM_PHYSICS_KEYS.length );
  assert.equal( resolveColorToken( tokens, 'sim.canvasDark' ), tokens.sim.canvasDark );
  for ( const bad of [ 'sim.physics', 'sim.check.minContrast', 'font.sans', 'sim.nope', '' ] ) { assert.throws( () => resolveColorToken( tokens, bad ), /unknown color token/, bad ); }
} );

test( '{{sim.physics.copper}} placeholders resolve to token values; an unknown one throws', () => {
  const svg = '<svg><path fill="{{sim.physics.copper}}" stroke="{{ sim.line }}"/><path fill="{{sim.physics.copper}}"/></svg>';
  assert.deepEqual( svgPlaceholders( svg ), [ 'sim.physics.copper', 'sim.line' ] );
  assert.equal( resolveSvgPlaceholders( svg, tokens ), `<svg><path fill="${tokens.sim.physics.copper}" stroke="${tokens.sim.line}"/><path fill="${tokens.sim.physics.copper}"/></svg>` );
  assert.equal( resolveSvgPlaceholders( '<svg fill="none"/>', tokens ), '<svg fill="none"/>' );
  assert.throws( () => resolveSvgPlaceholders( '<svg fill="{{sim.physics.unobtainium}}"/>', tokens ), /unknown color token/ );
  assert.throws( () => resolveSvgPlaceholders( '<svg fill="{{font.sans}}"/>', tokens ), /unknown color token/ );
} );
