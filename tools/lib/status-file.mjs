// Read/modify/write helpers for data/verification-status.json (spec 3.5).
// Only the record tools (tools/approve.mjs, tools/set-status.mjs) write this file.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, physicsHash } from '../../drawer/hash.mjs';
import { STATUS_FILE, loadStatusFile, validateStatusFile } from '../../drawer/status.mjs';

export const EXAM_SCOPE_FILE = path.join( REPO_ROOT, 'data', 'exam-scope.json' );

/** @returns {string[]} the exam-scope sim ids */
export function examIds( file = EXAM_SCOPE_FILE ) {
  return JSON.parse( readFileSync( file, 'utf8' ) ).ids;
}

/** Local date as YYYY-MM-DD. @param {Date} [d] */
export function today( d = new Date() ) {
  const p = n => String( n ).padStart( 2, '0' );
  return `${d.getFullYear()}-${p( d.getMonth() + 1 )}-${p( d.getDate() )}`;
}

/**
 * Writes the status object with ids in exam-scope order, after validating it.
 * @param {Record<string, any>} status
 * @param {{ file?: string, ids?: string[] }} [opts]
 */
export function writeStatusFile( status, opts = {} ) {
  const ids = opts.ids || examIds();
  const ordered = {};
  for ( const id of [ ...ids, ...Object.keys( status ).filter( k => !ids.includes( k ) ).sort() ] ) {
    if ( status[ id ] ) { ordered[ id ] = status[ id ]; }
  }
  const errors = validateStatusFile( ordered );
  if ( errors.length ) { throw new Error( `refusing to write an invalid status file:\n  ${errors.join( '\n  ' )}` ); }
  writeFileSync( opts.file || STATUS_FILE, `${JSON.stringify( ordered, null, 2 )}\n` );
}

/**
 * Marks a sim as approved by the teacher: 확인 완료 with the current physics hash.
 * @param {string} id
 * @param {{ memo?: string, file?: string, ids?: string[], date?: string, hash?: (id: string) => string }} [opts]
 * @returns {{ status: string, date: string, memo: string, approvedHash: string }}
 */
export function approve( id, opts = {} ) {
  const ids = opts.ids || examIds();
  if ( !ids.includes( id ) ) { throw new Error( `${id} is not in data/exam-scope.json` ); }
  const status = loadStatusFile( opts.file || STATUS_FILE );
  const entry = { status: '확인 완료', date: opts.date || today(), memo: opts.memo || '', approvedHash: ( opts.hash || physicsHash )( id ) };
  status[ id ] = entry;
  writeStatusFile( status, opts );
  return entry;
}

/**
 * Sets 확인 중 or 수정 중 (never 확인 완료 — that needs approve()).
 * @param {string} id
 * @param {string} state
 * @param {{ memo?: string, file?: string, ids?: string[], date?: string }} [opts]
 */
export function setStatus( id, state, opts = {} ) {
  const ids = opts.ids || examIds();
  if ( !ids.includes( id ) ) { throw new Error( `${id} is not in data/exam-scope.json` ); }
  if ( state !== '확인 중' && state !== '수정 중' ) { throw new Error( 'state must be 확인 중 or 수정 중 (use tools/approve.mjs for 확인 완료)' ); }
  const status = loadStatusFile( opts.file || STATUS_FILE );
  status[ id ] = { status: state, date: opts.date || today(), memo: opts.memo || '' };
  writeStatusFile( status, opts );
  return status[ id ];
}
