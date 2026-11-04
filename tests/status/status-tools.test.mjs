// The approval record tools (spec 3.5): approve stores the current physics hash, set-status never approves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { approve, setStatus, examIds } from '../../tools/lib/status-file.mjs';
import { resolveStatus, loadStatusFile } from '../../drawer/status.mjs';
import { physicsHash } from '../../drawer/hash.mjs';

const ids = [ 'a-sim', 'b-sim' ];
const tmpFile = () => {
  const f = path.join( mkdtempSync( path.join( os.tmpdir(), 'bsshs-status-' ) ), 'status.json' );
  writeFileSync( f, '{}\n' );
  return f;
};

test( 'approve records 확인 완료 with the hash; a changed hash shows 확인 중', () => {
  const file = tmpFile();
  approve( 'a-sim', { file, ids, date: '2026-11-04', memo: 'm', hash: () => 'a'.repeat( 64 ) } );
  const s = loadStatusFile( file );
  assert.deepEqual( s[ 'a-sim' ], { status: '확인 완료', date: '2026-11-04', memo: 'm', approvedHash: 'a'.repeat( 64 ) } );
  assert.equal( resolveStatus( s[ 'a-sim' ], 'a'.repeat( 64 ) ).state, '확인 완료' );
  assert.equal( resolveStatus( s[ 'a-sim' ], 'b'.repeat( 64 ) ).state, '확인 중' );
} );

test( 'set-status writes 수정 중 / 확인 중, drops the approval hash, refuses 확인 완료 and unknown ids', () => {
  const file = tmpFile();
  approve( 'a-sim', { file, ids, date: '2026-11-04', hash: () => 'c'.repeat( 64 ) } );
  setStatus( 'a-sim', '수정 중', { file, ids, date: '2026-11-05', memo: '오류 지적' } );
  const s = JSON.parse( readFileSync( file, 'utf8' ) );
  assert.equal( s[ 'a-sim' ].status, '수정 중' );
  assert.ok( !( 'approvedHash' in s[ 'a-sim' ] ) );
  assert.throws( () => setStatus( 'a-sim', '확인 완료', { file, ids } ), /approve/ );
  assert.throws( () => setStatus( 'zzz', '확인 중', { file, ids } ), /exam-scope/ );
  assert.throws( () => approve( 'zzz', { file, ids, hash: () => 'd'.repeat( 64 ) } ), /exam-scope/ );
} );

test( 'the committed status file registers every exam sim as 확인 중', () => {
  const s = loadStatusFile();
  const exam = examIds();
  assert.deepEqual( Object.keys( s ), exam );
  for ( const id of exam ) {
    assert.equal( s[ id ].status, '확인 중', id );
    assert.ok( !( 'approvedHash' in s[ id ] ), id );
    assert.equal( typeof physicsHash( id ), 'string' );
  }
} );
