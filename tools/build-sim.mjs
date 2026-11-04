#!/usr/bin/env node
// Builds ONE pinned sim, unmodified, as brand adapted-from-phet / locale ko:
//   build/<id>/<id>_ko.html   (build dir overridable with BSSHS_BUILD_DIR)
// With --brand bsshs [--theme] it builds the school edition instead (docs/theme.md):
//   build/bsshs-theme/<id>/<id>_ko.html, recorded in data/build-matrix.bsshs-theme.json
//
// Usage: node tools/build-sim.mjs <sim-id> [--slot N] [--node 24[,20]] [--no-brand-overlay]
//                                  [--no-type-check] [--force] [--brand bsshs] [--theme]
// The sim and all siblings are checked out at the pinned SHAs inside cache slot N
// ($BSSHS_CACHE/slots/slot-N); the result is recorded in data/build-matrix.json (baseline).
import { existsSync, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, readFile, writeFile, copyFile, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadSims, selectSims } from './lib/sims.mjs';
import { resolveSim } from './lib/manifest.mjs';
import { remoteRepoFor } from './lib/deps.mjs';
import { checkoutInSlot, trackedChanges, git } from './lib/git.mjs';
import { chipperGeneration, gruntArgs, builtHtmlRelPath } from './lib/chipper.mjs';
import { resolveNode, toolchainEnv } from './lib/node.mjs';
import { run, runOk } from './lib/exec.mjs';
import { slotsDir, toolsDir, buildDir } from './lib/paths.mjs';
import {
  summarizeFailure, isUnsupportedBrandFailure, isPrivateTypeCheckFailure, isPrivatePhetioTsconfigFailure,
  skipTscBuildPatch, TSC_BUILD_FILES, addSupportedBrand, installMarker
} from './lib/build-helpers.mjs';
import { makeRecord, readMatrix, writeMatrix, upsertRecord, shouldSkip } from './lib/matrix.mjs';
import { runInSlots } from './lib/slots.mjs';
import { isMain } from './lib/cli.mjs';
import { buildVariant, BRANDS } from './lib/variant.mjs';
import { loadTokens } from '../theme/index.mjs';
import { injectIntoHtml } from '../theme/inject.mjs';
import { rulesFor, patchContext, variantHash } from '../theme/patches/index.mjs';
import { applyPatchRules, describeResult } from '../theme/patches/engine.mjs';
import { renderWordmark } from '../brand/bsshs/wordmark.mjs';
import { loadTermFixes, termFixRules, termFixesHash } from '../theme/patches/terms.mjs';

export const BRAND = 'adapted-from-phet';
export const LOCALE = 'ko';
const GRUNT_CLI_VERSION = '1.4.3';
const BUILD_TIMEOUT_MS = 45 * 60 * 1000;
const MARKER = '.bsshs-install-marker';

/** Output path of a sim, relative to the build dir. @param {string} id */
export const outputRelPath = id => `${id}/${id}_${LOCALE}.html`;

/**
 * Exclusive slot lock across processes (O_EXCL lockfile holding the pid; stale locks are reclaimed).
 * @param {string} slotRoot
 * @returns {Promise<() => Promise<void>>} release function
 */
export async function lockSlot( slotRoot ) {
  const lock = path.join( slotRoot, '.lock' );
  for ( let attempt = 0; attempt < 2; attempt++ ) {
    try {
      const fh = await open( lock, 'wx' );
      await fh.writeFile( String( process.pid ) );
      await fh.close();
      return () => rm( lock, { force: true } );
    }
    catch( e ) {
      if ( e.code !== 'EEXIST' ) { throw e; }
      const pid = Number( await readFile( lock, 'utf8' ).catch( () => '0' ) );
      let alive = false;
      try { process.kill( pid, 0 ); alive = pid > 0; } catch { alive = false; }
      if ( alive ) { throw new Error( `slot ${slotRoot} is in use by pid ${pid}` ); }
      await rm( lock, { force: true } );
    }
  }
  throw new Error( `could not lock ${slotRoot}` );
}

/**
 * Makes the slot contain exactly the needed sibling dirs; others are parked in .parked/
 * (cheap rename) so the sim only sees its own dependency set.
 * @param {string} slotRoot
 * @param {string[]} needed
 */
export async function arrangeSlot( slotRoot, needed ) {
  const parked = path.join( slotRoot, '.parked' );
  await mkdir( parked, { recursive: true } );
  const want = new Set( needed );
  for ( const name of await readdir( slotRoot ) ) {
    if ( name.startsWith( '.' ) || want.has( name ) ) { continue; }
    await rm( path.join( parked, name ), { recursive: true, force: true } );
    await rename( path.join( slotRoot, name ), path.join( parked, name ) );
  }
  for ( const name of needed ) {
    const p = path.join( parked, name );
    if ( !existsSync( path.join( slotRoot, name ) ) && existsSync( p ) ) {
      await rename( p, path.join( slotRoot, name ) );
    }
  }
}

let gruntCliPromise = null;
/**
 * Installs grunt-cli once into the cache tools dir.
 * @returns {Promise<string>} path to the grunt-cli bin script
 */
export function ensureGruntCli() {
  if ( !gruntCliPromise ) {
    gruntCliPromise = ( async () => {
      const prefix = path.join( toolsDir(), `grunt-cli-${GRUNT_CLI_VERSION}` );
      const bin = path.join( prefix, 'node_modules', 'grunt-cli', 'bin', 'grunt' );
      if ( !existsSync( bin ) ) {
        await mkdir( prefix, { recursive: true } );
        await runOk( 'npm', [ 'install', '--prefix', prefix, '--no-audit', '--no-fund', `grunt-cli@${GRUNT_CLI_VERSION}` ], { env: toolchainEnv( path.dirname( process.execPath ) ) } );
      }
      return bin;
    } )();
  }
  return gruntCliPromise;
}

/**
 * npm install for one repo dir, skipped when the marker shows node_modules already matches.
 * Uses `npm ci` with a lockfile (what PhET's perennial does) and a lockfile-less install otherwise.
 * @param {string} dir
 * @param {{ major: number, env: NodeJS.ProcessEnv, log: import('node:stream').Writable }} ctx
 * @returns {Promise<string>} what happened
 */
export async function npmInstall( dir, { major, env, log } ) {
  const pkgFile = path.join( dir, 'package.json' );
  if ( !existsSync( pkgFile ) ) { return 'no package.json'; }
  const pkgText = await readFile( pkgFile, 'utf8' );
  const pkg = JSON.parse( pkgText );
  if ( !Object.keys( { ...pkg.dependencies, ...pkg.devDependencies } ).length ) { return 'no dependencies'; }
  const lockFile = path.join( dir, 'package-lock.json' );
  const lockText = existsSync( lockFile ) ? await readFile( lockFile, 'utf8' ) : null;
  const marker = installMarker( pkgText, lockText, major );
  const markerFile = path.join( dir, 'node_modules', MARKER );
  if ( existsSync( markerFile ) && ( await readFile( markerFile, 'utf8' ) ) === marker ) { return 'reused node_modules'; }
  await rm( path.join( dir, 'node_modules' ), { recursive: true, force: true } );
  const args = lockText ? [ 'ci', '--no-audit', '--no-fund' ] : [ 'install', '--no-package-lock', '--no-audit', '--no-fund' ];
  log.write( `\n$ (cd ${dir}) npm ${args.join( ' ' )}\n` );
  const r = await run( 'npm', args, { cwd: dir, env, log } );
  if ( r.code !== 0 ) { throw new Error( `npm ${args[ 0 ]} failed in ${path.basename( dir )}: ${summarizeFailure( r.tail, r.code )}` ); }
  await writeFile( markerFile, marker );
  return `npm ${args[ 0 ]}`;
}

/**
 * Theme/brand inputs of a variant build (null for the baseline).
 * @param {{ brand?: string, theme?: boolean }} opts
 * @returns {Promise<null|{ tokens: any, rules: import('../theme/patches/engine.mjs').PatchRule[], ctx: object,
 *                         themeHash: string, wordmarkSha256: string[]|null, wordmarkPng: string[]|null,
 *                         termFixes: import('../theme/patches/terms.mjs').TermFixes|null }>}
 */
export async function variantInputs( opts ) {
  const v = buildVariant( opts );
  if ( v.name === 'baseline' ) { return null; }
  const tokens = loadTokens();
  const wordmark = v.brand === 'bsshs' ? await renderWordmark( tokens ) : null;
  const termFixes = v.brand === 'bsshs' ? await loadTermFixes() : null; // school edition: Korean term corrections
  return {
    tokens,
    rules: rulesFor( v ),
    ctx: patchContext( tokens, v, wordmark ),
    termFixes,
    themeHash: termFixes ? `${variantHash( tokens, v )}+${termFixesHash( termFixes ).slice( 0, 16 )}` : variantHash( tokens, v ),
    wordmarkSha256: wordmark ? wordmark.sha256 : null,
    wordmarkPng: wordmark ? [ wordmark.onWhite.toString( 'base64' ), wordmark.onBlack.toString( 'base64' ) ] : null
  };
}

/**
 * Builds one sim in one slot and returns its matrix record (never throws for build failures).
 * @param {{id: string, branch: string, version: string}} sim
 * @param {{ slot?: number, nodeMajors?: number[], allowBrandOverlay?: boolean, typeCheck?: boolean,
 *           brand?: string, theme?: boolean, log?: (s: string) => void }} [opts]
 * @returns {Promise<import('./lib/matrix.mjs').MatrixRecord>}
 */
export async function buildSim( sim, opts = {} ) {
  const { slot = 0, nodeMajors = [ 24 ], allowBrandOverlay = true, typeCheck = true } = opts;
  const say = opts.log || ( s => console.log( s ) );
  const started = Date.now();
  const variant = buildVariant( opts );
  const isVariant = variant.name !== 'baseline';
  const logDir = variant.logsDir;
  await mkdir( logDir, { recursive: true } );
  const logPath = path.join( logDir, `${sim.id}.log` );
  const log = createWriteStream( logPath );
  const relLog = path.relative( buildDir(), logPath );

  let manifest = null;
  let inputs = null;
  /** @type {string[]} */
  let patchSummary = [];
  const base = {
    id: sim.id, branch: sim.branch, sourceVersion: sim.version, logPath: relLog
  };
  // Variant records say what was injected; baseline records keep exactly the original fields.
  const variantFields = () => ( isVariant ? {
    variant: variant.name, brandId: variant.brand, theme: variant.theme,
    themeHash: inputs ? inputs.themeHash : null, patches: patchSummary
  } : {} );
  /** @param {Partial<import('./lib/matrix.mjs').MatrixRecord>} f */
  const finish = f => {
    log.end();
    return makeRecord( {
      ...base,
      simSha: manifest ? manifest.simSha : '0'.repeat( 40 ),
      deps: manifest ? manifest.deps : {},
      depsHash: manifest ? manifest.depsHash : '0'.repeat( 64 ),
      babelSha: manifest ? manifest.babelSha : null,
      chipperVersion: manifest ? manifest.chipperVersion : null,
      buildSeconds: Math.round( ( Date.now() - started ) / 100 ) / 10,
      ...variantFields(),
      ...f
    } );
  };

  const slotRoot = path.join( slotsDir(), `slot-${slot}` );
  await mkdir( slotRoot, { recursive: true } );
  let release = null;
  try {
    manifest = await resolveSim( sim );
    inputs = await variantInputs( opts );
    release = await lockSlot( slotRoot );
    const gen = chipperGeneration( manifest.chipperVersion );
    const dirs = [ ...Object.keys( manifest.deps ), 'babel' ];
    log.write( `# ${sim.id} ${sim.version} (branch ${sim.branch}) slot ${slot}\n# sim ${manifest.simSha} babel ${manifest.babelSha}\n# chipper ${manifest.chipperVersion} (gen ${gen})\n` );

    say( `[slot ${slot}] ${sim.id}: checkout ${dirs.length} repos` );
    await arrangeSlot( slotRoot, dirs );
    await runInSlots( dirs, 8, async dir => {
      const sha = dir === 'babel' ? manifest.babelSha : manifest.deps[ dir ];
      await checkoutInSlot( dir === 'babel' ? 'babel' : remoteRepoFor( dir ), path.join( slotRoot, dir ), sha );
    } ).then( rs => { const e = rs.find( r => r instanceof Error ); if ( e ) { throw e; } } );

    const simDir = path.join( slotRoot, sim.id );
    await rm( path.join( simDir, 'build' ), { recursive: true, force: true } );
    await rm( path.join( slotRoot, 'chipper', 'dist' ), { recursive: true, force: true } );

    const ensureGrunt = ensureGruntCli();
    let lastFailure = null;
    for ( const major of nodeMajors ) {
      const node = await resolveNode( major );
      const env = toolchainEnv( node.binDir );
      log.write( `\n# node ${node.version} (${node.nodePath})\n` );
      for ( const dir of [ 'chipper', 'perennial-alias', sim.id ] ) {
        if ( !existsSync( path.join( slotRoot, dir ) ) ) { continue; }
        const what = await npmInstall( path.join( slotRoot, dir ), { major, env, log } );
        log.write( `# ${dir}: ${what}\n` );
      }
      const gruntBin = await ensureGrunt;
      const overlays = [];
      let useTypeCheck = typeCheck;
      let typeCheckSkipped = null;
      const attempt = async () => {
        const args = gruntArgs( gen, { brand: BRAND, locale: LOCALE, typeCheck: useTypeCheck } );
        log.write( `\n$ (cd ${simDir}) grunt ${args.join( ' ' )}\n` );
        say( `[slot ${slot}] ${sim.id}: grunt ${args.join( ' ' )} (node ${node.version})` );
        const r = await run( node.nodePath, [ gruntBin, ...args ], { cwd: simDir, env, log, timeoutMs: BUILD_TIMEOUT_MS } );
        return { r, args };
      };
      let r = null;
      let args = null;
      let strictError = null;
      /** @type {{dir: string, file: string}[]} files edited in the throwaway checkout, reverted below */
      const touched = [];
      try {
        const rules = inputs ? [ ...inputs.rules, ...( inputs.termFixes ? await termFixRules( sim.id, manifest, inputs.termFixes ) : [] ) ] : [];
        if ( rules.length ) {
          // Variant build: allow-listed theme/brand/telemetry/terms patches (theme/patches), reverted below.
          const results = await applyPatchRules( slotRoot, rules, inputs.ctx, touched );
          patchSummary = results.map( describeResult );
          log.write( `\n# ${variant.name} patches:\n#   ${patchSummary.join( '\n#   ' )}\n` );
          say( `[slot ${slot}] ${sim.id}: ${results.filter( x => x.status === 'applied' ).length}/${results.length} ${variant.name} patches applied` );
        }
        ( { r, args } = await attempt() );
        // Apply at most one fix per known failure signature, re-running the build after each.
        for ( let round = 0; round < 3 && r.code !== 0; round++ ) {
          if ( allowBrandOverlay && !touched.some( t => t.file === 'package.json' ) && isUnsupportedBrandFailure( r.tail ) ) {
            // chipper refuses brands missing from supportedBrands: build-config overlay (accepted by the orchestrator).
            strictError = strictError || summarizeFailure( r.tail, r.code );
            const pkgFile = path.join( simDir, 'package.json' );
            await writeFile( pkgFile, addSupportedBrand( await readFile( pkgFile, 'utf8' ), BRAND ) );
            touched.push( { dir: simDir, file: 'package.json' } );
            overlays.push( `package.json phet.supportedBrands += ${BRAND} (throwaway checkout, reverted after build)` );
          }
          else if ( !touched.some( t => t.dir.endsWith( `${path.sep}chipper` ) && TSC_BUILD_FILES.includes( t.file ) ) && isPrivatePhetioTsconfigFailure( r.tail ) ) {
            // This chipper always runs `tsc --build`, which needs the private phet-io/tsconfig-module.json.
            // Remove just that type-check call (what --type-check=false does in later chippers).
            const chipperDir = path.join( slotRoot, 'chipper' );
            let patched = false;
            for ( const file of TSC_BUILD_FILES ) {
              const f = path.join( chipperDir, file );
              const out = existsSync( f ) ? skipTscBuildPatch( await readFile( f, 'utf8' ) ) : null;
              if ( out ) {
                strictError = strictError || summarizeFailure( r.tail, r.code );
                await writeFile( f, out );
                touched.push( { dir: chipperDir, file } );
                overlays.push( `chipper-skip-tsc: ${file} sim \`tsc --build\` type-check call removed (needs private phet-io/tsconfig-module.json; throwaway checkout, reverted after build)` );
                patched = true;
                break;
              }
            }
            if ( !patched ) { break; }
          }
          else if ( useTypeCheck && isPrivateTypeCheckFailure( r.tail ) ) {
            // Type-checking cannot see the private PhET-iO repos; it does not affect the output, so retry
            // with chipper's documented --type-check=false when that is the ONLY problem.
            typeCheckSkipped = `type-check failed only on missing private PhET-iO files: ${summarizeFailure( r.tail, r.code )}`;
            useTypeCheck = false;
          }
          else { break; }
          log.write( `\n# FIX ${round + 1}: ${overlays.length ? overlays[ overlays.length - 1 ] : ''} ${typeCheckSkipped && !useTypeCheck ? '(type-check off)' : ''}\n` );
          ( { r, args } = await attempt() );
        }
      }
      finally {
        for ( const t of touched ) { await git( [ '-C', t.dir, 'checkout', '--', t.file ] ); }
      }
      // Prove the sources stayed unmodified (tracked files) in every sibling.
      const dirty = [];
      for ( const dir of dirs ) {
        const st = await trackedChanges( path.join( slotRoot, dir ) );
        if ( st ) { dirty.push( `${dir}: ${st.split( '\n' ).slice( 0, 3 ).join( '; ' )}` ); }
      }
      const htmlSrc = path.join( simDir, builtHtmlRelPath( gen, sim.id, BRAND, LOCALE ) );
      if ( r.code === 0 && existsSync( htmlSrc ) ) {
        const dest = path.join( variant.outRoot, outputRelPath( sim.id ) );
        await mkdir( path.dirname( dest ), { recursive: true } );
        if ( inputs ) {
          // Variant build: brand markers, token CSS variables and embedded fonts go into the built file.
          const html = injectIntoHtml( await readFile( htmlSrc, 'utf8' ), {
            tokens: inputs.tokens, theme: variant.theme,
            brand: inputs.wordmarkSha256 ? { wordmarkSha256: inputs.wordmarkSha256, wordmarkPng: inputs.wordmarkPng } : null
          } );
          await writeFile( `${dest}.tmp`, html );
        }
        else {
          await copyFile( htmlSrc, `${dest}.tmp` );
        }
        await rename( `${dest}.tmp`, dest );
        const size = ( await stat( dest ) ).size;
        say( `[slot ${slot}] ${sim.id}: OK ${( size / 1e6 ).toFixed( 1 )} MB` );
        return finish( {
          success: true, outputPath: outputRelPath( sim.id ), nodeVersion: node.version, flags: args,
          overlays, strictError, typeCheckSkipped, outputBytes: size, trackedChangesAfterBuild: dirty
        } );
      }
      lastFailure = {
        error: r.code === 0 ? `grunt exited 0 but ${path.relative( simDir, htmlSrc )} was not produced` : summarizeFailure( r.tail, r.code ),
        nodeVersion: node.version, flags: args, overlays, strictError, typeCheckSkipped, trackedChangesAfterBuild: dirty
      };
      say( `[slot ${slot}] ${sim.id}: FAILED on node ${node.version}: ${lastFailure.error.slice( 0, 200 )}` );
    }
    return finish( { success: false, outputPath: null, ...lastFailure } );
  }
  catch( e ) {
    say( `[slot ${slot}] ${sim.id}: ERROR ${e.message}` );
    log.write( `\n# ERROR ${e.stack}\n` );
    return finish( { success: false, outputPath: null, error: `setup: ${e.message}`.slice( 0, 900 ) } );
  }
  finally {
    if ( release ) { await release(); }
  }
}

/** Serialises matrix writes within this process. */
let matrixChain = Promise.resolve();
/**
 * @param {import('./lib/matrix.mjs').MatrixRecord} record
 * @param {{id: string}[]} sims
 * @param {string} [file] - matrix file (default data/build-matrix.json; variants have their own)
 */
export function saveRecord( record, sims, file ) {
  matrixChain = matrixChain.then( async () => {
    const m = await readMatrix( file );
    await writeMatrix( upsertRecord( m, record, sims ), file );
  } );
  return matrixChain;
}

/**
 * Parses shared build CLI flags.
 * @param {string[]} argv
 */
export function parseBuildArgs( argv ) {
  const out = { ids: [], slot: 0, nodeMajors: [ 24 ], allowBrandOverlay: true, typeCheck: true, force: false, jobs: null,
                brand: 'adapted-from-phet', theme: false };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--slot' ) ) { out.slot = Number( val() ); }
    else if ( a.startsWith( '--node' ) ) { out.nodeMajors = val().split( ',' ).map( Number ); }
    else if ( a.startsWith( '--jobs' ) ) { out.jobs = val(); }
    else if ( a === '--allow-brand-overlay' ) { out.allowBrandOverlay = true; } // default; kept for compatibility
    else if ( a === '--no-brand-overlay' ) { out.allowBrandOverlay = false; }
    else if ( a === '--no-type-check' ) { out.typeCheck = false; }
    else if ( a === '--force' ) { out.force = true; }
    else if ( a === '--brand' || a.startsWith( '--brand=' ) ) { out.brand = val(); }
    else if ( a === '--theme' ) { out.theme = true; }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else { out.ids.push( a ); }
  }
  if ( out.nodeMajors.some( n => !Number.isInteger( n ) || n < 8 ) ) { throw new Error( '--node expects majors like 24 or 24,20' ); }
  if ( !BRANDS.includes( out.brand ) ) { throw new Error( `--brand expects one of ${BRANDS.join( ', ' )}` ); }
  return out;
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main( argv ) {
  const opts = parseBuildArgs( argv );
  if ( opts.ids.length !== 1 ) { throw new Error( 'usage: build-sim.mjs <sim-id> [--slot N] [--node 24,20] [--no-brand-overlay] [--no-type-check] [--force] [--brand bsshs] [--theme]' ); }
  const all = await loadSims();
  const [ sim ] = selectSims( all, opts.ids );
  const variant = buildVariant( opts );
  if ( !opts.force ) {
    const m = await readMatrix( variant.matrixFile );
    const prev = m.sims.find( r => r.id === sim.id );
    const manifest = await resolveSim( sim );
    const inputs = await variantInputs( opts );
    if ( shouldSkip( prev, { expectedDepsHash: manifest.depsHash, outputExists: existsSync( path.join( variant.outRoot, outputRelPath( sim.id ) ) ),
                             ...( inputs ? { expectedThemeHash: inputs.themeHash } : {} ) } ) ) {
      console.log( `${sim.id}: already built (${prev.outputPath}); use --force to rebuild` );
      return 0;
    }
  }
  const record = await buildSim( sim, opts );
  await saveRecord( record, all, variant.matrixFile );
  console.log( record.success ? `built ${path.join( variant.outRoot, record.outputPath )}` : `FAILED ${sim.id}: ${record.error}` );
  return record.success ? 0 : 1;
}

if ( isMain( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).then( code => { process.exitCode = code; }, e => { console.error( e.message ); process.exitCode = 2; } );
}
