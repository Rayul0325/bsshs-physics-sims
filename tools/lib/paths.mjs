// Shared filesystem locations. The source cache lives outside any git worktree so that
// every worktree (and later task) reuses the same mirrors and slot checkouts.
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
export const SIMS_JSON = path.join( REPO_ROOT, 'data', 'sims.json' );
export const MATRIX_JSON = path.join( REPO_ROOT, 'data', 'build-matrix.json' );

/** @returns {string} cache root (env BSSHS_CACHE, default ~/.cache/bsshs-physics-sims) */
export function cacheDir() {
  return path.resolve( process.env.BSSHS_CACHE || path.join( homedir(), '.cache', 'bsshs-physics-sims' ) );
}

/** @returns {string} bare mirrors, one per GitHub repo */
export const mirrorsDir = () => path.join( cacheDir(), 'mirrors' );
/** @returns {string} resolved per-sim manifests written by fetch-sources */
export const manifestsDir = () => path.join( cacheDir(), 'manifests' );
/** @returns {string} sibling-checkout slots used by builds */
export const slotsDir = () => path.join( cacheDir(), 'slots' );
/** @returns {string} cached helper tools (grunt-cli) */
export const toolsDir = () => path.join( cacheDir(), 'tools' );

/** @returns {string} build output root (env BSSHS_BUILD_DIR, default <repo>/build) */
export function buildDir() {
  return path.resolve( process.env.BSSHS_BUILD_DIR || path.join( REPO_ROOT, 'build' ) );
}

/**
 * @param {string} repo - GitHub repo name under phetsims/
 * @returns {string}
 */
export const mirrorPath = repo => path.join( mirrorsDir(), `${repo}.git` );
