// Original sims (sims/<id>/, our own code on PhET's MIT libraries): discovery, validation, staging into a
// slot checkout, and the library set they build against (data/build-matrix.json newSimBase). See docs/new-sims.md.
//
// Staging model: a slot is a sibling tree of PhET repos checked out at fixed SHAs. A new sim is copied in
// as one more sibling, `<slot>/<repo>`, and committed into a throwaway git repo with a fixed author and date,
// so the same source always gives the same commit SHA (chipper records sibling SHAs in the build). A marker
// inside its .git says the directory is ours; staging and unstaging refuse any directory without it, so a
// PhET checkout is never deleted. node_modules (grunt only) is parked in a dot-dir of the slot between builds,
// which arrangeSlot() never touches.
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { mkdir, rm, rename, writeFile, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { REPO_ROOT } from './paths.mjs';
import { run, runOk } from './exec.mjs';

/** Folder of the original sims (one subfolder per sim). */
export const SIMS_DIR = path.join( REPO_ROOT, 'sims' );
/** The example sim; never part of a public build. */
export const TEMPLATE_ID = '_template';
/** Build record of the original sims (the 63-sim matrices are never touched). */
export const NEW_SIMS_MATRIX = path.join( REPO_ROOT, 'data', 'build-matrix.new-sims.json' );
/** The brand slot the bsshs brand rides in (docs/theme.md); every new sim must list it in supportedBrands. */
export const NEW_SIM_BRAND = 'adapted-from-phet';
/** chipper's own rule for a repo name (gruntMain.js): lower-case letters, single dashes. No digits, no '_'. */
export const REPO_NAME_RE = /^[a-z]+(-[a-z]+)*$/;
/** Marker file inside a staged sim's .git (proves the directory was created by stageSim). */
export const STAGE_MARKER = 'bsshs-new-sim';
/** Paths never copied, hashed or staged. */
const SKIP_NAMES = new Set( [ 'node_modules', 'build', 'dist', '.git', '.DS_Store' ] );

/** Fixed identity/date for staged commits: same tree -> same SHA, no personal names. */
const STAGE_GIT_ENV = {
  GIT_AUTHOR_NAME: 'bsshs-physics-sims contributors',
  GIT_AUTHOR_EMAIL: 'contributors@bsshs-physics-sims.invalid',
  GIT_COMMITTER_NAME: 'bsshs-physics-sims contributors',
  GIT_COMMITTER_EMAIL: 'contributors@bsshs-physics-sims.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00+0000',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00+0000',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1'
};
const stageGit = ( dir, args ) => runOk( 'git', [ '-C', dir, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.autocrlf=false', ...args ],
  { env: { ...process.env, ...STAGE_GIT_ENV } } );

/**
 * Ids of the original sims: subfolders of `dir` with a package.json. `_`-prefixed folders (the template)
 * are excluded unless includeTemplate.
 * @param {string} [dir]
 * @param {{ includeTemplate?: boolean }} [opts]
 * @returns {string[]} sorted
 */
export function listNewSimIds( dir = SIMS_DIR, opts = {} ) {
  if ( !existsSync( dir ) ) { return []; }
  return readdirSync( dir )
    .filter( name => ( opts.includeTemplate || !name.startsWith( '_' ) ) && !name.startsWith( '.' ) &&
                     existsSync( path.join( dir, name, 'package.json' ) ) )
    .sort();
}

/**
 * Checks a new sim's package.json. The repo name is what chipper sees (slot dir, string file prefix).
 * @param {string} id - folder name under sims/
 * @param {any} pkg
 * @returns {string[]} problems (empty = valid)
 */
export function validateNewSimPackage( id, pkg ) {
  const errors = [];
  const name = pkg && pkg.name;
  if ( typeof name !== 'string' || !REPO_NAME_RE.test( name ) ) {
    errors.push( `${id}: package.json name ${JSON.stringify( name )} must be lower-case letters with single dashes (chipper rule; no digits or '_')` );
  }
  if ( !id.startsWith( '_' ) && name !== id ) { errors.push( `${id}: package.json name ${JSON.stringify( name )} must equal the folder id` ); }
  if ( !id.startsWith( '_' ) && !REPO_NAME_RE.test( id ) ) { errors.push( `${id}: folder id must be lower-case letters with single dashes` ); }
  if ( typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test( pkg.version ) ) { errors.push( `${id}: version must be MAJOR.MINOR.PATCH` ); }
  const phet = pkg.phet || {};
  if ( phet.runnable !== true ) { errors.push( `${id}: phet.runnable must be true` ); }
  if ( typeof name === 'string' && phet.requirejsNamespace !== name.toUpperCase().replace( /-/g, '_' ) ) {
    errors.push( `${id}: phet.requirejsNamespace must be ${name.toUpperCase().replace( /-/g, '_' )}` );
  }
  if ( !Array.isArray( phet.supportedBrands ) || !phet.supportedBrands.includes( NEW_SIM_BRAND ) ) {
    errors.push( `${id}: phet.supportedBrands must include ${NEW_SIM_BRAND} (the slot the bsshs brand rides in)` );
  }
  return errors;
}

/**
 * Reads and validates one original sim (package.json, strings file, entry point, model folder).
 * @param {string} id
 * @param {string} [dir]
 * @returns {{ id: string, repo: string, version: string, srcDir: string, pkg: any }}
 */
export function readNewSim( id, dir = SIMS_DIR ) {
  const srcDir = path.join( dir, id );
  const pkgFile = path.join( srcDir, 'package.json' );
  if ( !existsSync( pkgFile ) ) { throw new Error( `no original sim at ${path.relative( REPO_ROOT, srcDir ) || srcDir} (package.json missing)` ); }
  const pkg = JSON.parse( readFileSync( pkgFile, 'utf8' ) );
  const errors = validateNewSimPackage( id, pkg );
  const repo = pkg.name;
  if ( !errors.length ) {
    const need = [ `${repo}-strings_en.json`, `js/${repo}-main.ts|js/${repo}-main.js`, 'js/model' ];
    for ( const alt of need ) {
      if ( !alt.split( '|' ).some( f => existsSync( path.join( srcDir, f ) ) ) ) { errors.push( `${id}: missing ${alt.replace( '|', ' or ' )}` ); }
    }
  }
  if ( errors.length ) { throw new Error( `invalid original sim:\n  ${errors.join( '\n  ' )}` ); }
  return { id, repo, version: pkg.version, srcDir, pkg };
}

/**
 * The library set a new sim builds against: newSimBase's pinned dependency SHAs minus the base sim itself
 * and minus any other simulation repo it pulled in (e.g. energy-skate-park). chipper and perennial-alias stay.
 * @param {{ id: string, deps: Record<string,string> }} base
 * @param {Set<string>} simulationRepos - dependency dirs whose package.json declares phet.simulation
 * @returns {Record<string,string>} sibling dir -> SHA
 */
export function newSimLibraries( base, simulationRepos ) {
  /** @type {Record<string,string>} */
  const out = {};
  for ( const [ dir, sha ] of Object.entries( base.deps ) ) {
    if ( dir === base.id || simulationRepos.has( dir ) ) { continue; }
    out[ dir ] = sha;
  }
  return out;
}

/**
 * Files of a sim source dir (posix, sorted), without node_modules/build/dist/.git/.DS_Store.
 * @param {string} dir
 * @returns {string[]}
 */
export function listSourceFiles( dir ) {
  const out = [];
  const walk = rel => {
    for ( const name of readdirSync( path.join( dir, rel ) ) ) {
      if ( SKIP_NAMES.has( name ) ) { continue; }
      const r = rel ? `${rel}/${name}` : name;
      if ( statSync( path.join( dir, r ) ).isDirectory() ) { walk( r ); }
      else { out.push( r ); }
    }
  };
  walk( '' );
  return out.sort();
}

/**
 * sha256 over the source files (paths + bytes). Decides whether a new sim must be rebuilt.
 * @param {string} dir
 * @returns {string}
 */
export function sourceHash( dir ) {
  const h = createHash( 'sha256' );
  for ( const f of listSourceFiles( dir ) ) {
    const bytes = readFileSync( path.join( dir, f ) );
    h.update( `${f}\n${bytes.length}\n` ).update( bytes ).update( '\n' );
  }
  return h.digest( 'hex' );
}

/** @param {string} dir @returns {boolean} true when dir is a sim staged by stageSim */
const isStaged = dir => existsSync( path.join( dir, '.git', STAGE_MARKER ) );

/** @param {string} keepDir @param {string} dest */
const keptModules = ( keepDir, dest ) => path.join( keepDir, path.basename( dest ), 'node_modules' );

/**
 * Copies a sim source into `<slot>/<repo>` and commits it into a throwaway git repo (fixed author/date,
 * deterministic SHA). Idempotent: an earlier stage of the same or another version is replaced; its
 * node_modules (ignored) is kept. Refuses an existing directory it did not create.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {{ keepDir: string, generated?: Record<string, string> }} opts - keepDir: where node_modules is parked between
 *   builds; generated: extra files (path relative to the sim folder -> text) written into the staged copy and committed
 *   with it, e.g. the token module (theme/sim-tokens-module.mjs). They are never written under sims/.
 * @returns {Promise<{ sha: string, files: string[] }>}
 */
export async function stageSim( srcDir, destDir, { keepDir, generated = {} } ) {
  if ( existsSync( destDir ) && !isStaged( destDir ) ) {
    throw new Error( `${destDir} exists and is not a staged new sim (no .git/${STAGE_MARKER}); refusing to replace it` );
  }
  const files = listSourceFiles( srcDir );
  for ( const f of Object.keys( generated ) ) {
    if ( files.includes( f ) ) { throw new Error( `generated file ${f} would overwrite a source file of ${srcDir}` ); }
  }
  // Keep node_modules from this dir (previous stage) or from the parking spot (previous unstage).
  const parked = keptModules( keepDir, destDir );
  if ( existsSync( path.join( destDir, 'node_modules' ) ) ) {
    await rm( parked, { recursive: true, force: true } );
    await mkdir( path.dirname( parked ), { recursive: true } );
    await rename( path.join( destDir, 'node_modules' ), parked );
  }
  await rm( destDir, { recursive: true, force: true } );
  await mkdir( destDir, { recursive: true } );
  for ( const f of files ) {
    await mkdir( path.dirname( path.join( destDir, f ) ), { recursive: true } );
    await copyFile( path.join( srcDir, f ), path.join( destDir, f ) );
  }
  for ( const [ f, text ] of Object.entries( generated ) ) {
    await mkdir( path.dirname( path.join( destDir, f ) ), { recursive: true } );
    await writeFile( path.join( destDir, f ), text );
    files.push( f );
  }
  await stageGit( destDir, [ 'init', '--quiet', '--template=', '--initial-branch=main' ] );
  await writeFile( path.join( destDir, '.git', STAGE_MARKER ), `staged from ${srcDir}\n` );
  await stageGit( destDir, [ 'add', '--all', '--force', '--', ...files ] );
  await stageGit( destDir, [ 'commit', '--quiet', '--no-verify', '-m', `staged ${path.basename( destDir )}` ] );
  if ( existsSync( parked ) ) { await rename( parked, path.join( destDir, 'node_modules' ) ); }
  const sha = ( await stageGit( destDir, [ 'rev-parse', 'HEAD' ] ) ).trim();
  return { sha, files };
}

/**
 * Removes a staged sim from the slot; its node_modules is parked in keepDir for the next stage.
 * Idempotent (a missing dir is fine). Refuses a directory stageSim did not create.
 * @param {string} destDir
 * @param {{ keepDir: string }} opts
 */
export async function unstageSim( destDir, { keepDir } ) {
  if ( !existsSync( destDir ) ) { return; }
  if ( !isStaged( destDir ) ) { throw new Error( `${destDir} is not a staged new sim (no .git/${STAGE_MARKER}); refusing to delete it` ); }
  const modules = path.join( destDir, 'node_modules' );
  if ( existsSync( modules ) ) {
    const parked = keptModules( keepDir, destDir );
    await rm( parked, { recursive: true, force: true } );
    await mkdir( path.dirname( parked ), { recursive: true } );
    await rename( modules, parked );
  }
  await rm( destDir, { recursive: true, force: true } );
}

/**
 * Throws when PhET's babel tracks anything under `<repo>/` (our file would shadow a real translation).
 * @param {string} babelDir
 * @param {string} repo
 */
async function assertBabelFree( babelDir, repo ) {
  const tracked = await runOk( 'git', [ '-C', babelDir, 'ls-files', '--', `${repo}/` ] );
  if ( tracked ) { throw new Error( `babel already tracked ${repo}/ (${tracked.split( '\n' )[ 0 ]}); pick another repo name` ); }
}

/**
 * chipper only builds a locale it finds as babel/<repo>/<repo>-strings_<locale>.json
 * (getLocalesFromRepository); without it a `--locales=ko` build silently runs as `en`. Our sims author
 * Korean in <repo>-strings_en.json (chipper's required fallback file, which defines the keys), so this
 * writes that file, or <repo>-strings_ko.json when the sim has one, as the babel ko file of the slot.
 * The file is untracked in babel and removed by unstageKoStrings. Idempotent.
 * @param {string} babelDir
 * @param {string} srcDir
 * @param {string} repo
 * @returns {Promise<string>} the written file
 */
export async function stageKoStrings( babelDir, srcDir, repo ) {
  await assertBabelFree( babelDir, repo );
  const own = path.join( srcDir, `${repo}-strings_ko.json` );
  const from = existsSync( own ) ? own : path.join( srcDir, `${repo}-strings_en.json` );
  const dest = path.join( babelDir, repo, `${repo}-strings_ko.json` );
  await mkdir( path.dirname( dest ), { recursive: true } );
  await copyFile( from, dest );
  return dest;
}

/**
 * Removes babel/<repo>/ written by stageKoStrings. Idempotent; refuses a folder babel tracks.
 * @param {string} babelDir
 * @param {string} repo
 */
export async function unstageKoStrings( babelDir, repo ) {
  if ( !existsSync( path.join( babelDir, repo ) ) ) { return; }
  await assertBabelFree( babelDir, repo );
  await rm( path.join( babelDir, repo ), { recursive: true, force: true } );
}

/**
 * Siblings in a slot whose checked-out HEAD differs from the expected SHA (or that are missing).
 * @param {string} slotRoot
 * @param {Record<string,string>} libs - dir -> expected SHA
 * @returns {Promise<string[]>} one line per mismatch (empty = all match)
 */
export async function slotShaMismatches( slotRoot, libs ) {
  const bad = [];
  for ( const [ dir, sha ] of Object.entries( libs ) ) {
    const r = await run( 'git', [ '-C', path.join( slotRoot, dir ), 'rev-parse', 'HEAD' ] );
    if ( r.code !== 0 ) { bad.push( `${dir}: missing` ); continue; }
    const head = r.stdout.trim();
    if ( head !== sha ) { bad.push( `${dir}: HEAD ${head} != ${sha}` ); }
  }
  return bad;
}

/**
 * Sorts `tsc -b --pretty false` error lines (run in the staged sim dir) by where they point: the sim's own
 * files fail the build; pinned-library errors (e.g. the private ../../phet-io module that is not public)
 * are only recorded.
 * @param {string} text
 * @returns {{ simErrors: string[], libraryErrors: string[] }}
 */
export function classifyTscOutput( text ) {
  const simErrors = [];
  const libraryErrors = [];
  for ( const line of String( text ).split( '\n' ) ) {
    const m = /^(\S[^(]*)\(\d+,\d+\): error TS\d+/.exec( line );
    if ( !m ) { continue; }
    ( m[ 1 ].startsWith( '../' ) ? libraryErrors : simErrors ).push( line.trim() );
  }
  return { simErrors, libraryErrors };
}

/**
 * Splits build-all's new-sim flags off the argv; the rest goes to the unchanged 63-sim parser.
 * @param {string[]} argv
 * @returns {{ includeNew: boolean, newOnly: boolean, rest: string[] }}
 */
export function splitNewSimFlags( argv ) {
  const newOnly = argv.includes( '--new-only' );
  const includeNew = newOnly || argv.includes( '--include-new' );
  return { includeNew, newOnly, rest: argv.filter( a => a !== '--include-new' && a !== '--new-only' ) };
}

/**
 * Name forms of a repo name, as chipper derives them (kebab -> Pascal for *Strings modules).
 * @param {string} repo
 * @returns {{ repo: string, pascal: string, camel: string, constant: string }}
 */
export function namesFor( repo ) {
  const parts = repo.split( '-' );
  const pascal = parts.map( p => p[ 0 ].toUpperCase() + p.slice( 1 ) ).join( '' );
  return { repo, pascal, camel: pascal[ 0 ].toLowerCase() + pascal.slice( 1 ), constant: parts.join( '_' ).toUpperCase() };
}

/**
 * Creates sims/<id>/ from the template, renaming every template name (paths and contents).
 * @param {string} id
 * @param {{ simsDir?: string, from?: string, title?: string }} [opts]
 * @returns {string} the new sim folder
 */
export function scaffoldNewSim( id, opts = {} ) {
  const simsDir = opts.simsDir || SIMS_DIR;
  if ( !REPO_NAME_RE.test( id ) ) { throw new Error( `sim id ${JSON.stringify( id )} must be lower-case letters with single dashes (chipper rule)` ); }
  const dest = path.join( simsDir, id );
  if ( existsSync( dest ) ) { throw new Error( `${dest} already exists` ); }
  const template = readNewSim( opts.from || TEMPLATE_ID );
  const from = namesFor( template.repo );
  const to = namesFor( id );
  const rename = s => s.split( from.repo ).join( to.repo ).split( from.pascal ).join( to.pascal )
    .split( from.camel ).join( to.camel ).split( from.constant ).join( to.constant );
  for ( const f of listSourceFiles( template.srcDir ) ) {
    if ( f === 'README.md' ) { continue; } // the template's how-to stays with the template
    const out = path.join( dest, rename( f ) );
    mkdirSync( path.dirname( out ), { recursive: true } );
    if ( /\.(ts|js|mjs|cjs|json|md)$/.test( f ) || path.basename( f ) === '.gitignore' ) {
      let text = rename( readFileSync( path.join( template.srcDir, f ), 'utf8' ) );
      if ( f === `${from.repo}-strings_en.json` && opts.title ) {
        const json = JSON.parse( text );
        json[ to.repo ].title.value = opts.title;
        text = JSON.stringify( json, null, 2 ) + '\n';
      }
      writeFileSync( out, text );
    }
    else { cpSync( path.join( template.srcDir, f ), out ); }
  }
  return dest;
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>} names in dir ([] when missing)
 */
export async function namesIn( dir ) {
  try { return await readdir( dir ); } catch { return []; }
}
