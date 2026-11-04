// Loading and validation of data/sims.json, the single source of the 63-sim list.
import { readFile } from 'node:fs/promises';
import { SIMS_JSON } from './paths.mjs';

export const EXPECTED_SIM_COUNT = 63;

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BRANCH_RE = /^\d+\.\d+$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

/**
 * @typedef {{ id: string, branch: string, version: string }} SimEntry
 */

/**
 * Validates the pinned sim table. Returns a list of human-readable problems (empty = valid).
 * @param {unknown} sims
 * @param {number} [expectedCount]
 * @returns {string[]}
 */
export function validateSims( sims, expectedCount = EXPECTED_SIM_COUNT ) {
  if ( !Array.isArray( sims ) ) { return [ 'sims.json must be an array' ]; }
  const errors = [];
  if ( sims.length !== expectedCount ) {
    errors.push( `expected ${expectedCount} sims, found ${sims.length}` );
  }
  const seen = new Set();
  sims.forEach( ( s, i ) => {
    const label = s && typeof s.id === 'string' ? s.id : `#${i}`;
    if ( !s || typeof s !== 'object' ) { errors.push( `entry ${label} is not an object` ); return; }
    if ( typeof s.id !== 'string' || !ID_RE.test( s.id ) ) { errors.push( `entry ${label}: invalid id` ); }
    if ( seen.has( s.id ) ) { errors.push( `duplicate id ${label}` ); }
    seen.add( s.id );
    if ( typeof s.branch !== 'string' || !BRANCH_RE.test( s.branch ) ) {
      errors.push( `entry ${label}: branch must be MAJOR.MINOR, got ${JSON.stringify( s.branch )}` );
    }
    if ( typeof s.version !== 'string' || !VERSION_RE.test( s.version ) ||
         ( typeof s.branch === 'string' && !s.version.startsWith( `${s.branch}.` ) ) ) {
      errors.push( `entry ${label}: version ${JSON.stringify( s.version )} must be MAJOR.MINOR.PATCH on branch ${s.branch}` );
    }
  } );
  return errors;
}

/**
 * Reads and validates data/sims.json. Throws when invalid.
 * @param {string} [file]
 * @returns {Promise<SimEntry[]>}
 */
export async function loadSims( file = SIMS_JSON ) {
  const sims = JSON.parse( await readFile( file, 'utf8' ) );
  const errors = validateSims( sims );
  if ( errors.length ) { throw new Error( `invalid ${file}:\n  ${errors.join( '\n  ' )}` ); }
  return sims;
}

/**
 * Resolves CLI ids against the table (all sims when `ids` is empty).
 * @param {SimEntry[]} sims
 * @param {string[]} ids
 * @returns {SimEntry[]}
 */
export function selectSims( sims, ids ) {
  if ( !ids.length ) { return sims; }
  return ids.map( id => {
    const s = sims.find( x => x.id === id );
    if ( !s ) { throw new Error( `unknown sim id: ${id} (not in data/sims.json)` ); }
    return s;
  } );
}
