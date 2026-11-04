// CLI flags for the themed build and where each build variant writes its output and matrix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseBuildArgs } from '../../tools/build-sim.mjs';
import { buildVariant } from '../../tools/lib/variant.mjs';
import { buildDir, MATRIX_JSON } from '../../tools/lib/paths.mjs';
import { shouldSkip } from '../../tools/lib/matrix.mjs';

test( 'without flags the build is the unchanged baseline', () => {
  const o = parseBuildArgs( [ 'faradays-law' ] );
  assert.equal( o.brand, 'adapted-from-phet' );
  assert.equal( o.theme, false );
  const v = buildVariant( o );
  assert.equal( v.name, 'baseline' );
  assert.equal( v.outRoot, buildDir() );
  assert.equal( v.matrixFile, MATRIX_JSON );
  assert.equal( v.logsDir, path.join( buildDir(), 'logs' ) );
} );

test( '--brand bsshs --theme selects the bsshs-theme variant with its own output and matrix', () => {
  const o = parseBuildArgs( [ '--brand', 'bsshs', '--theme', 'x' ] );
  assert.equal( o.brand, 'bsshs' );
  assert.equal( o.theme, true );
  const v = buildVariant( o );
  assert.equal( v.name, 'bsshs-theme' );
  assert.equal( v.outRoot, path.join( buildDir(), 'bsshs-theme' ) );
  assert.match( v.matrixFile, /build-matrix\.bsshs-theme\.json$/ );
  assert.equal( buildVariant( parseBuildArgs( [ '--brand=bsshs', 'x' ] ) ).name, 'bsshs' );
  assert.throws( () => parseBuildArgs( [ '--brand', 'phet', 'x' ] ), /--brand/ );
} );

test( 'shouldSkip also requires the same theme hash when one is expected', () => {
  const rec = { success: true, depsHash: 'd', themeHash: 't1' };
  assert.equal( shouldSkip( rec, { expectedDepsHash: 'd', outputExists: true } ), true );
  assert.equal( shouldSkip( rec, { expectedDepsHash: 'd', outputExists: true, expectedThemeHash: 't1' } ), true );
  assert.equal( shouldSkip( rec, { expectedDepsHash: 'd', outputExists: true, expectedThemeHash: 't2' } ), false );
} );
