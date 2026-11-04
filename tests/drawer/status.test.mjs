// V5 verification status (drawer/status.mjs): three states, labels without names, hash mismatch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStatus, validateStatusFile, STATUS_LABELS, STATUS_STATES } from '../../drawer/status.mjs';

const H = 'a'.repeat( 64 );

test( 'three states with the spec labels', () => {
  assert.deepEqual( STATUS_STATES, [ '확인 중', '확인 완료', '수정 중' ] );
  assert.deepEqual( STATUS_LABELS, { '확인 중': '선생님 확인 중', '확인 완료': '선생님 확인 완료', '수정 중': '수정 중' } );
} );

test( 'resolveStatus: approved hash match shows 확인 완료, mismatch shows 확인 중', () => {
  const ok = resolveStatus( { status: '확인 완료', date: '2026-11-04', memo: 'x', approvedHash: H }, H );
  assert.deepEqual( { state: ok.state, label: ok.label, date: ok.date, stale: ok.stale }, { state: '확인 완료', label: '선생님 확인 완료', date: '2026-11-04', stale: false } );
  const stale = resolveStatus( { status: '확인 완료', date: '2026-11-04', memo: '', approvedHash: H }, 'b'.repeat( 64 ) );
  assert.equal( stale.state, '확인 중' );
  assert.equal( stale.label, '선생님 확인 중' );
  assert.equal( stale.stale, true );
} );

test( 'resolveStatus: 수정 중 and 확인 중 pass through; no entry is 확인 중; memo is never exposed', () => {
  assert.equal( resolveStatus( { status: '수정 중', date: '2026-11-01', memo: '김 선생님 메모' }, H ).label, '수정 중' );
  assert.equal( resolveStatus( { status: '확인 중', date: '2026-11-01', memo: '' }, H ).label, '선생님 확인 중' );
  assert.equal( resolveStatus( undefined, H ).state, '확인 중' );
  const r = resolveStatus( { status: '수정 중', date: '2026-11-01', memo: '김 선생님 메모' }, H );
  assert.ok( !( 'memo' in r ), 'memo stays internal' );
  assert.ok( !JSON.stringify( r ).includes( '김' ) );
} );

test( 'validateStatusFile: approvedHash only with 확인 완료, dates are YYYY-MM-DD', () => {
  assert.deepEqual( validateStatusFile( {} ), [] );
  assert.deepEqual( validateStatusFile( { generator: { status: '확인 완료', date: '2026-11-04', memo: '', approvedHash: H } } ), [] );
  assert.ok( validateStatusFile( { generator: { status: '확인 완료', date: '2026-11-04', memo: '' } } ).length > 0 );
  assert.ok( validateStatusFile( { generator: { status: '수정 중', date: '2026-11-04', memo: '', approvedHash: H } } ).length > 0 );
  assert.ok( validateStatusFile( { generator: { status: '승인', date: '2026-11-04', memo: '' } } ).length > 0 );
  assert.ok( validateStatusFile( { generator: { status: '확인 중', date: '11/04', memo: '' } } ).length > 0 );
} );
