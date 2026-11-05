#!/usr/bin/env node
// Builds ONE original sim (sims/<id>/, our own code on PhET's MIT libraries) as the school edition:
//   build/bsshs-theme/<id>/<id>_ko.html, recorded in data/build-matrix.new-sims.json (docs/new-sims.md).
//
// Usage: node tools/build-new-sim.mjs <id> [<id> ...] [--slot N] [--force] [--keep-stage] [--no-type-check] | --all
//        node tools/build-new-sim.mjs --create <new-id> [--title 한국어 제목]     (copy sims/_template)
//
// Flow: lock a cache slot -> check out the newSimBase library SHAs (data/build-matrix.json) -> stage
// sims/<id> as a sibling repo (deterministic throwaway commit) -> tsc -b type check -> apply the same bsshs brand, theme,
// telemetry and term patches the 63 get -> chipper `grunt build --brands=adapted-from-phet --locales=ko`
// -> inject brand markers and theme CSS -> revert every patch, remove the staged sim, prove each slot
// repo is clean. The 63-sim matrices and tools are not touched.
import { existsSync, createWriteStream } from 'node:fs';
import { mkdir, rm, readFile, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { remoteRepoFor, depsHash } from './lib/deps.mjs';
import { checkoutInSlot, trackedChanges, git, ensureMirror, ensureCommit, showFile } from './lib/git.mjs';
import { gruntArgs, builtHtmlRelPath } from './lib/chipper.mjs';
import { resolveNode, toolchainEnv } from './lib/node.mjs';
import { run } from './lib/exec.mjs';
import { slotsDir, buildDir, mirrorPath, MATRIX_JSON } from './lib/paths.mjs';
import { summarizeFailure } from './lib/build-helpers.mjs';
import { readMatrix, writeMatrix } from './lib/matrix.mjs';
import { runInSlots } from './lib/slots.mjs';
import { isMain } from './lib/cli.mjs';
import { buildVariant } from './lib/variant.mjs';
import {
  readNewSim, newSimLibraries, sourceHash, stageSim, unstageSim, slotShaMismatches, scaffoldNewSim, stageKoStrings, unstageKoStrings,
  classifyTscOutput,
  listNewSimIds, NEW_SIMS_MATRIX, NEW_SIM_BRAND, SIMS_DIR
} from './lib/new-sims.mjs';
import { variantInputs, lockSlot, arrangeSlot, ensureGruntCli, npmInstall, outputRelPath, LOCALE } from './build-sim.mjs';
import { injectIntoHtml } from '../theme/inject.mjs';
import { applyPatchRules, describeResult } from '../theme/patches/engine.mjs';
import { termFixRules } from '../theme/patches/terms.mjs';
import { generatedSimFiles } from '../theme/sim-tokens-module.mjs';
import { physicsHash } from '../drawer/hash.mjs';

/** New sims always build as the deployable school edition. */
export const NEW_SIM_VARIANT = Object.freeze( { brand: 'bsshs', theme: true, newSim: true } );
/** Slots tried when --slot is not given: from the top, so the 63-sim default slot 0 stays free. */
const SLOT_ORDER = [ 9, 8, 7, 6, 5, 4, 3, 2, 1, 0 ];
/** Dot-dir inside a slot where a staged sim's node_modules waits between builds (arrangeSlot skips dot-dirs). */
const KEEP_DIR = '.new-sims-keep';
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * @param {string[]} argv
 * @returns {{ ids: string[], slot: number|null, force: boolean, keepStage: boolean, typeCheck: boolean, create: string|null, title: string|null, all: boolean }}
 */
export function parseNewSimArgs( argv ) {
  const out = { ids: [], slot: null, force: false, keepStage: false, typeCheck: true, create: null, title: null, all: false };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--slot' ) ) { out.slot = Number( val() ); }
    else if ( a === '--force' ) { out.force = true; }
    else if ( a === '--keep-stage' ) { out.keepStage = true; }
    else if ( a === '--no-type-check' ) { out.typeCheck = false; }
    else if ( a === '--all' ) { out.all = true; }
    else if ( a.startsWith( '--create' ) ) { out.create = val(); }
    else if ( a.startsWith( '--title' ) ) { out.title = val(); }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else { out.ids.push( a ); }
  }
  if ( out.slot !== null && ( !Number.isInteger( out.slot ) || out.slot < 0 ) ) { throw new Error( '--slot expects a slot number' ); }
  return out;
}

/**
 * The library set for new sims, from data/build-matrix.json newSimBase (read-only).
 * @returns {Promise<{ base: any, libs: Record<string,string>, babelSha: string, nodeMajor: number, libsHash: string }>}
 */
export async function resolveNewSimBase() {
  const { newSimBase: base } = await readMatrix( MATRIX_JSON );
  if ( !base || !base.deps || !base.babelSha || !base.nodeVersion ) {
    throw new Error( 'data/build-matrix.json has no complete newSimBase (run the 63-sim build-all first)' );
  }
  // Drop simulation repos the base sim pulled in (e.g. energy-skate-park): asked of each repo's package.json.
  const sims = new Set();
  for ( const [ dir, sha ] of Object.entries( base.deps ) ) {
    const repo = remoteRepoFor( dir );
    await ensureMirror( repo );
    await ensureCommit( repo, sha );
    let pkg = null;
    try { pkg = JSON.parse( await showFile( mirrorPath( repo ), sha, 'package.json' ) ); } catch { pkg = null; }
    if ( pkg && pkg.phet && pkg.phet.simulation === true ) { sims.add( dir ); }
  }
  await ensureMirror( 'babel' );
  await ensureCommit( 'babel', base.babelSha );
  const libs = newSimLibraries( base, sims );
  return { base, libs, babelSha: base.babelSha, nodeMajor: Number( /^v?(\d+)/.exec( base.nodeVersion )[ 1 ] ), libsHash: depsHash( libs ) };
}

/**
 * Locks the given slot, or the first free one in SLOT_ORDER.
 * @param {number|null} slot
 * @returns {Promise<{ slot: number, slotRoot: string, release: () => Promise<void> }>}
 */
async function acquireSlot( slot ) {
  const order = slot === null ? SLOT_ORDER : [ slot ];
  let last = null;
  for ( const n of order ) {
    const slotRoot = path.join( slotsDir(), `slot-${n}` );
    await mkdir( slotRoot, { recursive: true } );
    try { return { slot: n, slotRoot, release: await lockSlot( slotRoot ) }; }
    catch( e ) { last = e; }
  }
  throw last || new Error( 'no free slot' );
}

/**
 * Builds one original sim and returns its matrix row (never throws for build failures).
 * @param {string} id
 * @param {{ slot?: number|null, keepStage?: boolean, typeCheck?: boolean, log?: (s: string) => void, base?: Awaited<ReturnType<typeof resolveNewSimBase>> }} [opts]
 * @returns {Promise<object>}
 */
export async function buildNewSim( id, opts = {} ) {
  const say = opts.log || ( s => console.log( s ) );
  const started = Date.now();
  const variant = buildVariant( NEW_SIM_VARIANT );
  const logDir = path.join( buildDir(), 'logs', 'new-sims' );
  await mkdir( logDir, { recursive: true } );
  const logPath = path.join( logDir, `${id}.log` );
  const log = createWriteStream( logPath );

  /** @type {any} */
  const row = {
    id, repo: null, version: null, sourceDir: `sims/${id}`, sourceHash: null, stagedSha: null,
    base: null, libsHash: null, deps: {}, babelSha: null, chipperVersion: null, nodeVersion: null,
    variant: variant.name, brandId: NEW_SIM_VARIANT.brand, theme: NEW_SIM_VARIANT.theme, themeHash: null,
    slot: null, slotShasMatchBase: false, success: false, outputPath: null, outputBytes: null, error: null,
    typeCheck: null, flags: [], overlays: [], patches: [], trackedChangesAfterBuild: null, slotCleanAfterCleanup: null,
    physicsHash: null, logPath: path.relative( buildDir(), logPath ), buildSeconds: 0, builtAt: null
  };
  const finish = fields => {
    log.end();
    return { ...row, ...fields, buildSeconds: Math.round( ( Date.now() - started ) / 100 ) / 10, builtAt: new Date().toISOString() };
  };

  let lock = null;
  let simDir = null;
  let keepDir = null;
  try {
    const sim = readNewSim( id );
    Object.assign( row, { repo: sim.repo, version: sim.version, sourceHash: sourceHash( sim.srcDir ), physicsHash: physicsHash( id ) } );
    const nb = opts.base || await resolveNewSimBase();
    const chipperPkg = JSON.parse( await showFile( mirrorPath( 'chipper' ), nb.libs.chipper, 'package.json' ) );
    Object.assign( row, {
      base: { id: nb.base.id, version: nb.base.version, depsHash: nb.base.depsHash },
      libsHash: nb.libsHash, deps: nb.libs, babelSha: nb.babelSha, chipperVersion: chipperPkg.version
    } );
    if ( nb.libs[ sim.repo ] ) { throw new Error( `repo name ${sim.repo} collides with a PhET library` ); }
    for ( const lib of sim.pkg.phet.phetLibs || [] ) {
      if ( !nb.libs[ lib ] ) { throw new Error( `phet.phetLibs lists ${lib}, which is not in the newSimBase library set` ); }
    }
    const inputs = await variantInputs( NEW_SIM_VARIANT );
    const simInputs = await inputs.forSim( id, nb.libs );
    row.themeHash = simInputs.themeHash;

    lock = await acquireSlot( opts.slot ?? null );
    row.slot = lock.slot;
    const { slotRoot } = lock;
    simDir = path.join( slotRoot, sim.repo );
    keepDir = path.join( slotRoot, KEEP_DIR );
    const libDirs = [ ...Object.keys( nb.libs ), 'babel' ];
    log.write( `# ${id} (repo ${sim.repo}) ${sim.version} slot ${lock.slot}\n# base ${nb.base.id} ${nb.base.version} libs ${nb.libsHash}\n# babel ${nb.babelSha} chipper ${chipperPkg.version}\n` );

    say( `[slot ${lock.slot}] ${id}: checkout ${libDirs.length} library repos (newSimBase ${nb.base.id} ${nb.base.version})` );
    await arrangeSlot( slotRoot, [ ...libDirs, sim.repo ] );
    await runInSlots( libDirs, 8, async dir => {
      await checkoutInSlot( dir === 'babel' ? 'babel' : remoteRepoFor( dir ), path.join( slotRoot, dir ), dir === 'babel' ? nb.babelSha : nb.libs[ dir ] );
    } ).then( rs => { const e = rs.find( r => r instanceof Error ); if ( e ) { throw e; } } );

    const staged = await stageSim( sim.srcDir, simDir, { keepDir, generated: generatedSimFiles( inputs.tokens ) } );
    row.stagedSha = staged.sha;
    const mismatches = await slotShaMismatches( slotRoot, { ...nb.libs, babel: nb.babelSha } );
    row.slotShasMatchBase = mismatches.length === 0;
    if ( mismatches.length ) { throw new Error( `slot SHAs differ from newSimBase: ${mismatches.join( '; ' )}` ); }
    log.write( `# staged ${sim.repo} @ ${staged.sha} (${staged.files.length} files)\n` );

    await rm( path.join( simDir, 'build' ), { recursive: true, force: true } );
    await rm( path.join( slotRoot, 'chipper', 'dist' ), { recursive: true, force: true } );

    const node = await resolveNode( nb.nodeMajor );
    const env = toolchainEnv( node.binDir );
    row.nodeVersion = node.version;
    log.write( `\n# node ${node.version} (${node.nodePath})\n` );
    for ( const dir of [ 'chipper', 'perennial-alias', sim.repo ] ) {
      const what = await npmInstall( path.join( slotRoot, dir ), { major: nb.nodeMajor, env, log } );
      log.write( `# ${dir}: ${what}\n` );
    }
    const gruntBin = await ensureGruntCli();

    // chipper skips type checking for the adapted-from-phet brand, so new sims get their own `tsc -b`
    // (on the pristine libraries, before any patch). Errors in the sim's files fail the build; errors in
    // pinned libraries (only the private phet-io module is expected) are recorded, not fatal.
    if ( opts.typeCheck !== false ) {
      say( `[slot ${lock.slot}] ${id}: type check (tsc -b)` );
      log.write( `\n$ (cd ${simDir}) tsc -b --pretty false\n` );
      const tsc = await run( node.nodePath, [ path.join( slotRoot, 'perennial-alias', 'node_modules', 'typescript', 'bin', 'tsc' ), '-b', '--pretty', 'false' ],
        { cwd: simDir, env, log, timeoutMs: BUILD_TIMEOUT_MS } );
      const { simErrors, libraryErrors } = classifyTscOutput( `${tsc.stdout}\n${tsc.stderr}` );
      row.typeCheck = { ran: true, simErrors: simErrors.slice( 0, 20 ), libraryErrorCount: libraryErrors.length, libraryErrorSample: libraryErrors.slice( 0, 2 ) };
      if ( simErrors.length ) { throw new Error( `type check: ${simErrors.length} error(s) in ${id}: ${simErrors.slice( 0, 5 ).join( ' | ' )}` ); }
      if ( tsc.code !== 0 && !libraryErrors.length ) { throw new Error( `type check failed: ${summarizeFailure( tsc.tail, tsc.code )}` ); }
    }
    else { row.typeCheck = { ran: false }; }

    /** @type {{dir: string, file: string}[]} */
    const touched = [];
    let r = null;
    try {
      const rules = [ ...simInputs.rules, ...await termFixRules( sim.repo, { deps: nb.libs, babelSha: nb.babelSha }, inputs.termFixes ) ];
      const results = await applyPatchRules( slotRoot, rules, simInputs.ctx, touched );
      row.patches = results.map( describeResult );
      log.write( `\n# ${variant.name} patches:\n#   ${row.patches.join( '\n#   ' )}\n` );
      say( `[slot ${lock.slot}] ${id}: ${results.filter( x => x.status === 'applied' ).length}/${results.length} ${variant.name} patches applied` );
      // Make ko a real locale for chipper (babel/<repo>/<repo>-strings_ko.json; removed below).
      const koFile = await stageKoStrings( path.join( slotRoot, 'babel' ), sim.srcDir, sim.repo );
      log.write( `# strings: ${path.relative( slotRoot, koFile )} <- ${path.basename( sim.srcDir )}/${path.basename( existsSync( path.join( sim.srcDir, `${sim.repo}-strings_ko.json` ) ) ? `${sim.repo}-strings_ko.json` : `${sim.repo}-strings_en.json` )}\n` );
      // chipper 2 skips its type check for the adapted-from-phet brand; --type-check=false only makes that explicit.
      row.flags = gruntArgs( 2, { brand: NEW_SIM_BRAND, locale: LOCALE, typeCheck: false } );
      log.write( `\n$ (cd ${simDir}) grunt ${row.flags.join( ' ' )}\n` );
      say( `[slot ${lock.slot}] ${id}: grunt ${row.flags.join( ' ' )} (node ${node.version})` );
      r = await run( node.nodePath, [ gruntBin, ...row.flags ], { cwd: simDir, env, log, timeoutMs: BUILD_TIMEOUT_MS } );
    }
    finally {
      for ( const t of touched ) { await git( [ '-C', t.dir, 'checkout', '--', t.file ] ); }
      await unstageKoStrings( path.join( slotRoot, 'babel' ), sim.repo );
    }

    // Every library sibling must be back to its pinned tree; the staged sim must be exactly its commit.
    const dirty = [];
    for ( const dir of libDirs ) {
      const st = await trackedChanges( path.join( slotRoot, dir ) );
      if ( st ) { dirty.push( `${dir}: ${st.split( '\n' ).slice( 0, 3 ).join( '; ' )}` ); }
    }
    const babelSt = ( await run( 'git', [ '-C', path.join( slotRoot, 'babel' ), 'status', '--porcelain', '--untracked-files=all' ] ) ).stdout.trim();
    if ( babelSt ) { dirty.push( `babel (untracked): ${babelSt.split( '\n' ).slice( 0, 3 ).join( '; ' )}` ); }
    const simSt = ( await run( 'git', [ '-C', simDir, 'status', '--porcelain' ] ) ).stdout.trim();
    if ( simSt ) { dirty.push( `${sim.repo}: ${simSt.split( '\n' ).slice( 0, 3 ).join( '; ' )}` ); }
    row.trackedChangesAfterBuild = dirty;

    const htmlSrc = path.join( simDir, builtHtmlRelPath( 2, sim.repo, NEW_SIM_BRAND, LOCALE ) );
    if ( r.code !== 0 || !existsSync( htmlSrc ) ) {
      throw new Error( r.code === 0 ? `grunt exited 0 but ${path.relative( simDir, htmlSrc )} was not produced` : summarizeFailure( r.tail, r.code ) );
    }
    const dest = path.join( variant.outRoot, outputRelPath( id ) );
    await mkdir( path.dirname( dest ), { recursive: true } );
    const html = injectIntoHtml( await readFile( htmlSrc, 'utf8' ), {
      tokens: inputs.tokens, theme: true, brand: { wordmarkSha256: inputs.wordmarkSha256, wordmarkPng: inputs.wordmarkPng }
    } );
    await writeFile( `${dest}.tmp`, html );
    await rename( `${dest}.tmp`, dest );
    row.outputBytes = ( await stat( dest ) ).size;
    row.outputPath = outputRelPath( id );
    say( `[slot ${lock.slot}] ${id}: OK ${( row.outputBytes / 1e6 ).toFixed( 1 )} MB` );
    row.success = dirty.length === 0;
    if ( dirty.length ) { row.error = `slot not clean after build: ${dirty.join( ' | ' )}`; }
  }
  catch( e ) {
    say( `${id}: FAILED ${e.message.slice( 0, 300 )}` );
    log.write( `\n# ERROR ${e.stack}\n` );
    row.success = false;
    row.outputPath = null;
    row.error = String( e.message ).slice( 0, 900 );
  }
  finally {
    try {
      if ( simDir && !opts.keepStage ) { await unstageSim( simDir, { keepDir } ); }
      if ( lock ) {
        const after = [];
        for ( const dir of [ ...Object.keys( row.deps ), 'babel' ] ) {
          const st = existsSync( path.join( lock.slotRoot, dir ) ) ? await trackedChanges( path.join( lock.slotRoot, dir ) ) : '';
          if ( st ) { after.push( dir ); }
        }
        row.slotCleanAfterCleanup = after.length === 0 && ( opts.keepStage || !existsSync( simDir ) );
      }
    }
    catch( e ) {
      row.success = false;
      row.error = `${row.error ? `${row.error} | ` : ''}cleanup: ${e.message}`.slice( 0, 900 );
    }
    if ( lock ) { await lock.release(); }
  }
  if ( !row.success ) {
    // A failed sim must not leave an older successful HTML behind for a later publish step to pick up.
    await rm( path.join( variant.outRoot, outputRelPath( id ) ), { force: true } );
    row.outputPath = null;
    row.outputBytes = null;
  }
  return finish( {} );
}

/** Serialises matrix writes within this process. */
let chain = Promise.resolve();
/**
 * Inserts or replaces one row of data/build-matrix.new-sims.json (rows sorted by id).
 * @param {object} row
 * @param {string} [file]
 */
export function saveNewSimRow( row, file = NEW_SIMS_MATRIX ) {
  chain = chain.then( async () => {
    const m = await readMatrix( file );
    const rows = ( m.sims || [] ).filter( x => x.id !== row.id ).concat( [ row ] ).sort( ( a, b ) => a.id.localeCompare( b.id ) );
    await writeMatrix( {
      tool: 'build-new-sim',
      description: 'Original sims (sims/<id>) built on the newSimBase library set of data/build-matrix.json; see docs/new-sims.md.',
      variant: buildVariant( NEW_SIM_VARIANT ).name, brand: NEW_SIM_BRAND, brandId: NEW_SIM_VARIANT.brand, locale: LOCALE,
      outputRoot: buildVariant( NEW_SIM_VARIANT ).name,
      sims: rows
    }, file );
  } );
  return chain;
}

/**
 * True when the last row already built exactly this source on this library set and theme.
 * @param {any} prev
 * @param {{ sourceHash: string, libsHash: string, themeHash: string, outputExists: boolean }} now
 * @returns {boolean}
 */
export function isUpToDate( prev, now ) {
  return !!prev && prev.success === true && prev.sourceHash === now.sourceHash && prev.libsHash === now.libsHash &&
         prev.themeHash === now.themeHash && now.outputExists;
}

/**
 * Builds several original sims (resumable), up to `jobs` at once, each in its own free slot.
 * @param {string[]} ids
 * @param {{ force?: boolean, jobs?: number, keepStage?: boolean, typeCheck?: boolean, slot?: number|null }} [opts]
 * @returns {Promise<{ built: object[], skipped: string[], failed: string[] }>}
 */
export async function buildNewSims( ids, opts = {} ) {
  if ( !ids.length ) { return { built: [], skipped: [], failed: [] }; }
  const base = await resolveNewSimBase();
  const inputs = await variantInputs( NEW_SIM_VARIANT );
  const prev = new Map( ( ( await readMatrix( NEW_SIMS_MATRIX ) ).sims || [] ).map( x => [ x.id, x ] ) );
  const outRoot = buildVariant( NEW_SIM_VARIANT ).outRoot;
  const todo = [];
  const skipped = [];
  for ( const id of ids ) {
    const sim = readNewSim( id );
    const now = { sourceHash: sourceHash( sim.srcDir ), libsHash: base.libsHash, themeHash: ( await inputs.forSim( id, base.libs, { hashOnly: true } ) ).themeHash,
                  outputExists: existsSync( path.join( outRoot, outputRelPath( id ) ) ) };
    if ( !opts.force && isUpToDate( prev.get( id ), now ) ) { skipped.push( id ); console.log( `${id}: already built (${path.join( outRoot, outputRelPath( id ) )}); use --force to rebuild` ); }
    else { todo.push( id ); }
  }
  const results = await runInSlots( todo, opts.slot != null ? 1 : Math.max( 1, opts.jobs || 1 ), async id => {
    const row = await buildNewSim( id, { base, keepStage: opts.keepStage, typeCheck: opts.typeCheck, slot: opts.slot ?? null } );
    await saveNewSimRow( row );
    return row;
  } );
  const built = results.filter( x => !( x instanceof Error ) );
  const failed = [ ...results.filter( x => x instanceof Error ).map( e => e.message ), ...built.filter( x => !x.success ).map( x => x.id ) ];
  return { built, skipped, failed };
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main( argv ) {
  const opts = parseNewSimArgs( argv );
  if ( opts.create ) {
    const dir = scaffoldNewSim( opts.create, { title: opts.title || undefined } );
    console.log( `created ${path.relative( process.cwd(), dir ) || dir} from sims/_template; edit its strings file, js/model and js/view, then: node tools/build-new-sim.mjs ${opts.create}` );
    return 0;
  }
  const ids = opts.all ? listNewSimIds( SIMS_DIR ) : opts.ids;
  if ( !ids.length ) {
    throw new Error( 'usage: build-new-sim.mjs <id> [<id> ...] [--slot N] [--force] [--keep-stage] [--no-type-check] | --all | --create <id> [--title 제목]' );
  }
  const { built, failed } = await buildNewSims( ids, opts );
  for ( const row of built ) {
    console.log( row.success ? `built ${path.join( buildVariant( NEW_SIM_VARIANT ).outRoot, row.outputPath )}` : `FAILED ${row.id}: ${row.error}` );
  }
  return failed.length ? 1 : 0;
}

if ( isMain( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).then( code => { process.exitCode = code; }, e => { console.error( e.message ); process.exitCode = 2; } );
}
