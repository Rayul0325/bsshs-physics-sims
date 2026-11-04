// Verification status of the 14 exam sims (spec 3.5): data/verification-status.json ->
// what the drawer shows. Labels never carry a teacher name; the memo stays internal.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './hash.mjs';

export const STATUS_STATES = [ '확인 중', '확인 완료', '수정 중' ];
export const STATUS_LABELS = { '확인 중': '선생님 확인 중', '확인 완료': '선생님 확인 완료', '수정 중': '수정 중' };
export const STATUS_FILE = path.join( REPO_ROOT, 'data', 'verification-status.json' );

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Problems in a verification-status object (empty = valid).
 * @param {unknown} file
 * @returns {string[]}
 */
export function validateStatusFile( file ) {
  const errors = [];
  if ( !file || typeof file !== 'object' || Array.isArray( file ) ) { return [ 'status file must be an object keyed by sim id' ]; }
  for ( const [ id, e ] of Object.entries( file ) ) {
    if ( !e || typeof e !== 'object' ) { errors.push( `${id}: entry must be an object` ); continue; }
    if ( !STATUS_STATES.includes( e.status ) ) { errors.push( `${id}: status must be one of ${STATUS_STATES.join( ' | ' )}` ); }
    if ( typeof e.date !== 'string' || !DATE_RE.test( e.date ) ) { errors.push( `${id}: date must be YYYY-MM-DD` ); }
    if ( 'memo' in e && typeof e.memo !== 'string' ) { errors.push( `${id}: memo must be a string` ); }
    if ( e.status === '확인 완료' ) {
      if ( typeof e.approvedHash !== 'string' || !HASH_RE.test( e.approvedHash ) ) { errors.push( `${id}: 확인 완료 needs approvedHash (sha256 hex)` ); }
    }
    else if ( 'approvedHash' in e ) { errors.push( `${id}: approvedHash only belongs to 확인 완료` ); }
  }
  return errors;
}

/**
 * What to display for one sim.
 * @param {{ status: string, date: string, memo?: string, approvedHash?: string }|undefined} entry
 * @param {string} currentHash - physicsHash(id)
 * @returns {{ state: string, label: string, date: string|null, stale: boolean }}
 */
export function resolveStatus( entry, currentHash ) {
  const show = ( state, date, stale = false ) => ( { state, label: STATUS_LABELS[ state ], date: date || null, stale } );
  if ( !entry || !STATUS_STATES.includes( entry.status ) ) { return show( '확인 중', null ); }
  if ( entry.status === '확인 완료' ) {
    return entry.approvedHash === currentHash ? show( '확인 완료', entry.date ) : show( '확인 중', null, true );
  }
  return show( entry.status, entry.date );
}

/**
 * Reads data/verification-status.json (or another file); a missing file is an empty object.
 * @param {string} [file]
 * @returns {Record<string, any>}
 */
export function loadStatusFile( file = STATUS_FILE ) {
  if ( !existsSync( file ) ) { return {}; }
  const json = JSON.parse( readFileSync( file, 'utf8' ) );
  const errors = validateStatusFile( json );
  if ( errors.length ) { throw new Error( `invalid ${file}:\n  ${errors.join( '\n  ' )}` ); }
  return json;
}
