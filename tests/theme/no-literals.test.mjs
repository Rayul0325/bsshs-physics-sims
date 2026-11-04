// Invariant 2: design values live in theme/tokens.json only. Scans every theme-consuming source
// file for design-value literals: hex colors, CSS color functions, CSS font-family declarations and
// the token font family names. (A CSS property whose value is interpolated from the tokens is fine.)
// PhET's own original values that patches must FIND are written as
// escaped regular expressions (e.g. /rgb\(\s*50, .../), so they are not flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadTokens } from '../../theme/index.mjs';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );

/** Theme-consuming code (incl. the class drawer and the per-sim adapters). Generated output dirs
 *  (build/, dist/, node_modules/) are never scanned. */
const SCAN_ROOTS = [ 'theme', 'brand', 'tools', 'drawer', 'adapters', 'site' ];
const EXCLUDED_DIRS = new Set( [ 'node_modules', 'build', 'dist', 'fonts' ] );
const ALLOWED_FILES = new Set( [ 'theme/tokens.json' ] );
const SCANNED_EXT = /\.(mjs|js|ts|css|html|svg|json)$/;

/** @returns {string[]} repo-relative files */
function walk( rel ) {
  const abs = path.join( ROOT, rel );
  let st;
  try { st = statSync( abs ); } catch { return []; }
  if ( st.isFile() ) { return [ rel ]; }
  return readdirSync( abs ).flatMap( name => ( EXCLUDED_DIRS.has( name ) ? [] : walk( path.posix.join( rel, name ) ) ) );
}

/**
 * Design-value literals found in a text.
 * @param {string} text
 * @param {string[]} familyNames
 * @returns {string[]}
 */
export function findDesignLiterals( text, familyNames ) {
  const hits = [];
  for ( const re of [
    /(?<![\w&\\])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
    /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/g,
    /font-family\s*:\s*['"A-Za-z]/gi
  ] ) {
    for ( const m of text.matchAll( re ) ) { hits.push( m[ 0 ] ); }
  }
  for ( const name of familyNames ) {
    if ( text.includes( name ) ) { hits.push( name ); }
  }
  return hits;
}

test( 'the literal detector catches what it should and ignores escaped PhET find-patterns', () => {
  const names = [ 'Geist' ];
  assert.deepEqual( findDesignLiterals( "fill: '#3b82f6'", names ), [ '#3b82f6' ] );
  assert.deepEqual( findDesignLiterals( "c = 'rgba(0, 0, 0, 0.1)'", names ), [ 'rgba(0' ] );
  assert.deepEqual( findDesignLiterals( 'p { font-family: x }', names ), [ 'font-family: x' ] );
  assert.deepEqual( findDesignLiterals( 'font-family: ${JSON.stringify( f.family )}', names ), [] );
  assert.deepEqual( findDesignLiterals( "family: 'Geist'", names ), [ 'Geist' ] );
  assert.deepEqual( findDesignLiterals( "find: /'rgb\\(\\s*50, 145/", names ), [] );
  assert.deepEqual( findDesignLiterals( 'see issue #123x and &#x27; and url#frag', names ), [] );
} );

test( 'no design-value literal appears in theme-consuming code outside theme/tokens.json', () => {
  const t = loadTokens();
  const names = [ t.font.sans, t.font.serif, t.font.mono, ...t.font.koreanFallback ];
  const files = SCAN_ROOTS.flatMap( walk ).filter( f => SCANNED_EXT.test( f ) && !ALLOWED_FILES.has( f ) );
  assert.ok( files.length > 5, `scanned ${files.length} files` );
  const problems = [];
  for ( const f of files ) {
    const hits = findDesignLiterals( readFileSync( path.join( ROOT, f ), 'utf8' ), names );
    if ( hits.length ) { problems.push( `${f}: ${[ ...new Set( hits ) ].join( ', ' )}` ); }
  }
  assert.deepEqual( problems, [] );
  assert.ok( files.some( f => f.startsWith( 'drawer/' ) ), 'drawer/ is scanned' );
} );
