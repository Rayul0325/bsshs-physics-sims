// Unit tests for the original-sim build tooling (tools/lib/new-sims.mjs, tools/build-new-sim.mjs,
// build-all --include-new). No PhET checkout is needed: staging is exercised on temp dirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  listNewSimIds, validateNewSimPackage, readNewSim, newSimLibraries, listSourceFiles, sourceHash,
  stageSim, unstageSim, slotShaMismatches, stageKoStrings, unstageKoStrings, classifyTscOutput, splitNewSimFlags, scaffoldNewSim, namesFor,
  TEMPLATE_ID, SIMS_DIR, NEW_SIM_BRAND
} from '../../tools/lib/new-sims.mjs';
import { readMatrix } from '../../tools/lib/matrix.mjs';
import { MATRIX_JSON } from '../../tools/lib/paths.mjs';
import { CORE_LIBS } from '../../tools/lib/manifest.mjs';

const tmp = () => mkdtempSync( path.join( tmpdir(), 'bsshs-new-sims-' ) );
const git = ( dir, ...args ) => execFileSync( 'git', [ '-C', dir, ...args ], { encoding: 'utf8' } ).trim();

/** A minimal valid sim source dir. */
function fakeSim( root, id, repo = id ) {
  const dir = path.join( root, id );
  mkdirSync( path.join( dir, 'js', 'model' ), { recursive: true } );
  writeFileSync( path.join( dir, 'package.json' ), JSON.stringify( {
    name: repo, version: '1.0.0', license: 'GPL-3.0',
    phet: { requirejsNamespace: repo.toUpperCase().replace( /-/g, '_' ), runnable: true, simulation: true, supportedBrands: [ NEW_SIM_BRAND ] }
  } ) );
  writeFileSync( path.join( dir, `${repo}-strings_en.json` ), '{}' );
  writeFileSync( path.join( dir, 'js', `${repo}-main.ts` ), '// main\n' );
  writeFileSync( path.join( dir, 'js', 'model', 'M.ts' ), 'export default 1;\n' );
  writeFileSync( path.join( dir, '.gitignore' ), 'build/\nnode_modules/\n' );
  return dir;
}

test( 'listNewSimIds excludes _template (and any _-prefixed dir) unless asked', () => {
  const root = tmp();
  fakeSim( root, 'alpha' );
  fakeSim( root, '_template', 'bsshs-template' );
  fakeSim( root, 'beta' );
  mkdirSync( path.join( root, 'not-a-sim' ) ); // no package.json
  assert.deepEqual( listNewSimIds( root ), [ 'alpha', 'beta' ] );
  assert.deepEqual( listNewSimIds( root, { includeTemplate: true } ), [ '_template', 'alpha', 'beta' ] );
  assert.deepEqual( listNewSimIds( path.join( root, 'missing' ) ), [] );
  assert.ok( !listNewSimIds().includes( TEMPLATE_ID ), 'the real sims/ listing never returns _template' );
} );

test( 'validateNewSimPackage enforces chipper naming and the brand slot', () => {
  const ok = { name: 'photo-demo', version: '1.0.0', phet: { requirejsNamespace: 'PHOTO_DEMO', runnable: true, supportedBrands: [ NEW_SIM_BRAND ] } };
  assert.deepEqual( validateNewSimPackage( 'photo-demo', ok ), [] );
  assert.match( validateNewSimPackage( 'other', ok ).join( ';' ), /must equal the folder id/ );
  assert.match( validateNewSimPackage( 'x2', { ...ok, name: 'x2' } ).join( ';' ), /lower-case letters/ );
  assert.match( validateNewSimPackage( 'photo-demo', { ...ok, phet: { ...ok.phet, supportedBrands: [ 'phet' ] } } ).join( ';' ), /supportedBrands/ );
  assert.match( validateNewSimPackage( 'photo-demo', { ...ok, phet: { ...ok.phet, runnable: false } } ).join( ';' ), /runnable/ );
  assert.match( validateNewSimPackage( 'photo-demo', { ...ok, phet: { ...ok.phet, requirejsNamespace: 'X' } } ).join( ';' ), /requirejsNamespace/ );
  // _-prefixed folders (the template) may use any valid repo name, because chipper rejects '_'.
  assert.deepEqual( validateNewSimPackage( '_template', { ...ok, name: 'bsshs-template', phet: { ...ok.phet, requirejsNamespace: 'BSSHS_TEMPLATE' } } ), [] );
} );

test( 'the real template is a valid new sim with a Korean title and a model folder', () => {
  const sim = readNewSim( TEMPLATE_ID );
  assert.equal( sim.repo, 'bsshs-template' );
  assert.ok( sim.pkg.phet.supportedBrands.includes( NEW_SIM_BRAND ) );
  const strings = JSON.parse( readFileSync( path.join( sim.srcDir, `${sim.repo}-strings_en.json` ), 'utf8' ) );
  assert.match( strings[ sim.repo ].title.value, /[가-힣]/, 'title is Korean' );
  assert.ok( existsSync( path.join( sim.srcDir, 'js', 'model' ) ) );
  assert.ok( existsSync( path.join( sim.srcDir, 'js', 'view' ) ) );
} );

test( 'newSimLibraries = newSimBase deps minus the base sim and other simulation repos (exact SHAs)', () => {
  const base = { id: 's', deps: { s: 'a'.repeat( 40 ), 'other-sim': 'b'.repeat( 40 ), chipper: 'c'.repeat( 40 ), joist: 'd'.repeat( 40 ) } };
  assert.deepEqual( newSimLibraries( base, new Set( [ 'other-sim' ] ) ), { chipper: 'c'.repeat( 40 ), joist: 'd'.repeat( 40 ) } );
} );

test( 'the libraries taken from the real newSimBase keep every core lib, chipper and perennial-alias at the pinned SHA', async () => {
  const { newSimBase: base } = await readMatrix( MATRIX_JSON );
  assert.ok( base && base.deps, 'data/build-matrix.json has newSimBase' );
  const libs = newSimLibraries( base, new Set( [ 'energy-skate-park' ] ) );
  for ( const lib of [ ...CORE_LIBS, 'chipper', 'perennial-alias', 'brand', 'phetcommon' ] ) {
    assert.equal( libs[ lib ], base.deps[ lib ], `${lib} pinned to newSimBase` );
  }
  assert.ok( !( base.id in libs ) );
} );

test( 'sourceHash and listSourceFiles ignore node_modules/build/.DS_Store and change with content', () => {
  const root = tmp();
  const dir = fakeSim( root, 'gamma' );
  const h1 = sourceHash( dir );
  mkdirSync( path.join( dir, 'node_modules', 'grunt' ), { recursive: true } );
  writeFileSync( path.join( dir, 'node_modules', 'grunt', 'x.js' ), '1' );
  mkdirSync( path.join( dir, 'build' ) );
  writeFileSync( path.join( dir, 'build', 'out.html' ), '1' );
  writeFileSync( path.join( dir, '.DS_Store' ), '1' );
  assert.equal( sourceHash( dir ), h1 );
  assert.ok( !listSourceFiles( dir ).some( f => /node_modules|build\/|DS_Store/.test( f ) ) );
  writeFileSync( path.join( dir, 'js', 'model', 'M.ts' ), 'export default 2;\n' );
  assert.notEqual( sourceHash( dir ), h1 );
} );

test( 'stageSim is idempotent: same source -> same commit, clean tree, node_modules kept', async () => {
  const root = tmp();
  const src = fakeSim( root, 'delta' );
  const slot = path.join( root, 'slot' );
  const dest = path.join( slot, 'delta' );
  const keep = path.join( slot, '.new-sims-keep' );
  const a = await stageSim( src, dest, { keepDir: keep } );
  assert.match( a.sha, /^[0-9a-f]{40}$/ );
  assert.equal( git( dest, 'status', '--porcelain' ), '' );
  // A build leaves node_modules and build/ behind (both ignored).
  mkdirSync( path.join( dest, 'node_modules', 'grunt' ), { recursive: true } );
  writeFileSync( path.join( dest, 'node_modules', 'grunt', 'x.js' ), 'kept' );
  mkdirSync( path.join( dest, 'build' ) );
  writeFileSync( path.join( dest, 'build', 'junk.html' ), 'x' );
  writeFileSync( path.join( dest, 'stray.txt' ), 'x' ); // untracked leftover must vanish on re-stage
  const b = await stageSim( src, dest, { keepDir: keep } );
  assert.equal( b.sha, a.sha, 'deterministic commit' );
  assert.equal( git( dest, 'status', '--porcelain', '--ignored' ), '!! node_modules/' );
  assert.equal( readFileSync( path.join( dest, 'node_modules', 'grunt', 'x.js' ), 'utf8' ), 'kept' );
  assert.ok( !existsSync( path.join( dest, 'stray.txt' ) ) );
  // A source change gives a different commit; deleted files disappear.
  rmSync( path.join( src, 'js', 'model', 'M.ts' ) );
  const c = await stageSim( src, dest, { keepDir: keep } );
  assert.notEqual( c.sha, a.sha );
  assert.ok( !existsSync( path.join( dest, 'js', 'model', 'M.ts' ) ) );
  assert.deepEqual( c.files, listSourceFiles( src ) );
} );

test( 'unstageSim is idempotent and parks node_modules for the next stage', async () => {
  const root = tmp();
  const src = fakeSim( root, 'eps' );
  const slot = path.join( root, 'slot' );
  const dest = path.join( slot, 'eps' );
  const keep = path.join( slot, '.new-sims-keep' );
  await stageSim( src, dest, { keepDir: keep } );
  mkdirSync( path.join( dest, 'node_modules' ) );
  writeFileSync( path.join( dest, 'node_modules', 'm' ), 'kept' );
  await unstageSim( dest, { keepDir: keep } );
  assert.ok( !existsSync( dest ) );
  await unstageSim( dest, { keepDir: keep } ); // second call: no-op
  assert.ok( !existsSync( dest ) );
  assert.deepEqual( readdirSync( slot ).filter( n => !n.startsWith( '.' ) ), [], 'nothing visible left in the slot' );
  await stageSim( src, dest, { keepDir: keep } );
  assert.equal( readFileSync( path.join( dest, 'node_modules', 'm' ), 'utf8' ), 'kept' );
} );

test( 'stageSim and unstageSim refuse a directory they did not create (a PhET checkout)', async () => {
  const root = tmp();
  const src = fakeSim( root, 'zeta' );
  const foreign = path.join( root, 'slot', 'zeta' );
  mkdirSync( foreign, { recursive: true } );
  git( foreign, 'init', '--quiet' );
  await assert.rejects( stageSim( src, foreign, { keepDir: path.join( root, 'k' ) } ), /not a staged new sim/ );
  await assert.rejects( unstageSim( foreign, { keepDir: path.join( root, 'k' ) } ), /not a staged new sim/ );
  assert.ok( existsSync( path.join( foreign, '.git' ) ) );
} );

test( 'stageKoStrings puts the Korean strings into babel as the ko file and unstageKoStrings removes it (idempotent)', async () => {
  const root = tmp();
  const src = fakeSim( root, 'eta' );
  writeFileSync( path.join( src, 'eta-strings_en.json' ), '{"eta":{"title":{"value":"한글"}}}' );
  const babel = path.join( root, 'babel' );
  mkdirSync( path.join( babel, 'joist' ), { recursive: true } );
  git( babel, 'init', '--quiet' );
  writeFileSync( path.join( babel, 'joist', 'joist-strings_ko.json' ), '{}' );
  git( babel, 'add', '.' );
  git( babel, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'b' );
  const file = await stageKoStrings( babel, src, 'eta' );
  assert.equal( file, path.join( babel, 'eta', 'eta-strings_ko.json' ) );
  assert.equal( readFileSync( file, 'utf8' ), '{"eta":{"title":{"value":"한글"}}}' );
  await stageKoStrings( babel, src, 'eta' ); // twice: same result
  // An own <repo>-strings_ko.json wins over the _en file.
  writeFileSync( path.join( src, 'eta-strings_ko.json' ), '{"ko":1}' );
  assert.equal( readFileSync( await stageKoStrings( babel, src, 'eta' ), 'utf8' ), '{"ko":1}' );
  await unstageKoStrings( babel, 'eta' );
  await unstageKoStrings( babel, 'eta' );
  assert.equal( git( babel, 'status', '--porcelain', '--untracked-files=all' ), '' );
  // A repo name that PhET's babel already tracks is refused (it would shadow a real translation).
  await assert.rejects( stageKoStrings( babel, src, 'joist' ), /already tracked/ );
  await assert.rejects( unstageKoStrings( babel, 'joist' ), /already tracked/ );
  assert.ok( existsSync( path.join( babel, 'joist', 'joist-strings_ko.json' ) ) );
} );

test( 'slotShaMismatches reports any sibling whose HEAD is not the newSimBase SHA', async () => {
  const root = tmp();
  const mk = name => {
    const d = path.join( root, name );
    mkdirSync( d );
    git( d, 'init', '--quiet' );
    writeFileSync( path.join( d, 'f' ), name );
    git( d, 'add', 'f' );
    git( d, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', name );
    return git( d, 'rev-parse', 'HEAD' );
  };
  const a = mk( 'axon' );
  mk( 'dot' );
  assert.deepEqual( await slotShaMismatches( root, { axon: a } ), [] );
  const bad = await slotShaMismatches( root, { axon: a, dot: 'f'.repeat( 40 ), kite: 'e'.repeat( 40 ) } );
  assert.equal( bad.length, 2 );
  assert.match( bad.join( ';' ), /dot: HEAD .* != f{40}/ );
  assert.match( bad.join( ';' ), /kite: missing/ );
} );

test( 'splitNewSimFlags leaves the 63-sim argv untouched unless --include-new/--new-only is given', () => {
  const argv = [ '--brand', 'bsshs', '--theme', '--jobs', '4', 'faradays-law' ];
  assert.deepEqual( splitNewSimFlags( argv ), { includeNew: false, newOnly: false, rest: argv } );
  assert.deepEqual( splitNewSimFlags( [ '--include-new', ...argv ] ), { includeNew: true, newOnly: false, rest: argv } );
  assert.deepEqual( splitNewSimFlags( [ '--new-only' ] ), { includeNew: true, newOnly: true, rest: [] } );
} );

test( 'scaffoldNewSim copies the template under the new names and leaves no template name behind', () => {
  const root = tmp();
  const out = scaffoldNewSim( 'light-demo', { simsDir: root, title: '빛 실험' } );
  assert.equal( out, path.join( root, 'light-demo' ) );
  const n = namesFor( 'light-demo' );
  assert.deepEqual( n, { repo: 'light-demo', pascal: 'LightDemo', camel: 'lightDemo', constant: 'LIGHT_DEMO' } );
  const files = listSourceFiles( out );
  assert.ok( files.includes( 'light-demo-strings_en.json' ) );
  assert.ok( files.includes( 'js/light-demo-main.ts' ) );
  assert.ok( files.includes( 'js/LightDemoStrings.ts' ) );
  assert.ok( files.some( f => f.startsWith( 'js/model/' ) ) );
  assert.ok( !files.includes( 'README.md' ), 'the template how-to is not copied' );
  assert.ok( files.includes( '.gitignore' ) && files.includes( 'Gruntfile.cjs' ) && files.includes( 'tsconfig.json' ) );
  for ( const f of files ) {
    const text = readFileSync( path.join( out, f ), 'utf8' );
    assert.ok( !/bsshs-template|BsshsTemplate|bsshsTemplate|BSSHS_TEMPLATE/.test( text ), `${f} still names the template` );
    assert.ok( !/bsshs-template|BsshsTemplate|bsshsTemplate/.test( f ), `${f} path still names the template` );
  }
  const pkg = JSON.parse( readFileSync( path.join( out, 'package.json' ), 'utf8' ) );
  assert.deepEqual( validateNewSimPackage( 'light-demo', pkg ), [] );
  const strings = JSON.parse( readFileSync( path.join( out, 'light-demo-strings_en.json' ), 'utf8' ) );
  assert.equal( strings[ 'light-demo' ].title.value, '빛 실험' );
  assert.throws( () => scaffoldNewSim( 'light-demo', { simsDir: root } ), /already exists/ );
  assert.throws( () => scaffoldNewSim( 'bad_id', { simsDir: root } ), /lower-case letters/ );
} );

test( 'classifyTscOutput splits errors in the sim from errors in the pinned libraries', () => {
  const out = [
    "../joist/js/simLauncher.ts(11,35): error TS2792: Cannot find module '../../phet-io/js/phetioEngine.js'.",
    "js/model/M.ts(15,13): error TS2613: Module 'x' has no default export.",
    '  continuation line of the previous message',
    "js/view/V.ts(3,1): error TS2304: Cannot find name 'foo'."
  ].join( '\n' );
  const r = classifyTscOutput( out );
  assert.equal( r.simErrors.length, 2 );
  assert.match( r.simErrors[ 0 ], /^js\/model\/M\.ts/ );
  assert.equal( r.libraryErrors.length, 1 );
  assert.deepEqual( classifyTscOutput( '' ), { simErrors: [], libraryErrors: [] } );
} );

test( 'SIMS_DIR points at <repo>/sims', () => {
  assert.equal( path.basename( SIMS_DIR ), 'sims' );
} );
