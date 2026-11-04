// Spec 2.3: an id in data/exam-scope.json without its adapter, V3 cases or lessons file fails the build,
// and ALL missing items are printed at once (drawer/inject.mjs; site/build-site.mjs calls it first).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync, cpSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingExamItems, assertExamComplete, buildDrawerData } from '../../drawer/inject.mjs';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
const FIX = path.join( ROOT, 'tests/fixtures/drawer' );

/** A scratch repo root holding some of a sim's files. */
function scratch( id, have ) {
  const root = mkdtempSync( path.join( os.tmpdir(), 'bsshs-complete-' ) );
  const files = { 'adapter.mjs': 'adapters/fake/adapter.mjs', 'drawer.json': 'adapters/fake/drawer.json', 'cases.json': 'adapters/fake/cases.json' };
  for ( const name of have ) {
    if ( name === 'lessons' ) {
      mkdirSync( path.join( root, 'data/lessons' ), { recursive: true } );
      copyFileSync( path.join( FIX, 'lessons/fake-sim.json' ), path.join( root, 'data/lessons', `${id}.json` ) );
    }
    else {
      mkdirSync( path.join( root, 'adapters', id ), { recursive: true } );
      copyFileSync( path.join( FIX, files[ name ] ), path.join( root, 'adapters', id, name ) );
    }
  }
  return root;
}

test( 'every id of the real data/exam-scope.json is complete', () => {
  const ids = JSON.parse( readFileSync( path.join( ROOT, 'data/exam-scope.json' ), 'utf8' ) ).ids;
  assert.ok( ids.length > 0 );
  assert.doesNotThrow( () => assertExamComplete( ids ) );
} );

test( 'missingExamItems lists all four kinds of file, each on its own', () => {
  const root = scratch( 'fake-sim', [] );
  try {
    const all = missingExamItems( 'fake-sim', { repoRoot: root } );
    assert.equal( all.length, 4 );
    assert.deepEqual( all.map( m => m.split( ' (' )[ 0 ] ), [ 'adapter.mjs', 'drawer.json', 'cases.json', 'lessons file' ] );
    assert.ok( all.some( m => m.includes( path.join( 'data', 'lessons', 'fake-sim.json' ) ) ) );
    for ( const [ present, gone ] of [ [ [ 'adapter.mjs', 'drawer.json', 'lessons' ], 'cases.json' ], [ [ 'adapter.mjs', 'drawer.json', 'cases.json' ], 'lessons file' ],
                                       [ [ 'drawer.json', 'cases.json', 'lessons' ], 'adapter.mjs' ], [ [ 'adapter.mjs', 'cases.json', 'lessons' ], 'drawer.json' ] ] ) {
      const r = scratch( 'fake-sim', present );
      try {
        const m = missingExamItems( 'fake-sim', { repoRoot: r } );
        assert.equal( m.length, 1, `${gone}: ${m}` );
        assert.ok( m[ 0 ].startsWith( gone ), m[ 0 ] );
      }
      finally { rmSync( r, { recursive: true, force: true } ); }
    }
    const full = scratch( 'fake-sim', [ 'adapter.mjs', 'drawer.json', 'cases.json', 'lessons' ] );
    try { assert.deepEqual( missingExamItems( 'fake-sim', { repoRoot: full } ), [] ); }
    finally { rmSync( full, { recursive: true, force: true } ); }
  }
  finally { rmSync( root, { recursive: true, force: true } ); }
} );

test( 'assertExamComplete throws once and names every missing item of every id', () => {
  const root = scratch( 'half-sim', [ 'adapter.mjs', 'lessons' ] );
  try {
    let err;
    try { assertExamComplete( [ 'half-sim', 'ghost-sim' ], { repoRoot: root } ); }
    catch ( e ) { err = e; }
    assert.ok( err, 'must throw' );
    const lines = err.message.split( '\n' ).filter( l => /: missing /.test( l ) );
    assert.equal( lines.length, 2 + 4, err.message ); // half-sim: drawer.json + cases.json; ghost-sim: all four
    assert.match( err.message, /half-sim: missing drawer\.json/ );
    assert.match( err.message, /half-sim: missing cases\.json/ );
    assert.doesNotMatch( err.message, /half-sim: missing (adapter\.mjs|lessons)/ );
    for ( const k of [ 'adapter.mjs', 'drawer.json', 'cases.json', 'lessons file' ] ) { assert.match( err.message, new RegExp( `ghost-sim: missing ${k.replace( '.', '\\.' )}` ) ); }
    assert.match( err.message, /6 missing item/ );
  }
  finally { rmSync( root, { recursive: true, force: true } ); }
} );

test( 'buildDrawerData no longer tolerates a missing lessons file or cases file', () => {
  const root = scratch( 'fake-sim', [ 'adapter.mjs', 'drawer.json' ] );
  try {
    const adapterDir = path.join( root, 'adapters', 'fake-sim' );
    assert.throws( () => buildDrawerData( 'fake-sim', { repoRoot: root, adapterDir, lessonsFile: path.join( root, 'nope.json' ) } ),
      e => /spec 2\.3/.test( e.message ) && /cases\.json/.test( e.message ) && /lessons file/.test( e.message ) );
    writeFileSync( path.join( adapterDir, 'cases.json' ), '[]' );
    assert.throws( () => buildDrawerData( 'fake-sim', { repoRoot: root, adapterDir, lessonsFile: path.join( root, 'nope.json' ) } ),
      e => /lessons file/.test( e.message ) && !/cases\.json/.test( e.message ) );
    // With every file present, the fixture sim builds.
    const ok = buildDrawerData( 'fake-sim', { repoRoot: ROOT, adapterDir: path.join( FIX, 'adapters/fake' ), lessonsFile: path.join( FIX, 'lessons/fake-sim.json' ) } );
    assert.ok( ok.data.lessons && ok.data.lessons.title );
  }
  finally { rmSync( root, { recursive: true, force: true } ); }
} );

test( 'npm run build-site fails fast on an incomplete exam scope, printing every missing item and writing nothing', () => {
  // realpath: build-site only runs main() when argv[1] equals its resolved module path (macOS tmp is a symlink)
  const copy = realpathSync( mkdtempSync( path.join( os.tmpdir(), 'bsshs-sitecopy-' ) ) );
  try {
    for ( const d of [ 'adapters', 'brand', 'data', 'drawer', 'site', 'theme', 'tools' ] ) { cpSync( path.join( ROOT, d ), path.join( copy, d ), { recursive: true } ); }
    copyFileSync( path.join( ROOT, 'package.json' ), path.join( copy, 'package.json' ) );
    const scope = JSON.parse( readFileSync( path.join( copy, 'data/exam-scope.json' ), 'utf8' ) );
    scope.ids.push( 'ghost-sim' );
    writeFileSync( path.join( copy, 'data/exam-scope.json' ), JSON.stringify( scope ) );
    rmSync( path.join( copy, 'adapters/bending-light/cases.json' ) );
    rmSync( path.join( copy, 'data/lessons/faradays-law.json' ) );
    const out = path.join( copy, 'out' );
    const r = spawnSync( process.execPath, [ path.join( copy, 'site/build-site.mjs' ), '--out', out, '--allow-missing' ], { encoding: 'utf8' } );
    assert.equal( r.status, 1, r.stdout );
    for ( const m of [ 'bending-light: missing cases.json', 'faradays-law: missing lessons file', 'ghost-sim: missing adapter.mjs',
                       'ghost-sim: missing drawer.json', 'ghost-sim: missing cases.json', 'ghost-sim: missing lessons file' ] ) {
      assert.ok( r.stderr.includes( m ), `${m} not reported:\n${r.stderr}` );
    }
    assert.match( r.stderr, /6 missing item/ );
    assert.ok( !existsSync( out ), 'nothing is written before the check passes' );
  }
  finally { rmSync( copy, { recursive: true, force: true } ); }
} );
