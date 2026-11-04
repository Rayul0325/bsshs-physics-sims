// Tests for build-matrix record shape, upsert, resume-skip and newSimBase choice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRecord,
  validateRecord,
  validateMatrix,
  upsertRecord,
  shouldSkip,
  chooseNewSimBase
} from '../../tools/lib/matrix.mjs';

const SHA = 'c13a8c7741d95fbd8e37619c66ebcca8686dffe7';
const HASH = 'a'.repeat( 64 );

const base = overrides => makeRecord( {
  id: 'gravity-and-orbits',
  branch: '1.6',
  sourceVersion: '1.6.27',
  simSha: SHA,
  deps: { chipper: SHA },
  depsHash: HASH,
  babelSha: SHA,
  chipperVersion: '2.0.0',
  nodeVersion: 'v24.18.0',
  success: true,
  outputPath: 'gravity-and-orbits/gravity-and-orbits_ko.html',
  buildSeconds: 12.5,
  ...overrides
} );

test( 'makeRecord produces a record that validates', () => {
  const r = base();
  assert.deepEqual( validateRecord( r ), [] );
  assert.equal( r.error, null );
  assert.deepEqual( r.overlays, [] );
  assert.match( r.builtAt, /^\d{4}-\d{2}-\d{2}T/ );
} );

test( 'a failed record needs an error and no output path', () => {
  const bad = base( { success: false, outputPath: 'x.html', error: null } );
  const errors = validateRecord( bad );
  assert.ok( errors.some( e => /error/.test( e ) ) );
  assert.ok( errors.some( e => /outputPath/.test( e ) ) );
  assert.deepEqual( validateRecord( base( { success: false, outputPath: null, error: 'boom' } ) ), [] );
} );

test( 'validateRecord flags missing or mistyped fields', () => {
  const r = base();
  delete r.simSha;
  r.buildSeconds = '3';
  const errors = validateRecord( r );
  assert.ok( errors.some( e => /simSha/.test( e ) ) );
  assert.ok( errors.some( e => /buildSeconds/.test( e ) ) );
} );

test( 'upsertRecord replaces by id and keeps the sims order', () => {
  const sims = [ { id: 'a' }, { id: 'b' }, { id: 'c' } ];
  let m = { sims: [] };
  m = upsertRecord( m, base( { id: 'c' } ), sims );
  m = upsertRecord( m, base( { id: 'a' } ), sims );
  m = upsertRecord( m, base( { id: 'c', buildSeconds: 99 } ), sims );
  assert.deepEqual( m.sims.map( r => r.id ), [ 'a', 'c' ] );
  assert.equal( m.sims[ 1 ].buildSeconds, 99 );
} );

test( 'validateMatrix demands one row per sim and a newSimBase', () => {
  const sims = [ { id: 'a', branch: '1.6' }, { id: 'b', branch: '1.6' } ];
  const partial = { sims: [ base( { id: 'a' } ) ] };
  const errors = validateMatrix( partial, sims );
  assert.ok( errors.some( e => /2 rows/.test( e ) || /missing/.test( e ) ) );
  assert.ok( errors.some( e => /newSimBase/.test( e ) ) );
  const full = {
    sims: [ base( { id: 'a' } ), base( { id: 'b' } ) ],
    newSimBase: { id: 'a', reason: 'r', deps: { chipper: SHA }, depsHash: HASH }
  };
  assert.deepEqual( validateMatrix( full, sims ), [] );
} );

test( 'shouldSkip only skips a successful record with the same deps hash and an existing output', () => {
  const r = base();
  assert.equal( shouldSkip( r, { expectedDepsHash: HASH, outputExists: true } ), true );
  assert.equal( shouldSkip( r, { expectedDepsHash: HASH, outputExists: false } ), false );
  assert.equal( shouldSkip( r, { expectedDepsHash: 'b'.repeat( 64 ), outputExists: true } ), false );
  assert.equal( shouldSkip( r, { expectedDepsHash: HASH, outputExists: true, force: true } ), false );
  assert.equal( shouldSkip( base( { success: false, outputPath: null, error: 'x' } ), { expectedDepsHash: HASH, outputExists: true } ), false );
  assert.equal( shouldSkip( undefined, { expectedDepsHash: HASH, outputExists: true } ), false );
} );

test( 'chooseNewSimBase picks the newest library set among successful builds', () => {
  const pick = chooseNewSimBase( [
    { id: 'old', success: true, libraryDate: '2024-01-01T00:00:00Z', releaseDate: '2026-05-01T00:00:00Z' },
    { id: 'newest-failed', success: false, libraryDate: '2026-01-01T00:00:00Z', releaseDate: '2026-05-01T00:00:00Z' },
    { id: 'new-b', success: true, libraryDate: '2025-06-01T00:00:00Z', releaseDate: '2026-04-01T00:00:00Z' },
    { id: 'new-a', success: true, libraryDate: '2025-06-01T00:00:00Z', releaseDate: '2026-04-01T00:00:00Z' },
    { id: 'new-c', success: true, libraryDate: '2025-06-01T00:00:00Z', releaseDate: '2026-03-01T00:00:00Z' }
  ] );
  assert.equal( pick.id, 'new-a' );
} );

test( 'chooseNewSimBase returns null when nothing succeeded', () => {
  assert.equal( chooseNewSimBase( [ { id: 'x', success: false, libraryDate: '2025-01-01T00:00:00Z' } ] ), null );
} );
