// Spec V3 (second check): a tolerance looser than the default needs a 「참고」 note. Pure rule tests, the
// real data of every exam sim, and the wiring into the V3 job of tools/verify.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toleranceNoteProblems } from '../../tools/lib/verify-core.mjs';
import { toleranceNotes, runV3Job } from '../../tools/verify.mjs';
import '../../drawer/core.js';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
const DEFAULT = globalThis.BsshsDrawerCore.DEFAULT_REL_TOL;
const readJson = f => JSON.parse( readFileSync( path.join( ROOT, f ), 'utf8' ) );
const loose = { name: 'loose', params: {}, expect: { rippleVoltage: { value: 1, relTol: 0.06 }, other: { value: 2 } } };
const noted = ( note, key = 'rippleVoltage' ) => ( { formulas: [ { key: 'f', note, variables: [ { key } ] } ] } );

test( 'V3 tolerance notes: the default is the run-cases default (1%)', () => {
  assert.equal( DEFAULT, 0.01 );
} );

test( 'V3 tolerance notes: a loosened tolerance needs a linked formula whose note starts with 참고', () => {
  assert.deepEqual( toleranceNoteProblems( [ loose ], noted( '참고: 근사식이다.' ), DEFAULT ), [] );
  assert.deepEqual( toleranceNoteProblems( [ loose ], noted( '「참고」 근사식이다.' ), DEFAULT ), [] );
  const p = toleranceNoteProblems( [ loose ], noted( undefined ), DEFAULT );
  assert.equal( p.length, 1 );
  assert.match( p[ 0 ], /rippleVoltage/ );
  assert.match( p[ 0 ], /참고/ );
  assert.equal( toleranceNoteProblems( [ loose ], noted( '근사식이다. 참고' ), DEFAULT ).length, 1, 'the note must START with 참고' );
  assert.equal( toleranceNoteProblems( [ loose ], noted( '참고: 근사식이다.', 'someOtherKey' ), DEFAULT ).length, 1, 'the note must be on a formula that has this measurement' );
  assert.equal( toleranceNoteProblems( [ loose ], null, DEFAULT ).length, 1 );
  assert.equal( toleranceNoteProblems( [ loose ], { formulas: [] }, DEFAULT ).length, 1 );
} );

test( 'V3 tolerance notes: tight or default tolerances need no note; one problem per loosened key', () => {
  const tight = { name: 't', params: {}, expect: { a: { value: 1, relTol: 0.01 }, b: { value: 1, relTol: 1e-6 }, c: { value: 0 }, d: { value: 3 } } };
  assert.deepEqual( toleranceNoteProblems( [ tight ], null, DEFAULT ), [] );
  assert.equal( toleranceNoteProblems( [ loose, { ...loose, name: 'again' } ], null, DEFAULT ).length, 1 );
  assert.equal( toleranceNoteProblems( [ { name: 'x', params: {}, expect: { a: { value: 1, relTol: 0.011 } } } ], null, DEFAULT ).length, 1 );
} );

test( 'V3 tolerance notes: every exam sim of the real data passes (semiconductor 6%, wave-interference 4% are noted)', () => {
  const ids = readJson( 'data/exam-scope.json' ).ids;
  let loosened = 0;
  for ( const id of ids ) {
    const cases = readJson( `adapters/${id}/cases.json` );
    loosened += cases.filter( c => Object.values( c.expect ).some( x => x.relTol > DEFAULT ) ).length;
    assert.deepEqual( toleranceNoteProblems( cases, readJson( `data/lessons/${id}.json` ), DEFAULT ), [], id );
  }
  assert.ok( loosened >= 7, `expected the known loosened cases to be seen, saw ${loosened}` );
} );

test( 'V3 gate wiring: the V3 job of tools/verify.mjs fails a sim whose loosened tolerance has no note', async () => {
  const tmp = mkdtempSync( path.join( os.tmpdir(), 'bsshs-tolnote-' ) );
  try {
    const cases = path.join( tmp, 'cases.json' );
    const prep = { get: () => ( { ok: false, error: 'prep-stub' } ) }; // no browser: the cases step ends at once
    const ctx = {};
    writeFileSync( cases, JSON.stringify( [ { name: 'n', params: {}, expect: { unnotedKey: { value: 1, relTol: 0.2 } } } ] ) );
    const o = { cases: { generator: cases } };
    assert.equal( toleranceNotes( o, 'generator' ).length, 1 );
    const bad = await runV3Job( o, ctx, prep, 'generator' );
    assert.equal( bad.ok, false );
    assert.equal( bad.toleranceNotes.length, 1 );
    assert.match( bad.error, /prep-stub/ );
    assert.match( bad.error, /unnotedKey/ );
    // The real cases of wave-interference carry a noted 4%: the note check adds nothing.
    assert.deepEqual( toleranceNotes( { cases: {} }, 'wave-interference' ), [] );
    const real = await runV3Job( { cases: {} }, ctx, prep, 'wave-interference' );
    assert.equal( real.error, 'prep-stub' );
    assert.equal( real.toleranceNotes, undefined );
  }
  finally { rmSync( tmp, { recursive: true, force: true } ); }
} );
