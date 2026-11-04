// Invariant 2 for the drawer: no design-value literal (hex color, CSS color function, literal
// font-family, token font names) in drawer/**, the drawer tools or the example adapter. The same
// detector as tests/theme/no-literals.test.mjs (copied: importing that file would re-run its tests).
// Also: user-visible drawer strings never say "PhET" (the checker's phetName rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTokens } from '../../theme/index.mjs';
import { drawerLayout } from '../../drawer/config.mjs';
import { drawerCss } from '../../drawer/inject.mjs';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
const ROOTS = [ 'drawer', 'adapters/_example', 'tools/inject-drawer.mjs', 'tools/compare-layout.mjs' ];

/** @param {string} rel @returns {string[]} */
function walk( rel ) {
  const abs = path.join( ROOT, rel );
  const st = statSync( abs );
  if ( st.isFile() ) { return [ rel ]; }
  return readdirSync( abs ).flatMap( n => walk( path.posix.join( rel, n ) ) );
}

/** @param {string} text @param {string[]} names */
function findDesignLiterals( text, names ) {
  const hits = [];
  for ( const re of [
    /(?<![\w&\\])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
    /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/g,
    /font-family\s*:\s*['"A-Za-z]/gi
  ] ) {
    for ( const m of text.matchAll( re ) ) { hits.push( m[ 0 ] ); }
  }
  for ( const n of names ) { if ( text.includes( n ) ) { hits.push( n ); } }
  return hits;
}

test( 'no design-value literal in the drawer code, tools or example adapter', () => {
  const t = loadTokens();
  const names = [ t.font.sans, t.font.serif, t.font.mono, ...t.font.koreanFallback ];
  const files = ROOTS.flatMap( walk ).filter( f => /\.(mjs|js|css|json|html)$/.test( f ) );
  assert.ok( files.length >= 6, files.join( ', ' ) );
  const problems = files.map( f => [ f, findDesignLiterals( readFileSync( path.join( ROOT, f ), 'utf8' ), names ) ] )
    .filter( ( [ , h ] ) => h.length ).map( ( [ f, h ] ) => `${f}: ${[ ...new Set( h ) ].join( ', ' )}` );
  assert.deepEqual( problems, [] );
} );

test( 'drawer UI strings never name PhET', () => {
  for ( const f of [ 'drawer/runtime.js', 'drawer/drawer.css' ] ) {
    const code = readFileSync( path.join( ROOT, f ), 'utf8' ).replace( /\/\*[\s\S]*?\*\//g, '' ).replace( /\/\/.*$/gm, '' );
    const strings = code.match( /'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g ) || [];
    assert.deepEqual( strings.filter( s => /PhET/.test( s ) ), [], f );
  }
} );

test( 'drawer.css and config.mjs hold no non-zero length or duration of their own; every layout value comes from tokens', () => {
  for ( const f of [ 'drawer/drawer.css', 'drawer/config.mjs' ] ) {
    const code = readFileSync( path.join( ROOT, f ), 'utf8' ).replace( /\/\*[\s\S]*?\*\//g, '' ).replace( /\/\/.*$/gm, '' );
    assert.deepEqual( code.match( /(?<![\w.$-])(?:[1-9]\d*(?:\.\d+)?|0\.\d+)(px|em|rem|vh|vw|ms|s)\b/g ) || [], [], f );
  }
  const t = loadTokens();
  const L = drawerLayout( t );
  assert.equal( L.touchTarget, t.size.touchTarget );
  assert.equal( L.sheetMaxWidthPx, parseFloat( t.breakpoint.sheet ) );
  assert.equal( L.wideMinWidthPx, parseFloat( t.breakpoint.large ) );
  assert.equal( t.font.sizes.largeScreenBody, '18px' );
  // A changed token flows through without code changes.
  const u = structuredClone( t );
  u.size.touchTarget = '48px'; u.breakpoint.sheet = '700px'; u.drawer.width = '500px'; u.drawer.sheetHeight = '60vh';
  const css = drawerCss( u );
  assert.match( css, /--tt: 48px;/ );
  assert.match( css, /@media \(max-width: 700px\)/ );
  assert.match( css, /min\(100%, 500px\)/ );
  assert.match( css, /height: 60vh;/ );
  assert.match( css, /var\(--bsshs-font-size-large-screen-body\)/ );
  assert.doesNotMatch( css, /__\w+__/ );
  delete u.size;
  assert.throws( () => drawerLayout( u ), /size/ );
} );

/**
 * Numeric literals inside the `// @canvas:begin` … `// @canvas:end` regions of a file, after removing
 * comments and strings. 0, 1 and 2 are allowed (halving, full circle, counting); a line marked
 * `// math:` (the 1-2-5 decade series, float clean-up) is skipped with its reason in the code.
 * @param {string} src
 * @returns {{ regions: number, hits: string[] }}
 */
export function canvasNumberLiterals( src ) {
  const regions = [ ...src.matchAll( /\/\/ @canvas:begin([\s\S]*?)\/\/ @canvas:end/g ) ].map( m => m[ 1 ] );
  const hits = [];
  for ( const region of regions ) {
    for ( const line of region.split( '\n' ) ) {
      if ( line.includes( '// math:' ) ) { continue; }
      const code = line.replace( /\/\/.*$/, '' ).replace( /'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"/g, "''" );
      for ( const m of code.matchAll( /(?<![\w.$])(?:\d+(?:\.\d+)?(?:e[-+]?\d+)?|\.\d+)(?![\w.])/g ) ) {
        if ( ![ '0', '1', '2' ].includes( m[ 0 ] ) ) { hits.push( `${m[ 0 ]} in: ${line.trim().slice( 0, 90 )}` ); }
      }
    }
  }
  return { regions: regions.length, hits };
}

test( 'graph canvas code holds no numeric design constant (they live in theme/tokens.json drawer.graph)', () => {
  assert.deepEqual( canvasNumberLiterals( '// @canvas:begin\nctx.lineWidth = 2; x = w / 2 + 0;\n// @canvas:end' ).hits, [] );
  assert.equal( canvasNumberLiterals( '// @canvas:begin\nconst fs = Math.max( 13, w / 30 );\n// @canvas:end' ).hits.length, 2, 'the detector catches 13 and 30' );
  assert.equal( canvasNumberLiterals( '// @canvas:begin\nh = w * 0.68; d = [ .5 ];\n// @canvas:end' ).hits.length, 2 );
  const rt = canvasNumberLiterals( readFileSync( path.join( ROOT, 'drawer/runtime.js' ), 'utf8' ) );
  assert.ok( rt.regions >= 2, 'drawGraph/renderGraph and the PNG export are marked' );
  assert.deepEqual( rt.hits, [] );
  const core = canvasNumberLiterals( readFileSync( path.join( ROOT, 'drawer/core.js' ), 'utf8' ) );
  assert.ok( core.regions >= 1, 'niceTicks is marked' );
  assert.deepEqual( core.hits, [] );
  const t = loadTokens();
  for ( const k of [ 'aspect', 'fallbackWidth', 'lineWidth', 'markerScale', 'dash', 'tickScale', 'labelScale', 'pngWidth', 'pngHeight', 'tickCount' ] ) {
    assert.ok( k in t.drawer.graph, `drawer.graph.${k}` );
  }
  assert.ok( t.font.sizes.graphMin );
  assert.deepEqual( Object.keys( drawerLayout( t ).graph ).sort(), Object.keys( t.drawer.graph ).sort() );
} );
