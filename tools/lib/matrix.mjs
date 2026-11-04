// data/build-matrix.json: one record per sim describing exactly what was built and how.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { MATRIX_JSON } from './paths.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * @typedef {object} MatrixRecord
 * @property {string} id
 * @property {string} branch - pinned release branch
 * @property {string} sourceVersion - package.json version found on that branch
 * @property {string} simSha - release-branch HEAD commit of phetsims/<id>
 * @property {Record<string,string>} deps - sibling repo -> pinned SHA (from dependencies.json)
 * @property {string} depsHash - sha256 over deps
 * @property {string|null} babelSha - babel commit used for translations (not pinned by PhET)
 * @property {string|null} chipperVersion
 * @property {string|null} nodeVersion
 * @property {boolean} success
 * @property {string|null} outputPath - relative to the build dir
 * @property {number} buildSeconds
 * @property {string|null} error
 * @property {string[]} overlays - build-time edits applied to the throwaway checkout (empty = unmodified)
 * @property {string[]} flags - grunt arguments used
 * @property {string|null} logPath
 * @property {string} builtAt
 */

/**
 * Builds a record with defaults for optional fields.
 * @param {Partial<MatrixRecord>} fields
 * @returns {MatrixRecord}
 */
export function makeRecord( fields ) {
  return /** @type {MatrixRecord} */ ( {
    error: null,
    overlays: [],
    flags: [],
    logPath: null,
    babelSha: null,
    chipperVersion: null,
    nodeVersion: null,
    builtAt: new Date().toISOString(),
    ...fields
  } );
}

/**
 * @param {any} r
 * @returns {string[]} problems (empty = valid)
 */
export function validateRecord( r ) {
  const errors = [];
  const need = ( key, ok, what ) => { if ( !ok ) { errors.push( `${r && r.id || '?'}: ${key} ${what}` ); } };
  if ( !r || typeof r !== 'object' ) { return [ 'record is not an object' ]; }
  need( 'id', typeof r.id === 'string' && r.id.length > 0, 'must be a non-empty string' );
  need( 'branch', typeof r.branch === 'string', 'must be a string' );
  need( 'sourceVersion', typeof r.sourceVersion === 'string', 'must be a string' );
  need( 'simSha', typeof r.simSha === 'string' && SHA_RE.test( r.simSha ), 'must be a 40-hex SHA' );
  need( 'deps', r.deps && typeof r.deps === 'object' && Object.values( r.deps ).every( s => SHA_RE.test( s ) ), 'must map repos to SHAs' );
  need( 'depsHash', typeof r.depsHash === 'string' && HASH_RE.test( r.depsHash ), 'must be a sha256 hex' );
  need( 'success', typeof r.success === 'boolean', 'must be boolean' );
  need( 'buildSeconds', typeof r.buildSeconds === 'number' && r.buildSeconds >= 0, 'must be a non-negative number' );
  need( 'overlays', Array.isArray( r.overlays ), 'must be an array' );
  need( 'nodeVersion', r.nodeVersion === null || typeof r.nodeVersion === 'string', 'must be string or null' );
  if ( r.success === true ) {
    need( 'outputPath', typeof r.outputPath === 'string' && r.outputPath.endsWith( '.html' ), 'must be an .html path on success' );
    need( 'error', r.error === null, 'must be null on success' );
  }
  if ( r.success === false ) {
    need( 'error', typeof r.error === 'string' && r.error.length > 0, 'must describe the failure' );
    need( 'outputPath', r.outputPath === null, 'must be null on failure' );
  }
  return errors;
}

/**
 * Validates the whole matrix against the sim table.
 * @param {any} matrix
 * @param {{id: string, branch: string}[]} sims
 * @returns {string[]}
 */
export function validateMatrix( matrix, sims ) {
  const errors = [];
  const rows = matrix && Array.isArray( matrix.sims ) ? matrix.sims : [];
  if ( rows.length !== sims.length ) { errors.push( `matrix must have ${sims.length} rows, found ${rows.length}` ); }
  const byId = new Map( rows.map( r => [ r.id, r ] ) );
  for ( const s of sims ) {
    const r = byId.get( s.id );
    if ( !r ) { errors.push( `missing row for ${s.id}` ); continue; }
    if ( r.branch !== s.branch ) { errors.push( `${s.id}: branch ${r.branch} != pinned ${s.branch}` ); }
    errors.push( ...validateRecord( r ) );
  }
  const b = matrix && matrix.newSimBase;
  if ( !b || typeof b.id !== 'string' || typeof b.reason !== 'string' || !b.deps || !HASH_RE.test( b.depsHash || '' ) ) {
    errors.push( 'newSimBase must have id, reason, deps and depsHash' );
  }
  return errors;
}

/**
 * Inserts or replaces a record by id; rows are kept in data/sims.json order.
 * @param {{sims: MatrixRecord[]}} matrix
 * @param {MatrixRecord} record
 * @param {{id: string}[]} sims
 * @returns {object} new matrix object
 */
export function upsertRecord( matrix, record, sims ) {
  const order = new Map( sims.map( ( s, i ) => [ s.id, i ] ) );
  const rows = ( matrix.sims || [] ).filter( r => r.id !== record.id ).concat( [ record ] );
  rows.sort( ( a, b ) => ( order.get( a.id ) ?? 1e9 ) - ( order.get( b.id ) ?? 1e9 ) );
  return { ...matrix, sims: rows };
}

/**
 * Resume logic: skip a sim only if its last record succeeded with the same dependency set
 * and the output file is still there. Variant builds (theme/brand) also pass the hash of what they
 * inject; a record built with other tokens or rules is rebuilt.
 * @param {MatrixRecord|undefined} record
 * @param {{ expectedDepsHash: string, outputExists: boolean, force?: boolean, expectedThemeHash?: string }} ctx
 * @returns {boolean}
 */
export function shouldSkip( record, { expectedDepsHash, outputExists, force = false, expectedThemeHash } ) {
  if ( force || !record ) { return false; }
  if ( expectedThemeHash !== undefined && record.themeHash !== expectedThemeHash ) { return false; }
  return record.success === true && record.depsHash === expectedDepsHash && outputExists;
}

/**
 * Picks the dependency set for new original sims: the newest library code (libraryDate)
 * among successful builds; ties broken by newer release date, then id.
 * @param {{id: string, success: boolean, libraryDate: string, releaseDate?: string}[]} candidates
 * @returns {object|null}
 */
export function chooseNewSimBase( candidates ) {
  const ok = candidates.filter( c => c.success && c.libraryDate );
  if ( !ok.length ) { return null; }
  ok.sort( ( a, b ) =>
    Date.parse( b.libraryDate ) - Date.parse( a.libraryDate ) ||
    Date.parse( b.releaseDate || 0 ) - Date.parse( a.releaseDate || 0 ) ||
    a.id.localeCompare( b.id ) );
  return ok[ 0 ];
}

/**
 * @param {string} [file]
 * @returns {Promise<{sims: MatrixRecord[], [k: string]: any}>}
 */
export async function readMatrix( file = MATRIX_JSON ) {
  try {
    return JSON.parse( await readFile( file, 'utf8' ) );
  }
  catch( e ) {
    if ( e.code === 'ENOENT' ) { return { sims: [] }; }
    throw e;
  }
}

/**
 * Atomic write (temp file + rename) so an interrupted run never leaves half a JSON file.
 * @param {object} matrix
 * @param {string} [file]
 */
export async function writeMatrix( matrix, file = MATRIX_JSON ) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile( tmp, JSON.stringify( matrix, null, 2 ) + '\n' );
  await rename( tmp, file );
}
