// Spec 3.5/3.6 + V5 bullet 3 (invariant 6): a feature that fails the V3 physics check leaves the public
// build. A new sim leaves the site whole; a PhET exam sim ships without its drawer. Listed in the V5
// group of tools/lib/verify-core.mjs TEST_GROUPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeResult, exclusionsFromV3, exclusionSiteArgs, siteNeedsRebuild, buildCount, TEST_GROUPS } from '../../tools/lib/verify-core.mjs';
import { DRAWER_MARKER_START } from '../../drawer/inject.mjs';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );

test( 'V5 exclusion rule: a failing NEW sim leaves the site whole, a failing PhET exam sim loses only its drawer', () => {
  const newIds = [ 'bsshs-laser', 'bsshs-compton' ];
  const v3 = [ { id: 'bsshs-laser', ok: false }, { id: 'bsshs-compton', ok: true }, { id: 'generator', ok: false }, { id: 'bending-light', ok: true } ];
  const ex = exclusionsFromV3( v3, newIds );
  assert.deepEqual( ex.map( e => [ e.id, e.kind ] ), [ [ 'bsshs-laser', 'sim' ], [ 'generator', 'drawer' ] ] );
  assert.match( ex[ 0 ].reason, /3\.6/ );
  assert.match( ex[ 1 ].reason, /3\.5/ );
  assert.deepEqual( exclusionsFromV3( v3.map( r => ( { ...r, ok: true } ) ), newIds ), [] );
  assert.deepEqual( exclusionSiteArgs( ex ), { exclude: [ 'bsshs-laser' ], noDrawer: [ 'generator' ] } );
  assert.deepEqual( exclusionSiteArgs( [ { id: 'old', reason: 'no kind (older exclusions.json)' } ] ), { exclude: [ 'old' ], noDrawer: [] } );
} );

test( 'V5 exclusion rule: V1 counts a whole-sim exclusion as missing, but a drawer-only exclusion stays published', () => {
  const expected = [ 'generator', 'bsshs-laser', 'bsshs-compton' ];
  const ex = exclusionsFromV3( [ { id: 'bsshs-laser', ok: false }, { id: 'generator', ok: false } ], [ 'bsshs-laser', 'bsshs-compton' ] );
  const counted = buildCount( { expected, built: expected, published: [ 'generator', 'bsshs-compton' ], excluded: ex } );
  assert.equal( counted.passed, 2 );
  assert.equal( counted.total, 3 );
  assert.equal( makeResult( 'V1', counted ).ok, false, 'an excluded sim never passes V1 silently' );
  assert.match( counted.failures[ 0 ].reason, /공개 제외/ );
  assert.equal( counted.failures.length, 1, 'the drawer-only exclusion is not a missing sim' );
  const all = buildCount( { expected, built: expected, published: expected, excluded: [] } );
  assert.equal( makeResult( 'V1', all ).ok, true );
  const missing = buildCount( { expected, built: [ 'generator' ], published: expected, excluded: [] } );
  assert.equal( missing.passed, 1 );
  const extra = buildCount( { expected, built: expected, published: [ ...expected, 'stray' ], excluded: [] } );
  assert.equal( makeResult( 'V1', extra ).ok, false );
} );

test( 'V5 exclusion rule: the site is rebuilt only while an excluded feature is still published', () => {
  const ex = [ { id: 'a', kind: 'sim' }, { id: 'b', kind: 'drawer' } ];
  const pub = map => id => map[ id ] || { exists: false, hasDrawer: false };
  assert.equal( siteNeedsRebuild( ex, pub( { a: { exists: true, hasDrawer: true } } ) ), true );
  assert.equal( siteNeedsRebuild( ex, pub( { b: { exists: true, hasDrawer: true } } ) ), true, 'PhET sim still carries its drawer' );
  assert.equal( siteNeedsRebuild( ex, pub( { b: { exists: true, hasDrawer: false } } ) ), false, 'already plain' );
  assert.equal( siteNeedsRebuild( ex, pub( {} ) ), false );
  assert.equal( siteNeedsRebuild( [], pub( {} ) ), false );
} );

test( 'V5 exclusion rule: build-site --no-drawer publishes the exam sim as the plain build, otherwise it carries the drawer', () => {
  const tmp = mkdtempSync( path.join( os.tmpdir(), 'bsshs-nodrawer-' ) );
  try {
    mkdirSync( path.join( tmp, 'sims', 'generator' ), { recursive: true } );
    copyFileSync( path.join( ROOT, 'tests/fixtures/drawer/fake-sim.html' ), path.join( tmp, 'sims', 'generator', 'generator_ko.html' ) );
    const run = extra => {
      const out = path.join( tmp, extra.includes( '--no-drawer' ) ? 'plain' : 'drawer' );
      const r = spawnSync( process.execPath, [ path.join( ROOT, 'site/build-site.mjs' ), '--sims-dir', path.join( tmp, 'sims' ), '--out', out,
        '--allow-missing', ...extra ], { encoding: 'utf8' } );
      assert.equal( r.status, 0, r.stderr || r.stdout );
      return { out, summary: JSON.parse( r.stdout.trim().split( '\n' ).pop() ) };
    };
    const withDrawer = run( [] );
    const plain = run( [ '--no-drawer', 'generator' ] );
    const html = d => readFileSync( path.join( d.out, 'sims', 'generator.html' ), 'utf8' );
    assert.ok( html( withDrawer ).includes( DRAWER_MARKER_START ), 'default: exam sim gets its drawer' );
    assert.ok( !html( plain ).includes( DRAWER_MARKER_START ) && !html( plain ).includes( 'bsshs-drawer' ), '--no-drawer: no drawer at all' );
    assert.equal( html( plain ), readFileSync( path.join( tmp, 'sims', 'generator', 'generator_ko.html' ), 'utf8' ), 'the plain build is the themed build, byte for byte' );
    assert.deepEqual( plain.summary.noDrawer, [ 'generator' ] );
    assert.deepEqual( readdirSync( path.join( plain.out, 'sims' ) ), [ 'generator.html' ], 'the sim is still published' );
  }
  finally { rmSync( tmp, { recursive: true, force: true } ); }
} );

test( 'V5 gate: this file is part of the V5 test group, so "V5 n/n" covers bullet 3 (a failing feature leaves the build)', () => {
  assert.ok( TEST_GROUPS.V5.files.includes( 'tests/verify/exclusions.test.mjs' ) );
} );
