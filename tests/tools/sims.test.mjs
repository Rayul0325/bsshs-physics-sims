// Tests for data/sims.json validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSims, loadSims, EXPECTED_SIM_COUNT } from '../../tools/lib/sims.mjs';

const mk = n => Array.from( { length: n }, ( _, i ) => ( { id: `sim-${i}`, branch: '1.0', version: `1.0.${i}` } ) );

test( 'the real data/sims.json has 63 valid, unique entries', async () => {
  const sims = await loadSims();
  assert.equal( sims.length, EXPECTED_SIM_COUNT );
  assert.equal( EXPECTED_SIM_COUNT, 63 );
  assert.equal( new Set( sims.map( s => s.id ) ).size, 63 );
  assert.deepEqual( validateSims( sims ), [] );
} );

test( 'a well-formed list of 63 passes', () => {
  assert.deepEqual( validateSims( mk( 63 ) ), [] );
} );

test( 'wrong count is reported', () => {
  assert.ok( validateSims( mk( 62 ) ).some( e => /63/.test( e ) ) );
} );

test( 'duplicate ids are reported', () => {
  const list = mk( 63 );
  list[ 5 ].id = list[ 4 ].id;
  assert.ok( validateSims( list ).some( e => /duplicate/i.test( e ) ) );
} );

test( 'branch must be MAJOR.MINOR and version must extend the branch', () => {
  const list = mk( 63 );
  list[ 0 ].branch = 'main';
  list[ 1 ].version = '2.0.1';
  list[ 2 ].branch = '1.0.3';
  const errors = validateSims( list );
  assert.ok( errors.some( e => e.includes( 'sim-0' ) && /branch/i.test( e ) ) );
  assert.ok( errors.some( e => e.includes( 'sim-1' ) && /version/i.test( e ) ) );
  assert.ok( errors.some( e => e.includes( 'sim-2' ) && /branch/i.test( e ) ) );
} );

test( 'ids must be lowercase kebab-case', () => {
  const list = mk( 63 );
  list[ 3 ].id = '../Escape';
  assert.ok( validateSims( list ).some( e => /id/i.test( e ) ) );
} );

test( 'non-array input is rejected', () => {
  assert.ok( validateSims( { a: 1 } ).length > 0 );
} );
