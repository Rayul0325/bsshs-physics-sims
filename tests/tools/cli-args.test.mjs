// Tests for the build CLI argument parsing and output layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBuildArgs, outputRelPath } from '../../tools/build-sim.mjs';
import { parseArgs as parseFetchArgs } from '../../tools/fetch-sources.mjs';

test( 'parseBuildArgs defaults to Node 24 builds in slot 0 with the brand overlay allowed', () => {
  const o = parseBuildArgs( [ 'pendulum-lab' ] );
  assert.deepEqual( o.ids, [ 'pendulum-lab' ] );
  assert.equal( o.slot, 0 );
  assert.deepEqual( o.nodeMajors, [ 24 ] );
  assert.equal( o.allowBrandOverlay, true );
  assert.equal( o.typeCheck, true );
  assert.equal( o.force, false );
  assert.equal( parseBuildArgs( [ '--no-brand-overlay', 'x' ] ).allowBrandOverlay, false );
} );

test( 'parseBuildArgs reads every flag in both spellings', () => {
  const o = parseBuildArgs( [ '--slot', '3', '--node=24,20', '--jobs', '6', '--allow-brand-overlay', '--no-type-check', '--force', 'a', 'b' ] );
  assert.equal( o.slot, 3 );
  assert.deepEqual( o.nodeMajors, [ 24, 20 ] );
  assert.equal( o.jobs, '6' );
  assert.equal( o.allowBrandOverlay, true );
  assert.equal( o.typeCheck, false );
  assert.equal( o.force, true );
  assert.deepEqual( o.ids, [ 'a', 'b' ] );
  assert.throws( () => parseBuildArgs( [ '--bogus' ] ), /unknown option/ );
  assert.throws( () => parseBuildArgs( [ '--node', 'x' ] ), /--node/ );
} );

test( 'outputRelPath is build/<id>/<id>_ko.html relative to the build dir', () => {
  assert.equal( outputRelPath( 'gravity-and-orbits' ), 'gravity-and-orbits/gravity-and-orbits_ko.html' );
} );

test( 'fetch-sources parseArgs handles --update and --jobs', () => {
  assert.deepEqual( parseFetchArgs( [ '--update', '--jobs=4', 'x' ] ), { update: true, jobs: 4, ids: [ 'x' ] } );
} );
