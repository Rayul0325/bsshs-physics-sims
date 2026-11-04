// drawer/inject.mjs: what goes into a built HTML, validation of the per-sim files, idempotence,
// no outbound URLs, and the lessons `sources` field never leaving the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectDrawer, extractDrawerData, validateDrawerJson, validateCases, validateAdapterSource,
         DRAWER_MARKER_START, DRAWER_MARKER_END } from '../../drawer/inject.mjs';
import { physicsHash } from '../../drawer/hash.mjs';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
const FIX = path.join( ROOT, 'tests/fixtures/drawer' );
const HTML = readFileSync( path.join( FIX, 'fake-sim.html' ), 'utf8' );
const OPTS = { id: 'fake-sim', repoRoot: ROOT, adapterDir: path.join( FIX, 'adapters/fake' ), lessonsFile: path.join( FIX, 'lessons/fake-sim.json' ) };
const FOLDER_RE = /\d{4}-\d{2}-\d{2}_[^\s"'/\\]+?_[0-9a-f]{8}/;

test( 'the drawer block goes right before </body> and is idempotent', () => {
  const out = injectDrawer( HTML, OPTS );
  const i = out.indexOf( DRAWER_MARKER_START );
  assert.ok( i > 0 && out.indexOf( DRAWER_MARKER_END ) > i );
  assert.ok( out.lastIndexOf( '</body>' ) > out.indexOf( DRAWER_MARKER_END ) );
  assert.ok( out.indexOf( '<script>' ) < i, 'after the page scripts' );
  assert.equal( injectDrawer( out, OPTS ), out );
  assert.equal( out.split( DRAWER_MARKER_START ).length, 2 );
} );

test( 'inlines tokens CSS variables, core, runtime, adapter and data; no URL to any origin', () => {
  const out = injectDrawer( HTML, OPTS );
  const block = out.slice( out.indexOf( DRAWER_MARKER_START ), out.indexOf( DRAWER_MARKER_END ) );
  assert.match( block, /--bsshs-color-accent:/ );
  assert.match( block, /BsshsDrawerCore/ );
  assert.match( block, /window\.bsshsDrawer|globalThis\.bsshsDrawer/ );
  assert.match( block, /<script type="module" id="bsshs-drawer-adapter">/ );
  assert.doesNotMatch( block, /\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i );
  assert.doesNotMatch( block, /url\(\s*['"]?(?:https?:)?\/\//i );
  assert.doesNotMatch( block, /\bimport\s*\(/ );
  assert.doesNotMatch( block, /<\/script(?![>])/i, 'no stray </script inside inlined code' );
} );

test( 'embedded data: drawer.json, lessons WITHOUT sources, computed status', () => {
  const data = extractDrawerData( injectDrawer( HTML, OPTS ) );
  assert.equal( data.simId, 'fake-sim' );
  assert.equal( data.drawer.schemaVersion, 2 );
  assert.equal( data.lessons.title, '가짜 광전 효과' );
  assert.ok( !( 'sources' in data.lessons ) );
  const text = JSON.stringify( data );
  assert.doesNotMatch( text, FOLDER_RE );
  assert.ok( !text.includes( 'SECRET-SOURCE-MARKER' ) );
  assert.equal( data.status.state, '확인 중' );
  assert.equal( data.hash, physicsHash( 'fake-sim', { repoRoot: ROOT, adapterDir: OPTS.adapterDir, lessonsFile: OPTS.lessonsFile } ) );
  const whole = injectDrawer( HTML, OPTS );
  assert.ok( !whole.includes( 'SECRET-SOURCE-MARKER' ), 'sources never reach the html' );
} );

test( 'status: approved matching hash renders 확인 완료; a stale hash renders 확인 중', () => {
  const hash = physicsHash( 'fake-sim', { repoRoot: ROOT, adapterDir: OPTS.adapterDir, lessonsFile: OPTS.lessonsFile } );
  const ok = extractDrawerData( injectDrawer( HTML, { ...OPTS, status: { 'fake-sim': { status: '확인 완료', date: '2026-11-04', memo: 'm', approvedHash: hash } } } ) );
  assert.equal( ok.status.label, '선생님 확인 완료' );
  const stale = extractDrawerData( injectDrawer( HTML, { ...OPTS, status: { 'fake-sim': { status: '확인 완료', date: '2026-11-04', memo: 'm', approvedHash: '0'.repeat( 64 ) } } } ) );
  assert.equal( stale.status.label, '선생님 확인 중' );
  assert.ok( !JSON.stringify( ok ).includes( '"memo"' ) );
} );

test( 'validateDrawerJson enforces the pinned shape', () => {
  const good = JSON.parse( readFileSync( path.join( FIX, 'adapters/fake/drawer.json' ), 'utf8' ) );
  assert.deepEqual( validateDrawerJson( good, 'fake-sim' ), [] );
  const bad = structuredClone( good );
  bad.graphs = [ bad.graphs[ 0 ] ];
  assert.match( validateDrawerJson( bad, 'fake-sim' ).join( '\n' ), /two or more graphs/ );
  const bad2 = structuredClone( good );
  bad2.graphs[ 0 ].y = 'nope';
  assert.match( validateDrawerJson( bad2, 'fake-sim' ).join( '\n' ), /nope/ );
  const bad3 = structuredClone( good );
  bad3.measurements.push( { key: 'wavelength', name: '중복', unit: '' } );
  assert.match( validateDrawerJson( bad3, 'fake-sim' ).join( '\n' ), /duplicate/ );
  assert.match( validateDrawerJson( good, 'other' ).join( '\n' ), /simId/ );
  const bad4 = structuredClone( good );
  bad4.measurements[ 0 ].classUnit = { unit: 'm' };
  assert.match( validateDrawerJson( bad4, 'fake-sim' ).join( '\n' ), /factor/ );
} );

test( 'validateCases and validateAdapterSource', () => {
  const dj = JSON.parse( readFileSync( path.join( FIX, 'adapters/fake/drawer.json' ), 'utf8' ) );
  assert.deepEqual( validateCases( JSON.parse( readFileSync( path.join( FIX, 'adapters/fake/cases.json' ), 'utf8' ) ), dj ), [] );
  assert.match( validateCases( [ { name: 'x', params: {}, expect: { bogus: { value: 1 } } } ], dj ).join( '\n' ), /bogus/ );
  assert.deepEqual( validateAdapterSource( readFileSync( path.join( FIX, 'adapters/fake/adapter.mjs' ), 'utf8' ) ), [] );
  assert.match( validateAdapterSource( "import x from './y.mjs';\nbsshsDrawer.register({})" ).join( '\n' ), /import/ );
  assert.match( validateAdapterSource( 'const a = 1;' ).join( '\n' ), /register/ );
} );

test( 'the example adapter files are valid against the generator lessons', () => {
  const dir = path.join( ROOT, 'adapters/_example' );
  const dj = JSON.parse( readFileSync( path.join( dir, 'drawer.json' ), 'utf8' ) );
  assert.deepEqual( validateDrawerJson( dj, 'generator' ), [] );
  assert.deepEqual( validateCases( JSON.parse( readFileSync( path.join( dir, 'cases.json' ), 'utf8' ) ), dj ), [] );
  assert.deepEqual( validateAdapterSource( readFileSync( path.join( dir, 'adapter.mjs' ), 'utf8' ) ), [] );
  // Keys reuse the lessons variable keys where the quantity matches.
  const lessons = JSON.parse( readFileSync( path.join( ROOT, 'data/lessons/generator.json' ), 'utf8' ) );
  const lessonKeys = new Set( lessons.formulas.flatMap( f => f.variables.map( v => v.key ) ) );
  assert.ok( dj.measurements.filter( m => lessonKeys.has( m.key ) ).length >= 3 );
} );

test( 'refuses html without </body>', () => {
  assert.throws( () => injectDrawer( '<html><body>', OPTS ), /<\/body>/ );
} );
