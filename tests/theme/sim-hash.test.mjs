// The resume hash is per sim: editing one sim's style (or the art it maps to) changes that sim's hash and no other;
// a global change (tokens outside the sim group, rule text) changes all of them; resume then re-builds exactly the
// sims whose hash changed (shouldSkip). Guard pinned here: "per-sim hash change reruns only that sim".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadTokens } from '../../theme/index.mjs';
import { simVariantHash, variantHash, rulesFor, simRulesFor } from '../../theme/patches/index.mjs';
import { shouldSkip } from '../../tools/lib/matrix.mjs';
import { readManifest } from '../../tools/lib/manifest.mjs';
import { readBlob } from '../../tools/lib/pinned.mjs';
import { pngSize } from '../../theme/patches/art.mjs';

const tokens = loadTokens();
const OPTS = { brand: 'bsshs', theme: true };
const clone = o => JSON.parse( JSON.stringify( o ) );

async function stylesDir( styles ) {
  const dir = await mkdtemp( path.join( tmpdir(), 'sim-styles-' ) );
  for ( const [ id, style ] of Object.entries( styles ) ) { await writeFile( path.join( dir, `${id}.json` ), JSON.stringify( style ) ); }
  return dir;
}
const style = ( to, occurrence = 1 ) => ( { colors: [ { repo: 'sim-a', file: 'js/view/A.js', find: "fill: ('white')", occurrence, to } ] } );

test( 'editing one sim\'s style changes that sim\'s hash only; the others keep theirs', async () => {
  const dir1 = await stylesDir( { 'sim-a': style( 'sim.surface' ), 'sim-b': style( 'sim.line' ) } );
  const dir2 = await stylesDir( { 'sim-a': style( 'sim.physics.copper' ), 'sim-b': style( 'sim.line' ) } );
  try {
    const h = async ( id, dir ) => simVariantHash( tokens, OPTS, id, {}, { stylesDir: dir } );
    const [ a1, b1, a2, b2 ] = [ await h( 'sim-a', dir1 ), await h( 'sim-b', dir1 ), await h( 'sim-a', dir2 ), await h( 'sim-b', dir2 ) ];
    assert.notEqual( a1, a2, 'the edited sim has a new hash' );
    assert.equal( b1, b2, 'the other sim keeps its hash' );
    assert.notEqual( a1, b1, 'two sims never share a hash' );
    // resume: only the sim whose hash changed is rebuilt
    const records = { 'sim-a': { success: true, depsHash: 'd', themeHash: a1 }, 'sim-b': { success: true, depsHash: 'd', themeHash: b1 } };
    const todo = [ [ 'sim-a', a2 ], [ 'sim-b', b2 ] ].filter( ( [ id, expected ] ) => !shouldSkip( records[ id ], { expectedDepsHash: 'd', outputExists: true, expectedThemeHash: expected } ) ).map( x => x[ 0 ] );
    assert.deepEqual( todo, [ 'sim-a' ] );
  }
  finally { await rm( dir1, { recursive: true, force: true } ); await rm( dir2, { recursive: true, force: true } ); }
} );

test( 'a token changes only the sims whose style resolves to it; exceptions and notes never re-build anything', async () => {
  const dir = await stylesDir( { 'sim-a': style( 'sim.physics.copper' ), 'sim-b': style( 'sim.line' ), 'sim-c': { exceptions: [] } } );
  const dirEx = await stylesDir( { 'sim-a': { ...style( 'sim.physics.copper' ), exceptions: [ { kind: 'fill', reason: 'x', approvedBy: 'y' } ], canvasNodes: [ 'Foo' ] }, 'sim-b': style( 'sim.line' ), 'sim-c': { exceptions: [] } } );
  try {
    const t2 = clone( tokens );
    t2.sim.physics.copper = '#010203';
    const h = ( t, id, d = dir ) => simVariantHash( t, OPTS, id, {}, { stylesDir: d } );
    assert.notEqual( await h( tokens, 'sim-a' ), await h( t2, 'sim-a' ) );
    assert.equal( await h( tokens, 'sim-b' ), await h( t2, 'sim-b' ) );
    assert.equal( await h( tokens, 'sim-c' ), await h( t2, 'sim-c' ), 'a sim without color entries does not depend on sim colors' );
    assert.equal( await h( tokens, 'sim-a' ), await h( tokens, 'sim-a', dirEx ), 'exceptions and canvasNodes are for V11 only' );
    // new sims import a generated token module made from the whole sim group, so they do depend on it
    const hn = ( t, id ) => simVariantHash( t, { ...OPTS, newSim: true }, id, {}, { stylesDir: dir } );
    assert.notEqual( await hn( tokens, 'sim-c' ), await hn( t2, 'sim-c' ) );
  }
  finally { await rm( dir, { recursive: true, force: true } ); await rm( dirEx, { recursive: true, force: true } ); }
} );

test( 'a global change (a token outside the sim group, or the variant) changes every sim\'s hash', async () => {
  const t2 = clone( tokens );
  t2.color.accent = '#010203';
  for ( const id of [ 'sim-a', 'sim-z' ] ) {
    assert.notEqual( await simVariantHash( tokens, OPTS, id, {} ), await simVariantHash( t2, OPTS, id, {} ) );
  }
  assert.notEqual( await simVariantHash( tokens, OPTS, 'sim-a', {} ), await simVariantHash( tokens, { brand: 'bsshs', theme: false }, 'sim-a', {} ) );
  assert.equal( await simVariantHash( tokens, OPTS, 'sim-a', {} ), await simVariantHash( clone( tokens ), OPTS, 'sim-a', {} ), 'deterministic' );
  assert.notEqual( variantHash( tokens, OPTS ), variantHash( tokens, OPTS, 'sim-a', { colors: null, art: [] } ), 'with and without a sim id differ' );
} );

test( 'the global part hashes the replacement code of every rule, not just its find patterns', () => {
  const rules = rulesFor( OPTS );
  assert.ok( rules.some( r => r.edits && r.edits.some( e => typeof e.replace === 'function' ) ) );
  // changing the replacement of one rule changes the hash: simulate by hashing a patched copy of the rule list
  const real = variantHash( tokens, OPTS );
  const edit = rules.find( r => r.edits && r.edits.some( e => typeof e.replace === 'function' ) ).edits.find( e => typeof e.replace === 'function' );
  const original = edit.replace;
  try {
    edit.replace = ( env, ...m ) => `${original( env, ...m )} `;
    assert.notEqual( variantHash( tokens, OPTS ), real );
  }
  finally { edit.replace = original; }
  assert.equal( variantHash( tokens, OPTS ), real );
} );

test( 'the art a sim maps to is in its hash: new svg text changes the sim that has the file, not a sim that has not', async t => {
  const m = await readManifest( 'faradays-law' );
  const other = await readManifest( 'wave-on-a-string' );
  if ( !m || !other ) { t.skip( 'source cache absent' ); return; }
  const { w, h } = pngSize( await readBlob( 'faradays-law', m.deps[ 'faradays-law' ], 'mipmaps/two-loop-back.png' ) );
  const dir = await mkdtemp( path.join( tmpdir(), 'art-hash-' ) );
  try {
    await mkdir( path.join( dir, 'f' ), { recursive: true } );
    const svg = c => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`;
    const map = { entries: [ { repo: 'faradays-law', files: [ 'mipmaps/two-loop-back.png' ], svg: 'f/a.svg' } ] };
    const hashOf = async ( id, deps ) => simVariantHash( tokens, OPTS, id, deps, { art: { map, artDir: dir } } );
    await writeFile( path.join( dir, 'f', 'a.svg' ), svg( '{{sim.physics.copper}}' ) );
    const [ f1, o1 ] = [ await hashOf( 'faradays-law', m.deps ), await hashOf( 'wave-on-a-string', other.deps ) ];
    await writeFile( path.join( dir, 'f', 'a.svg' ), svg( '{{sim.physics.water}}' ) );
    const [ f2, o2 ] = [ await hashOf( 'faradays-law', m.deps ), await hashOf( 'wave-on-a-string', other.deps ) ];
    assert.notEqual( f1, f2, 'the sim with the picture re-builds' );
    assert.equal( o1, o2, 'the sim without it does not' );
    const none = await simVariantHash( tokens, OPTS, 'faradays-law', m.deps, { art: { map: { entries: [] }, artDir: dir } } );
    assert.notEqual( none, f1, 'having art at all changes the hash' );
    // stylesDir: an empty directory, so the real theme/sim-styles/faradays-law.json (31 color edits) does not count here
    const withRules = await simRulesFor( 'faradays-law', m.deps, tokens, { art: { map, artDir: dir }, hashOnly: true, stylesDir: dir } );
    assert.equal( withRules.rules.length, 3 );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

test( 'an invalid style file stops the build with the problem named', async () => {
  const dir = await stylesDir( { 'sim-a': { colors: [ { repo: 'r', file: 'js/model/A.js', find: 'x', occurrence: 0, to: 'sim.nope' } ], bogus: 1 } } );
  try {
    await assert.rejects( () => simRulesFor( 'sim-a', {}, tokens, { stylesDir: dir, hashOnly: true } ), /model path[^]*occurrence[^]*unknown color token|invalid sim style/ );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );
