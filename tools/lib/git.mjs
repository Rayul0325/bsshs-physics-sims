// Git operations on the shared mirror cache and on per-slot checkouts.
import { existsSync } from 'node:fs';
import { mkdir, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { run, runOk } from './exec.mjs';
import { mirrorPath, mirrorsDir } from './paths.mjs';

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ADVICE: '0' };

/**
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
export const git = ( args, cwd ) => runOk( 'git', args, { cwd, env: GIT_ENV } );

/** @param {string} repo */
export const remoteUrl = repo => `https://github.com/phetsims/${repo}.git`;

/** In-process lock so two concurrent callers never create/fetch the same mirror at once. */
const inflight = new Map();

/**
 * Ensures a bare mirror of phetsims/<repo> exists (branches + tags only, no PR refs).
 * Creation goes through a temp dir + rename, so an interrupted clone is retried cleanly.
 * Authentication comes from the user's git credential helper (gh), over HTTPS.
 * @param {string} repo
 * @param {{ update?: boolean }} [opts]
 * @returns {Promise<string>} mirror path
 */
export function ensureMirror( repo, opts = {} ) {
  const key = `${repo}|${!!opts.update}`;
  if ( !inflight.has( key ) ) {
    inflight.set( key, ( async () => {
      const dest = mirrorPath( repo );
      if ( existsSync( dest ) ) {
        if ( opts.update ) { await git( [ '-C', dest, 'fetch', '--quiet', '--prune', 'origin' ] ); }
        return dest;
      }
      await mkdir( mirrorsDir(), { recursive: true } );
      const tmp = `${dest}.partial-${process.pid}`;
      await rm( tmp, { recursive: true, force: true } );
      await git( [ 'init', '--quiet', '--bare', tmp ] );
      await git( [ '-C', tmp, 'remote', 'add', 'origin', remoteUrl( repo ) ] );
      await git( [ '-C', tmp, 'config', '--replace-all', 'remote.origin.fetch', '+refs/heads/*:refs/heads/*' ] );
      await git( [ '-C', tmp, 'config', '--add', 'remote.origin.fetch', '+refs/tags/*:refs/tags/*' ] );
      await git( [ '-C', tmp, 'fetch', '--quiet', 'origin' ] );
      await rename( tmp, dest );
      return dest;
    } )().finally( () => inflight.delete( key ) ) );
  }
  return inflight.get( key );
}

/**
 * @param {string} gitDir
 * @param {string} sha
 * @returns {Promise<boolean>}
 */
export async function hasCommit( gitDir, sha ) {
  const r = await run( 'git', [ '-C', gitDir, 'cat-file', '-e', `${sha}^{commit}` ], { env: GIT_ENV } );
  return r.code === 0;
}

/**
 * Makes sure `sha` is present in the mirror: fetch all refs, then (GitHub allows it) the bare SHA.
 * @param {string} repo
 * @param {string} sha
 */
export async function ensureCommit( repo, sha ) {
  const dir = mirrorPath( repo );
  if ( await hasCommit( dir, sha ) ) { return; }
  await git( [ '-C', dir, 'fetch', '--quiet', 'origin' ] );
  if ( await hasCommit( dir, sha ) ) { return; }
  await run( 'git', [ '-C', dir, 'fetch', '--quiet', 'origin', sha ], { env: GIT_ENV } );
  if ( !( await hasCommit( dir, sha ) ) ) {
    throw new Error( `commit ${sha} not found in phetsims/${repo} (not on any public ref)` );
  }
}

/**
 * @param {string} gitDir
 * @param {string} ref
 * @returns {Promise<string|null>}
 */
export async function revParse( gitDir, ref ) {
  const r = await run( 'git', [ '-C', gitDir, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}` ], { env: GIT_ENV } );
  return r.code === 0 ? r.stdout.trim() : null;
}

/**
 * @param {string} gitDir
 * @param {string} sha
 * @param {string} file
 * @returns {Promise<string>}
 */
export const showFile = ( gitDir, sha, file ) => git( [ '-C', gitDir, 'show', `${sha}:${file}` ] );

/**
 * Last commit on `ref` at or before `date`.
 * @param {string} gitDir
 * @param {string} ref
 * @param {Date} date
 * @returns {Promise<string|null>}
 */
export async function lastCommitBefore( gitDir, ref, date ) {
  const out = await git( [ '-C', gitDir, 'rev-list', '-1', `--before=${date.toISOString()}`, ref ] );
  return out || null;
}

/**
 * Committer date of the merge-base of `sha` with `ref` (how new the underlying library code is,
 * ignoring later maintenance-patch commits on side branches).
 * @param {string} gitDir
 * @param {string} sha
 * @param {string} ref
 * @returns {Promise<string|null>} ISO date
 */
export async function mergeBaseDate( gitDir, sha, ref ) {
  const r = await run( 'git', [ '-C', gitDir, 'merge-base', sha, ref ], { env: GIT_ENV } );
  if ( r.code !== 0 || !r.stdout.trim() ) { return null; }
  const d = await git( [ '-C', gitDir, 'show', '-s', '--format=%cI', r.stdout.trim() ] );
  return new Date( d ).toISOString();
}

/**
 * Checks out `sha` (detached, forced) in a slot directory, creating a shared clone of the
 * mirror on first use. Untracked files are removed; ignored files (node_modules) are kept.
 * @param {string} repo - GitHub repo name (mirror)
 * @param {string} dir - checkout directory inside a slot
 * @param {string} sha
 */
export async function checkoutInSlot( repo, dir, sha ) {
  if ( !existsSync( path.join( dir, '.git' ) ) ) {
    await rm( dir, { recursive: true, force: true } );
    await git( [ 'clone', '--quiet', '--shared', '--no-checkout', mirrorPath( repo ), dir ] );
  }
  await git( [ '-C', dir, 'checkout', '--quiet', '--force', '--detach', sha ] );
  await git( [ '-C', dir, 'clean', '-ffdq' ] );
}

/**
 * True when the working tree has tracked modifications (used to prove builds left sources unmodified).
 * @param {string} dir
 * @returns {Promise<string>} porcelain status of tracked files ('' = clean)
 */
export const trackedChanges = dir => git( [ '-C', dir, 'status', '--porcelain', '--untracked-files=no' ] );
