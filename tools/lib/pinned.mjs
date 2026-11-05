// Read-only access to the pinned sources through the bare git mirrors (no checkout, nothing written).
// Used by the art mapper, the per-sim hash, the color inventory and the V11 original-art comparison.
import { execFile } from 'node:child_process';
import { mirrorPath } from './paths.mjs';
import { remoteRepoFor } from './deps.mjs';

const MAX = 512 * 1024 * 1024;

/** @type {Map<string, Promise<string[]>>} */
const trees = new Map();
/** @type {Map<string, Promise<Buffer|null>>} */
const blobs = new Map();

/** @param {string} dir sibling directory name @returns {string} mirror path */
const mirrorOf = dir => mirrorPath( remoteRepoFor( dir ) );

/**
 * Every file path of a repo at a pinned SHA (cached per process).
 * @param {string} dir - sibling directory name in the slot (`scenery-phet`)
 * @param {string} sha
 * @returns {Promise<string[]>} repo-relative paths; empty when the mirror or commit is missing
 */
export function listTree( dir, sha ) {
  const key = `${dir}@${sha}`;
  if ( !trees.has( key ) ) {
    trees.set( key, new Promise( resolve => {
      execFile( 'git', [ '-C', mirrorOf( dir ), 'ls-tree', '-r', '--name-only', '-z', sha ], { encoding: 'buffer', maxBuffer: MAX },
        ( err, out ) => resolve( err ? [] : out.toString( 'utf8' ).split( '\0' ).filter( Boolean ) ) );
    } ) );
  }
  return trees.get( key );
}

/**
 * One file at a pinned SHA (cached per process).
 * @param {string} dir
 * @param {string} sha
 * @param {string} file
 * @returns {Promise<Buffer|null>} null when the file does not exist at that commit
 */
export function readBlob( dir, sha, file ) {
  const key = `${dir}@${sha}:${file}`;
  if ( !blobs.has( key ) ) {
    blobs.set( key, new Promise( resolve => {
      execFile( 'git', [ '-C', mirrorOf( dir ), 'show', `${sha}:${file}` ], { encoding: 'buffer', maxBuffer: MAX },
        ( err, out ) => resolve( err ? null : out ) );
    } ) );
  }
  return blobs.get( key );
}
