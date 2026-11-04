// The attribution strings are fixed by the spec (3.2); this pins them verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ATTRIBUTION, REPO_URL, WORDMARK, BRAND_ID, REQUIRED_ABOUT_STRINGS, brandFields } from '../../brand/bsshs/attribution.mjs';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );

test( 'attribution constants match the spec strings exactly', () => {
  assert.equal( ATTRIBUTION.phetCredit, 'Simulation by PhET Interactive Simulations, University of Colorado Boulder (https://phet.colorado.edu)' );
  assert.equal( ATTRIBUTION.originalKo, '원작: PhET Interactive Simulations, University of Colorado Boulder' );
  assert.equal( ATTRIBUTION.modifiedBy, '부산과학고 학생이 수정함' );
  assert.equal( ATTRIBUTION.licenses, '소스 라이선스: GPL-3.0 · 원본 배포본: CC BY-NC 4.0' );
  assert.equal( ATTRIBUTION.sourceRepo, 'https://github.com/Rayul0325/bsshs-physics-sims' );
  assert.equal( ATTRIBUTION.notOfficial, '부산과학고 학생 제작 · 학교 공식 자료 아님' );
  assert.equal( REPO_URL, ATTRIBUTION.sourceRepo );
  assert.equal( WORDMARK, '부산과학고' );
  assert.equal( BRAND_ID, 'bsshs' );
  assert.equal( REQUIRED_ABOUT_STRINGS.length, 6 );
  assert.ok( Object.isFrozen( ATTRIBUTION ) );
} );

test( 'brandFields carries every required string into fields the AboutDialog renders', () => {
  const f = brandFields();
  const shown = [ f.name, f.copyright, ...f.license.split( '<br>' ) ].join( '\n' );
  for ( const s of REQUIRED_ABOUT_STRINGS ) { assert.ok( shown.includes( s ), s ); }
  assert.equal( f.licenseWithoutLinks, f.license );
  assert.doesNotMatch( f.license, /<a\b/ );
} );

test( 'the repo URL is written in exactly one source file', () => {
  const files = [ 'brand/bsshs/attribution.mjs', 'brand/bsshs/patches.mjs', 'brand/bsshs/wordmark.mjs', 'theme/index.mjs',
                  'theme/inject.mjs', 'theme/patches/index.mjs', 'theme/patches/theme.mjs', 'theme/patches/telemetry.mjs',
                  'theme/patches/engine.mjs', 'tools/check-sim.mjs', 'tools/build-sim.mjs' ];
  const hits = files.filter( f => readFileSync( path.join( ROOT, f ), 'utf8' ).includes( 'github.com/Rayul0325/bsshs-physics-sims' ) );
  assert.deepEqual( hits, [ 'brand/bsshs/attribution.mjs' ] );
} );

test( 'no student name: the brand only names the school', () => {
  const text = JSON.stringify( { ...ATTRIBUTION, ...brandFields() } );
  assert.ok( !/라율|도건|Chang|Rayul(?!0325\/bsshs)/.test( text ) );
} );
