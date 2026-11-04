// V3 runner (tools/run-cases.mjs) on the fixture page with the fake adapter: passing cases, the 1%
// default, the absolute tolerance for 0, and a deliberately failing case (exit 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, FIX, injectTo } from './helpers.mjs';
import { parseRunArgs } from '../../tools/run-cases.mjs';

const run = promisify( execFile );
const OPTS = { id: 'fake-sim', repoRoot: ROOT, adapterDir: path.join( FIX, 'adapters/fake' ), lessonsFile: path.join( FIX, 'lessons/fake-sim.json' ) };

async function tool( args ) {
  try { const { stdout } = await run( process.execPath, [ 'tools/run-cases.mjs', ...args ], { cwd: ROOT, timeout: 120000 } ); return { code: 0, out: stdout }; }
  catch ( e ) { if ( typeof e.code !== 'number' ) { throw e; } return { code: e.code, out: e.stdout }; }
}
const lines = out => out.trim().split( '\n' ).map( l => JSON.parse( l ) );

test( 'parseRunArgs reads the flags', () => {
  const o = parseRunArgs( [ 'a.html', 'gen', '--width', '390', '--rel-tol', '0.02', '--abs-tol=1e-6', '--cases', 'c.json' ] );
  assert.deepEqual( [ o.html, o.id, o.width, o.relTol, o.absTol, o.cases ], [ 'a.html', 'gen', 390, 0.02, 1e-6, 'c.json' ] );
  assert.equal( parseRunArgs( [ 'a.html', 'gen' ] ).relTol, 0.01 );
  assert.throws( () => parseRunArgs( [ 'a.html' ] ), /usage/ );
} );

test( 'the adapter\'s own cases pass: exit 0, one JSON line per case plus a summary', { timeout: 120000 }, async () => {
  const html = injectTo( path.join( FIX, 'fake-sim.html' ), 'fake-cases.html', OPTS );
  const r = await tool( [ html, 'fake-sim', '--adapter-dir', OPTS.adapterDir ] );
  assert.equal( r.code, 0, r.out );
  const out = lines( r.out );
  assert.deepEqual( out.map( l => l.type ), [ 'case', 'summary' ] );
  assert.equal( out[ 0 ].ok, true );
  assert.equal( out[ 1 ].passed, 1 );
} );

test( 'mixed cases: passes, default 1%, absolute zero, and a deliberate failure → exit 1', { timeout: 120000 }, async () => {
  const html = injectTo( path.join( FIX, 'fake-sim.html' ), 'fake-cases.html', OPTS );
  const r = await tool( [ html, 'fake-sim', '--cases', path.join( FIX, 'cases-mixed.json' ), '--width', '390' ] );
  assert.equal( r.code, 1, r.out );
  const out = lines( r.out );
  const cases = out.filter( l => l.type === 'case' );
  assert.deepEqual( cases.map( c => c.ok ), [ true, true, true, false ] );
  assert.equal( cases[ 1 ].results[ 0 ].tol, 0.01 );
  assert.equal( cases[ 2 ].results[ 0 ].mode, 'absolute' );
  assert.equal( cases[ 2 ].results[ 0 ].actual, 0 );
  const bad = cases[ 3 ].results[ 0 ];
  assert.equal( bad.ok, false );
  assert.ok( Math.abs( bad.actual - 1239.84198 / 400 ) < 1e-9, 'each case starts from a fresh page and applies its own params' );
  assert.ok( cases.every( c => c.settled ) );
  const sum = out.at( -1 );
  assert.deepEqual( [ sum.type, sum.ok, sum.passed, sum.failed, sum.viewport.innerWidth ], [ 'summary', false, 3, 1, 390 ] );
} );

test( 'a wrong sim id is a usage error (exit 2)', { timeout: 120000 }, async () => {
  const html = injectTo( path.join( FIX, 'fake-sim.html' ), 'fake-cases.html', OPTS );
  const r = await tool( [ html, 'generator', '--cases', path.join( FIX, 'cases-mixed.json' ) ] );
  assert.equal( r.code, 2, r.out );
} );
