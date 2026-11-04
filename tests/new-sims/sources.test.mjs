// Source rules for every original sim under sims/ (the template included):
//   - every code file carries the GPL-3.0 header crediting "bsshs-physics-sims contributors", no personal names;
//   - no design-value literals (invariant: design values live only in theme/tokens.json);
//   - no other-origin URLs in code (invariant: no requests to other origins);
//   - the on-screen strings are Korean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listNewSimIds, listSourceFiles, readNewSim, SIMS_DIR } from '../../tools/lib/new-sims.mjs';
import { loadTokens } from '../../theme/index.mjs';

const CODE = /\.(ts|js|mjs|cjs)$/;
const HEADER = /^\/\/ Copyright \d{4}(-\d{4})?, bsshs-physics-sims contributors\n\/\/ SPDX-License-Identifier: GPL-3\.0-only\n/;

/** Same detector as tests/theme/no-literals.test.mjs (hex colors, CSS color functions, font-family, token families). */
function designLiterals( text, familyNames ) {
  const hits = [];
  for ( const re of [
    /(?<![\w&\\])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
    /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/g,
    /font-family\s*:\s*['"A-Za-z]/gi
  ] ) {
    for ( const m of text.matchAll( re ) ) { hits.push( m[ 0 ] ); }
  }
  for ( const name of familyNames ) { if ( text.includes( name ) ) { hits.push( name ); } }
  return hits;
}

const sims = listNewSimIds( SIMS_DIR, { includeTemplate: true } ).map( id => readNewSim( id ) );

test( 'there is at least the template to check', () => {
  assert.ok( sims.some( s => s.id === '_template' ) );
} );

for ( const sim of sims ) {
  const files = listSourceFiles( sim.srcDir );
  const read = f => readFileSync( path.join( sim.srcDir, f ), 'utf8' );

  test( `${sim.id}: GPL-3.0 header on every code file, no personal names`, () => {
    const code = files.filter( f => CODE.test( f ) );
    assert.ok( code.length > 0 );
    for ( const f of code ) {
      const text = read( f );
      assert.match( text, HEADER, `${f} header` );
      assert.ok( !/@author/.test( text ), `${f} has an @author tag` );
    }
  } );

  test( `${sim.id}: no design-value literals and no other-origin URLs in code`, () => {
    const t = loadTokens();
    const names = [ t.font.sans, t.font.serif, t.font.mono, ...t.font.koreanFallback ];
    const problems = [];
    for ( const f of files.filter( x => CODE.test( x ) || /\.(json|css|svg|html)$/.test( x ) ) ) {
      const text = read( f );
      const hits = designLiterals( text, names );
      if ( hits.length ) { problems.push( `${f}: ${[ ...new Set( hits ) ].join( ', ' )}` ); }
      if ( CODE.test( f ) && /\b(?:https?|wss?):\/\//.test( text.replace( /^\/\/.*$/gm, '' ) ) ) { problems.push( `${f}: URL in code` ); }
    }
    assert.deepEqual( problems, [] );
  } );

  test( `${sim.id}: every on-screen string value contains Korean or is a pure unit/pattern`, () => {
    const strings = JSON.parse( read( `${sim.repo}-strings_en.json` ) );
    const values = [];
    const walk = o => { for ( const v of Object.values( o ) ) { if ( v && typeof v === 'object' ) { typeof v.value === 'string' ? values.push( v.value ) : walk( v ); } } };
    walk( strings );
    assert.ok( values.length > 0 );
    const bad = values.filter( v => !/[가-힣]/.test( v ) && /[A-Za-z]{3,}/.test( v.replace( /\{\{\w+\}\}/g, '' ) ) );
    assert.deepEqual( bad, [], 'English words found in string values' );
  } );
}
