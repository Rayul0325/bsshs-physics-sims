// Pure helpers for PhET dependencies.json files.
import { createHash } from 'node:crypto';

const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Sibling directory names whose GitHub repository has a different name.
 * PhET checks out the `perennial` repo a second time as `perennial-alias`.
 * @type {Record<string, string>}
 */
const REMOTE_ALIASES = { 'perennial-alias': 'perennial' };

/**
 * Parses a dependencies.json document into a sibling-repo -> SHA map.
 * The "comment" key is metadata and is dropped.
 * @param {string|object} input - raw JSON text or the parsed object
 * @returns {Record<string, string>}
 */
export function parseDependencies( input ) {
  const doc = typeof input === 'string' ? JSON.parse( input ) : input;
  if ( !doc || typeof doc !== 'object' || Array.isArray( doc ) ) {
    throw new Error( 'dependencies.json must be a JSON object' );
  }
  /** @type {Record<string, string>} */
  const map = {};
  for ( const [ repo, entry ] of Object.entries( doc ) ) {
    if ( repo === 'comment' ) { continue; }
    if ( !REPO_RE.test( repo ) ) {
      throw new Error( `invalid repo name in dependencies.json: ${JSON.stringify( repo )}` );
    }
    const sha = entry && typeof entry === 'object' ? entry.sha : undefined;
    if ( typeof sha !== 'string' || !SHA_RE.test( sha ) ) {
      throw new Error( `invalid or missing sha for ${repo}: ${JSON.stringify( sha )}` );
    }
    map[ repo ] = sha;
  }
  return map;
}

/**
 * Extracts the build timestamp from a dependencies.json comment such as
 * "# gravity-and-orbits 1.6.27 Fri Mar 27 2026 15:38:53 GMT-0600 (Mountain Daylight Time)".
 * @param {string|undefined} comment
 * @returns {Date|null}
 */
export function releaseDateFromComment( comment ) {
  if ( typeof comment !== 'string' ) { return null; }
  const m = comment.match( /([A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4})/ );
  if ( !m ) { return null; }
  const d = new Date( m[ 1 ] );
  return Number.isNaN( d.getTime() ) ? null : d;
}

/**
 * Extracts the released version for `repo` from a dependencies.json comment.
 * @param {string|undefined} comment
 * @param {string} repo
 * @returns {string|null}
 */
export function versionFromComment( comment, repo ) {
  if ( typeof comment !== 'string' ) { return null; }
  const m = comment.match( /^#\s+(\S+)\s+(\d+\.\d+\.\d+(?:-[\w.]+)?)/ );
  return m && m[ 1 ] === repo ? m[ 2 ] : null;
}

/**
 * GitHub repository name (under phetsims/) for a sibling directory name.
 * @param {string} dir
 * @returns {string}
 */
export function remoteRepoFor( dir ) {
  return REMOTE_ALIASES[ dir ] || dir;
}

/**
 * Stable sha256 over a repo -> SHA map (key order does not matter).
 * @param {Record<string, string>} map
 * @returns {string}
 */
export function depsHash( map ) {
  const lines = Object.keys( map ).sort().map( k => `${k} ${map[ k ]}` );
  return createHash( 'sha256' ).update( lines.join( '\n' ) ).digest( 'hex' );
}

/**
 * PhET-iO repos are proprietary and not on public GitHub. They are only needed for the
 * phet-io brand, so an adapted-from-phet build skips them.
 * @param {string} dir
 * @returns {boolean}
 */
export function isPrivatePhetioRepo( dir ) {
  return dir === 'studio' || dir === 'phet-io' || dir.startsWith( 'phet-io-' );
}
