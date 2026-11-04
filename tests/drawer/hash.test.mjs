// V5 hash scope: drawer/hash.mjs physicsHash(id, { repoRoot }).
// Included: data/lessons/<id>.json, adapters/<id>/drawer.json, adapters/<id>/cases.json, adapters/<id>/adapter.mjs,
// sims/<id>/js/model/**. Excluded: tokens, theme, brand, term fixes, drawer runtime/layout code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { physicsHash, physicsHashInputs } from '../../drawer/hash.mjs';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
const ID = 'fake-sim';

/** Builds a throwaway repo with every file the scope talks about. @returns {string} */
function fixtureRepo() {
  const dir = mkdtempSync( path.join( tmpdir(), 'bsshs-hash-' ) );
  const w = ( rel, text ) => { mkdirSync( path.dirname( path.join( dir, rel ) ), { recursive: true } ); writeFileSync( path.join( dir, rel ), text ); };
  w( `data/lessons/${ID}.json`, JSON.stringify( { id: ID, title: '가짜', formulas: [], terms: [], classUnits: [], sources: [] }, null, 2 ) );
  cpSync( path.join( ROOT, 'tests/fixtures/drawer/adapters/fake' ), path.join( dir, `adapters/${ID}` ), { recursive: true } );
  w( 'theme/tokens.json', readFileSync( path.join( ROOT, 'theme/tokens.json' ), 'utf8' ) );
  w( 'data/term-fixes.json', '{}' );
  w( `sims/${ID}/js/model/FakeModel.js`, 'export const g = 9.8;\n' );
  w( `sims/${ID}/js/view/FakeView.js`, 'export const w = 10;\n' );
  return dir;
}

/** @param {string} dir @param {string} rel @param {(s: string) => string} f */
const edit = ( dir, rel, f ) => {
  const p = path.join( dir, rel );
  writeFileSync( p, f( existsSync( p ) ? readFileSync( p, 'utf8' ) : '' ) );
};

test( 'physicsHash is a sha256 hex and stable', () => {
  const dir = fixtureRepo();
  try {
    const h = physicsHash( ID, { repoRoot: dir } );
    assert.match( h, /^[0-9a-f]{64}$/ );
    assert.equal( physicsHash( ID, { repoRoot: dir } ), h );
  }
  finally { rmSync( dir, { recursive: true, force: true } ); }
} );

test( 'the hash changes when lessons, drawer.json, cases.json or model code change', () => {
  const dir = fixtureRepo();
  try {
    const seen = new Set( [ physicsHash( ID, { repoRoot: dir } ) ] );
    const step = ( what, rel, f ) => {
      edit( dir, rel, f );
      const h = physicsHash( ID, { repoRoot: dir } );
      assert.ok( !seen.has( h ), `${what} must change the hash` );
      seen.add( h );
    };
    step( 'lessons', `data/lessons/${ID}.json`, s => s.replace( '가짜', '진짜' ) );
    step( 'drawer.json measurement unit', `adapters/${ID}/drawer.json`, s => s.replace( '"unit": "nm"', '"unit": "μm"' ) );
    step( 'drawer.json graph', `adapters/${ID}/drawer.json`, s => s.replace( '"fit": "linear"', '"fit": null' ) );
    step( 'adapter.mjs', `adapters/${ID}/adapter.mjs`, s => `${s}\n// derived value changed\n` );
    step( 'cases.json', `adapters/${ID}/cases.json`, s => s.replace( /"value": ([\d.]+)/, ( m, v ) => `"value": ${Number( v ) + 1}` ) );
    step( 'model code', `sims/${ID}/js/model/FakeModel.js`, s => s.replace( '9.8', '9.81' ) );
    step( 'new model file', `sims/${ID}/js/model/More.js`, () => 'x' );
  }
  finally { rmSync( dir, { recursive: true, force: true } ); }
} );

test( 'the hash does NOT change for tokens, term fixes, drawer runtime/layout code, view code or JSON formatting', () => {
  const dir = fixtureRepo();
  try {
    const h0 = physicsHash( ID, { repoRoot: dir } );
    edit( dir, 'theme/tokens.json', s => s.replace( /"accent": "[^"]+"/, '"accent": "#000000"' ) );
    edit( dir, 'data/term-fixes.json', () => '{ "a": "b" }' );
    edit( dir, `sims/${ID}/js/view/FakeView.js`, s => s.replace( '10', '12' ) );
    edit( dir, `adapters/${ID}/drawer.json`, s => JSON.stringify( JSON.parse( s ) ) ); // whitespace only
    assert.equal( physicsHash( ID, { repoRoot: dir } ), h0 );
  }
  finally { rmSync( dir, { recursive: true, force: true } ); }
} );

test( 'physicsHashInputs names exactly the scope files; an adapterDir override is location-independent', () => {
  const dir = fixtureRepo();
  try {
    const labels = physicsHashInputs( ID, { repoRoot: dir } ).map( i => i.label );
    assert.deepEqual( labels, [ 'lessons', 'drawer.json', 'cases.json', 'adapter.mjs', 'model/FakeModel.js' ] );
    const moved = path.join( dir, 'elsewhere' );
    cpSync( path.join( dir, `adapters/${ID}` ), moved, { recursive: true } );
    assert.equal( physicsHash( ID, { repoRoot: dir, adapterDir: moved } ), physicsHash( ID, { repoRoot: dir } ) );
  }
  finally { rmSync( dir, { recursive: true, force: true } ); }
} );

test( 'missing scope files are part of the hash (adding one changes it)', () => {
  const dir = fixtureRepo();
  try {
    rmSync( path.join( dir, `adapters/${ID}/cases.json` ) );
    const h = physicsHash( ID, { repoRoot: dir } );
    assert.match( h, /^[0-9a-f]{64}$/ );
    writeFileSync( path.join( dir, `adapters/${ID}/cases.json` ), '[]' );
    assert.notEqual( physicsHash( ID, { repoRoot: dir } ), h );
  }
  finally { rmSync( dir, { recursive: true, force: true } ); }
} );

test( 'the real repo hashes the example adapter against the generator lessons', () => {
  const h = physicsHash( 'generator', { repoRoot: ROOT, adapterDir: path.join( ROOT, 'adapters/_example' ) } );
  assert.match( h, /^[0-9a-f]{64}$/ );
} );
