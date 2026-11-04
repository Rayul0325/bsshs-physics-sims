// Resolves one pinned sim into a manifest: exact sim commit, dependency SHAs, babel commit.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { parseDependencies, releaseDateFromComment, remoteRepoFor, depsHash, isPrivatePhetioRepo } from './deps.mjs';
import { ensureMirror, ensureCommit, hasCommit, revParse, showFile, lastCommitBefore, mergeBaseDate, git } from './git.mjs';
import { manifestsDir, mirrorPath } from './paths.mjs';

/** Core libraries whose age decides how modern a dependency set is (chipper/perennial are tooling). */
export const CORE_LIBS = [ 'axon', 'dot', 'joist', 'kite', 'phet-core', 'scenery', 'scenery-phet', 'sun', 'tandem' ];

/**
 * @typedef {object} SimManifest
 * @property {string} id
 * @property {string} branch
 * @property {string} version
 * @property {string} simSha - release-branch HEAD (contains dependencies.json)
 * @property {string} pinnedSimSha - the sim SHA recorded inside dependencies.json
 * @property {string[]} headExtraFiles - files changed between pinnedSimSha and simSha
 * @property {Record<string,string>} deps - sibling dir -> SHA (sim entry replaced by simSha)
 * @property {string} depsHash - hash over the dependencies.json map as published
 * @property {string|null} releaseDate
 * @property {string} babelSha
 * @property {string} chipperVersion
 * @property {string|null} libraryDate
 * @property {Record<string,string|null>} libraryDates
 */

/** @param {string} id */
export const manifestPath = id => path.join( manifestsDir(), `${id}.json` );

/**
 * @param {string} id
 * @returns {Promise<SimManifest|null>}
 */
export async function readManifest( id ) {
  try { return JSON.parse( await readFile( manifestPath( id ), 'utf8' ) ); }
  catch( e ) { if ( e.code === 'ENOENT' ) { return null; } throw e; }
}

/**
 * Fetches (idempotently) and resolves one sim. Throws on a version mismatch or a missing pinned
 * commit: versions are fixed, nothing is substituted.
 * @param {{id: string, branch: string, version: string}} sim
 * @param {{ update?: boolean, log?: (s: string) => void }} [opts]
 * @returns {Promise<SimManifest>}
 */
export async function resolveSim( sim, opts = {} ) {
  const log = opts.log || ( () => {} );
  const existing = await readManifest( sim.id );
  if ( existing && !opts.update && existing.branch === sim.branch && existing.version === sim.version ) {
    // Cheap re-verification that every pinned commit is still in the cache.
    let complete = true;
    for ( const [ dir, sha ] of Object.entries( existing.deps ) ) {
      if ( !( await hasCommit( mirrorPath( remoteRepoFor( dir ) ), sha ) ) ) { complete = false; break; }
    }
    if ( complete && await hasCommit( mirrorPath( 'babel' ), existing.babelSha ) ) {
      log( `${sim.id}: cached` );
      return existing;
    }
  }

  const simMirror = await ensureMirror( sim.id, { update: opts.update } );
  const simSha = await revParse( simMirror, `refs/heads/${sim.branch}` );
  if ( !simSha ) { throw new Error( `${sim.id}: release branch ${sim.branch} not found on phetsims/${sim.id}` ); }

  const pkg = JSON.parse( await showFile( simMirror, simSha, 'package.json' ) );
  if ( pkg.version !== sim.version ) {
    throw new Error( `${sim.id}: branch ${sim.branch} has version ${pkg.version}, pinned table says ${sim.version} (not substituting)` );
  }
  const depsDoc = JSON.parse( await showFile( simMirror, simSha, 'dependencies.json' ) );
  const published = parseDependencies( depsDoc );
  if ( !published[ sim.id ] ) { throw new Error( `${sim.id}: dependencies.json does not list the sim itself` ); }
  const pinnedSimSha = published[ sim.id ];
  const headExtraFiles = pinnedSimSha === simSha ? [] :
    ( await git( [ '-C', simMirror, 'diff', '--name-only', pinnedSimSha, simSha ] ) ).split( '\n' ).filter( Boolean );

  // Mirror every public sibling and verify each pinned commit exists. PhET-iO repos are
  // proprietary (not public) and unused by the adapted-from-phet brand, so they are listed, not fetched.
  const unavailable = Object.keys( published ).filter( isPrivatePhetioRepo ).sort();
  const deps = { ...published, [ sim.id ]: simSha };
  for ( const dir of unavailable ) { delete deps[ dir ]; }
  for ( const [ dir, sha ] of Object.entries( deps ) ) {
    const repo = remoteRepoFor( dir );
    await ensureMirror( repo, { update: opts.update } );
    await ensureCommit( repo, sha );
  }

  // babel (translations) is not pinned by PhET: its build server used babel main at build time.
  // We reproduce that deterministically: last babel main commit at or before the release timestamp.
  const release = releaseDateFromComment( depsDoc.comment );
  const babelMirror = await ensureMirror( 'babel', { update: opts.update } );
  const babelSha = release ? await lastCommitBefore( babelMirror, 'refs/heads/main', release ) : await revParse( babelMirror, 'refs/heads/main' );
  if ( !babelSha ) { throw new Error( `${sim.id}: could not resolve a babel commit` ); }

  const chipperPkg = JSON.parse( await showFile( mirrorPath( 'chipper' ), deps.chipper, 'package.json' ) );

  /** @type {Record<string,string|null>} */
  const libraryDates = {};
  for ( const lib of CORE_LIBS ) {
    libraryDates[ lib ] = deps[ lib ] ? await mergeBaseDate( mirrorPath( lib ), deps[ lib ], 'refs/heads/main' ) : null;
  }
  const known = Object.values( libraryDates ).filter( Boolean ).map( d => Date.parse( d ) );
  const libraryDate = known.length ? new Date( Math.min( ...known ) ).toISOString() : null;

  /** @type {SimManifest} */
  const manifest = {
    id: sim.id,
    branch: sim.branch,
    version: sim.version,
    simSha,
    pinnedSimSha,
    headExtraFiles,
    deps,
    depsHash: depsHash( published ),
    unavailable,
    releaseDate: release ? release.toISOString() : null,
    babelSha,
    chipperVersion: chipperPkg.version,
    libraryDate,
    libraryDates,
    supportedBrands: ( pkg.phet && pkg.phet.supportedBrands ) || null,
    resolvedAt: new Date().toISOString()
  };
  await mkdir( manifestsDir(), { recursive: true } );
  const tmp = `${manifestPath( sim.id )}.tmp-${process.pid}`;
  await writeFile( tmp, JSON.stringify( manifest, null, 2 ) + '\n' );
  await rename( tmp, manifestPath( sim.id ) );
  log( `${sim.id}: resolved ${sim.version} @ ${simSha.slice( 0, 10 )} (${Object.keys( deps ).length} repos, babel ${babelSha.slice( 0, 10 )})` );
  return manifest;
}
