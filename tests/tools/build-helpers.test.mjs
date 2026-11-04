// Tests for pure helpers used by build-sim: failure summaries, brand-overlay detection, install markers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFailure, isUnsupportedBrandFailure, addSupportedBrand, installMarker } from '../../tools/lib/build-helpers.mjs';

test( 'summarizeFailure prefers error-looking lines and caps the length', () => {
  const tail = [ 'Running "build" task', 'Building brand: adapted-from-phet', 'noise', 'Fatal error: Unsupported brand: adapted-from-phet', 'Aborted due to warnings.' ].join( '\n' );
  const s = summarizeFailure( tail, 1 );
  assert.match( s, /Unsupported brand: adapted-from-phet/ );
  assert.doesNotMatch( s, /noise/ );
  assert.ok( summarizeFailure( 'x'.repeat( 5000 ), 1 ).length <= 900 );
} );

test( 'summarizeFailure falls back to the last lines and mentions the exit code', () => {
  const s = summarizeFailure( 'a\nb\nc', 3 );
  assert.match( s, /exit 3/ );
  assert.match( s, /c/ );
} );

test( 'isUnsupportedBrandFailure recognises chipper brand assertions only', () => {
  assert.equal( isUnsupportedBrandFailure( 'AssertionError [ERR_ASSERTION]: Unsupported brand: adapted-from-phet' ), true );
  assert.equal( isUnsupportedBrandFailure( 'Error: Cannot find module' ), false );
} );

test( 'addSupportedBrand appends the brand once and keeps other fields', () => {
  const pkg = JSON.stringify( { name: 'x', version: '1.0.0', phet: { runnable: true, supportedBrands: [ 'phet', 'phet-io' ] } }, null, 2 ) + '\n';
  const out = JSON.parse( addSupportedBrand( pkg, 'adapted-from-phet' ) );
  assert.deepEqual( out.phet.supportedBrands, [ 'phet', 'phet-io', 'adapted-from-phet' ] );
  assert.equal( out.version, '1.0.0' );
  assert.equal( addSupportedBrand( addSupportedBrand( pkg, 'adapted-from-phet' ), 'adapted-from-phet' ), addSupportedBrand( pkg, 'adapted-from-phet' ) );
} );

test( 'installMarker changes with the lockfile and with the node major', () => {
  const a = installMarker( '{"a":1}', '{"lock":1}', 24 );
  assert.equal( a, installMarker( '{"a":1}', '{"lock":1}', 24 ) );
  assert.notEqual( a, installMarker( '{"a":1}', '{"lock":2}', 24 ) );
  assert.notEqual( a, installMarker( '{"a":1}', '{"lock":1}', 20 ) );
  assert.notEqual( a, installMarker( '{"a":1}', null, 24 ) );
} );

test( 'isPrivateTypeCheckFailure only accepts tsc failures caused by missing private PhET-iO files', async () => {
  const { isPrivateTypeCheckFailure } = await import( '../../tools/lib/build-helpers.mjs' );
  const priv = "Fatal error: tsc failed with code: 2\nerror TS5083: Cannot read file '/x/slot-0/phet-io/tsconfig-module.json'.";
  assert.equal( isPrivateTypeCheckFailure( priv ), true );
  const studio = "tsc failed with code: 2\nerror TS6053: File '/x/slot-1/studio/js/main.ts' not found.";
  assert.equal( isPrivateTypeCheckFailure( studio ), true );
  const real = "tsc failed with code: 2\nerror TS5083: Cannot read file '/x/phet-io/a.json'.\njs/Foo.ts(3,1): error TS2322: Type 'string' is not assignable";
  assert.equal( isPrivateTypeCheckFailure( real ), false );
  assert.equal( isPrivateTypeCheckFailure( 'Unsupported brand: adapted-from-phet' ), false );
} );

test( 'isPrivatePhetioTsconfigFailure requires the exact TS5083 phet-io tsconfig error and nothing else', async () => {
  const { isPrivatePhetioTsconfigFailure } = await import( '../../tools/lib/build-helpers.mjs' );
  const exact = "Fatal error: tsc failed with code: 2\nstdout:\nerror TS5083: Cannot read file '/c/slot-0/phet-io/tsconfig-module.json'.\n\n1 problems found.";
  assert.equal( isPrivatePhetioTsconfigFailure( exact ), true );
  assert.equal( isPrivatePhetioTsconfigFailure( exact + "\njs/A.ts(1,1): error TS2307: Cannot find module '../../phet-io/js/x.js'" ), false );
  assert.equal( isPrivatePhetioTsconfigFailure( "error TS5083: Cannot read file '/c/studio/tsconfig.json'." ), false );
  assert.equal( isPrivatePhetioTsconfigFailure( 'Unsupported brand: adapted-from-phet' ), false );
} );

test( 'skipTscBuildPatch disables only the sim tsc --build call in chipper Gruntfile.js', async () => {
  const { skipTscBuildPatch } = await import( '../../tools/lib/build-helpers.mjs' );
  const src = [
    '      // Run the type checker first',
    '      const results = await tsc( `../${repo}`, [ \'--build\' ] );',
    '      reportTscResults( results, grunt );',
    '',
    '      // If that succeeds, then convert the code to JS',
    '      new Transpiler().transpileRepos( getPhetLibs( repo ) );'
  ].join( '\n' );
  const out = skipTscBuildPatch( src );
  assert.ok( out );
  assert.doesNotMatch( out, /await tsc\(/ );
  assert.doesNotMatch( out, /reportTscResults\( results/ );
  assert.match( out, /new Transpiler\(\)\.transpileRepos/ );
  assert.match( out, /chipper-skip-tsc/ );
  assert.equal( skipTscBuildPatch( 'no tsc call here' ), null );
} );
