// Art layer (theme/patches/art.mjs): image helpers, the generated-module rewrite for every module shape, the
// license record and prepareArt. Guards pinned by their own tests: (1) a picture of another size is refused when the
// art is prepared, (2) ... and again when the rule meets the real file, (3) a module whose level 0 has another size
// is refused, (4) a module of an unknown shape is refused, (5) art without a license.json beside it is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadTokens } from '../../theme/index.mjs';
import { annotateLicenseEntry,
  pngSize, svgSize, assertSameSize, encodePng, mipmapDownscale, mipmapLevels, regenerateModule, replaceLicenseEntry, prepareArt, validateArtMap
} from '../../theme/patches/art.mjs';
import { readManifest } from '../../tools/lib/manifest.mjs';
import { readBlob, listTree } from '../../tools/lib/pinned.mjs';
import { REPO_URL } from '../../brand/bsshs/attribution.mjs';

const tokens = loadTokens();
const solid = ( w, h, rgba ) => Buffer.from( Array.from( { length: w * h }, () => rgba ).flat() );

/** Reads the pixels back out of a PNG made by encodePng (filter 0, RGBA 8 bit). */
function decodePng( buf ) {
  const { w, h } = pngSize( buf );
  const chunks = [];
  for ( let p = 8; p < buf.length; ) { const len = buf.readUInt32BE( p ); chunks.push( [ buf.toString( 'latin1', p + 4, p + 8 ), buf.subarray( p + 8, p + 8 + len ) ] ); p += 12 + len; }
  const raw = zlib.inflateSync( Buffer.concat( chunks.filter( c => c[ 0 ] === 'IDAT' ).map( c => c[ 1 ] ) ) );
  const out = Buffer.alloc( w * h * 4 );
  for ( let y = 0; y < h; y++ ) { raw.copy( out, y * w * 4, y * ( w * 4 + 1 ) + 1, ( y + 1 ) * ( w * 4 + 1 ) ); }
  return { w, h, data: out, crcOk: chunks.every( ( c, i ) => i >= 0 ) };
}

test( 'encodePng writes a PNG that reads back to the same pixels; sizes come from the headers', () => {
  const rgba = Buffer.from( [ 10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ] );
  const png = encodePng( rgba, 3, 2 );
  assert.deepEqual( pngSize( png ), { w: 3, h: 2 } );
  const back = decodePng( png );
  assert.deepEqual( [ ...back.data ], [ ...rgba ] );
  assert.throws( () => pngSize( Buffer.from( 'not a png at all, really not a png' ) ), /not a PNG/ );
  assert.deepEqual( svgSize( '<svg xmlns="x" width="70" height="57.5px" viewBox="0 0 70 57.5"><rect/></svg>' ), { w: 70, h: 57.5 } );
  assert.throws( () => svgSize( '<svg viewBox="0 0 1 1"></svg>' ), /width and height/ );
} );

test( 'mipmapDownscale follows chipper: sizes round up, alpha weighs the blend, gamma 2.2', () => {
  const half = mipmapDownscale( { data: solid( 3, 3, [ 200, 100, 50, 255 ] ), width: 3, height: 3 } );
  assert.deepEqual( [ half.width, half.height ], [ 2, 2 ] );
  // chipper floors after the gamma round trip, so 100 comes back as 99 (the same bytes chipper's mipmapDownscale gives)
  assert.deepEqual( [ ...half.data.subarray( 0, 4 ) ], [ 200, 99, 49, 255 ], 'a solid color stays itself, up to chipper\'s flooring' );
  assert.deepEqual( [ ...half.data.subarray( 12, 16 ) ], [ 200, 99, 49, 135 ], 'a corner pixel covered by one of four source pixels keeps the color, a quarter of the alpha (gamma 2.2)' );
  const mixed = mipmapDownscale( { data: Buffer.from( [ 255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0 ] ), width: 2, height: 2 } );
  assert.deepEqual( [ ...mixed.data ], [ 255, 0, 0, 135 ], 'transparent pixels do not tint the result' );
  const levels = mipmapLevels( solid( 89, 71, [ 1, 2, 3, 255 ] ), 89, 71, 5 );
  assert.deepEqual( levels.map( l => `${l.width}x${l.height}` ), [ '89x71', '45x36', '23x18', '12x9', '6x5' ], 'the level sizes chipper wrote for lightBulbBase' );
  assert.ok( levels.every( l => l.url.startsWith( 'data:image/png;base64,' ) ) );
} );

/** Real module texts from the pinned mirrors: [ repo, sim id, file ]. */
const MODULES = [
  [ 'a JS image module', 'faradays-law', 'scenery-phet', 'images/eraser_png.js' ],
  [ 'a JS mipmap module', 'faradays-law', 'faradays-law', 'mipmaps/two-loop-back_png.js' ],
  [ 'a TS image module', 'circuit-construction-kit-dc', 'scenery-phet', 'images/batteryDCell_png.ts' ],
  [ 'a TS mipmap module', 'circuit-construction-kit-dc', 'scenery-phet', 'mipmaps/lightBulbBase_png.ts' ]
];

for ( const [ label, simId, repo, file ] of MODULES ) {
  test( `regenerateModule rewrites ${label} (${repo}/${file}): wrapper kept, picture and levels replaced`, async t => {
    const m = await readManifest( simId );
    if ( !m ) { t.skip( 'source cache absent' ); return; }
    const old = ( await readBlob( repo, m.deps[ repo ], file ) ).toString( 'utf8' );
    const png = await readBlob( repo, m.deps[ repo ], file.replace( /_png\.(js|ts)$/, '.png' ) );
    const { w, h } = pngSize( png );
    const rgba = solid( w, h, [ 9, 8, 7, 255 ] );
    const out = regenerateModule( old, rgba, w, h, file );
    const strip = s => s.replace( /data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+/g, 'DATA' ).replace( /\n\s*"(width|height)": \d+,?/g, '' ).replace( /new MipmapElement\( \d+, \d+,/g, 'new MipmapElement(' );
    const urls = s => [ ...s.matchAll( /data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)/g ) ].map( x => x[ 1 ] );
    assert.equal( urls( out ).length, urls( old ).length, 'same number of pictures/levels' );
    assert.equal( strip( out ).replace( /\s+/g, ' ' ), strip( old ).replace( /\s+/g, ' ' ), 'everything but the data is unchanged' );
    const first = decodePng( Buffer.from( urls( out )[ 0 ], 'base64' ) );
    assert.deepEqual( [ first.w, first.h ], [ w, h ], 'level 0 has the original pixel size' );
    assert.deepEqual( [ ...first.data.subarray( 0, 4 ) ], [ 9, 8, 7, 255 ] );
  } );
}

test( 'guard (3): a module whose level 0 has another size than the new picture is refused', async t => {
  const m = await readManifest( 'faradays-law' );
  if ( !m ) { t.skip( 'source cache absent' ); return; }
  const old = ( await readBlob( 'faradays-law', m.deps[ 'faradays-law' ], 'mipmaps/two-loop-back_png.js' ) ).toString( 'utf8' );
  assert.throws( () => regenerateModule( old, solid( 10, 10, [ 0, 0, 0, 255 ] ), 10, 10, 'x' ), /art dimension mismatch/ );
} );

test( 'guard (4): a module of an unknown shape is refused, not guessed', () => {
  assert.throws( () => regenerateModule( 'export default 42;', solid( 1, 1, [ 0, 0, 0, 255 ] ), 1, 1, 'odd_png.js' ), /format not recognised/ );
} );

test( 'replaceLicenseEntry records the picture as this project\'s own GPL-3.0 work and leaves the other entries alone', () => {
  const old = JSON.stringify( { 'a.png': { text: [ 'Copyright 2002-2015 University of Colorado Boulder' ], projectURL: 'http://phet.colorado.edu', license: 'contact phethelp@colorado.edu', notes: '' }, 'b.png': { license: 'Public Domain' } }, null, 2 );
  const out = JSON.parse( replaceLicenseEntry( old, 'a.png' ) );
  assert.equal( out[ 'a.png' ].license, 'GPL-3.0' );
  assert.equal( out[ 'a.png' ].projectURL, REPO_URL );
  assert.ok( out[ 'a.png' ].text[ 0 ].includes( 'bsshs-physics-sims contributors' ) );
  assert.ok( !JSON.stringify( out[ 'a.png' ] ).includes( 'Colorado' ), 'no claim of the original owner remains on the new picture' );
  assert.deepEqual( out[ 'b.png' ], { license: 'Public Domain' } );
  assert.ok( replaceLicenseEntry( '{}', 'new.png' ).includes( '"new.png"' ), 'an entry missing from the file is added' );
} );

test( 'validateArtMap: png only, svg must exist, size shaped like 70x57', async () => {
  const dir = await mkdtemp( path.join( tmpdir(), 'art-map-' ) );
  try {
    await mkdir( path.join( dir, 'r' ), { recursive: true } );
    await writeFile( path.join( dir, 'r', 'a.svg' ), '<svg/>' );
    assert.deepEqual( validateArtMap( { entries: [ { repo: 'r', files: [ 'images/a.png' ], svg: 'r/a.svg', size: '3x4' } ] }, dir ), [] );
    const bad = validateArtMap( { entries: [ { repo: 'r', files: [ 'images/a.jpg' ], svg: 'r/missing.svg', size: 'big' } ] }, dir );
    assert.equal( bad.length, 3 );
    assert.ok( bad.some( p => /only PNG/.test( p ) ) && bad.some( p => /does not exist/.test( p ) ) && bad.some( p => /size/.test( p ) ) );
    assert.ok( validateArtMap( {}, dir ).length );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

/** A tiny art folder with one entry for faradays-law's two-loop-back picture, at the width/height given. */
async function artFixture( w, h ) {
  const dir = await mkdtemp( path.join( tmpdir(), 'art-fixture-' ) );
  await mkdir( path.join( dir, 'faradays-law' ), { recursive: true } );
  await writeFile( path.join( dir, 'faradays-law', 'two-loop-back.svg' ), `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="{{sim.physics.copper}}"/></svg>` );
  return { dir, map: { entries: [ { repo: 'faradays-law', files: [ 'mipmaps/two-loop-back.png' ], svg: 'faradays-law/two-loop-back.svg' } ] } };
}
const fakeRender = async jobs => jobs.map( j => solid( j.w, j.h, [ 1, 2, 3, 255 ] ) );

test( 'prepareArt: builds picture, module and license rules for the files a sim really has; placeholders become token colors', async t => {
  const m = await readManifest( 'faradays-law' );
  if ( !m ) { t.skip( 'source cache absent' ); return; }
  const orig = pngSize( await readBlob( 'faradays-law', m.deps[ 'faradays-law' ], 'mipmaps/two-loop-back.png' ) );
  const { dir, map } = await artFixture( orig.w, orig.h );
  try {
    const seen = [];
    const { rules, hashInput } = await prepareArt( m.deps, tokens, { map, artDir: dir, render: async jobs => { seen.push( ...jobs ); return fakeRender( jobs ); } } );
    assert.deepEqual( rules.map( r => r.kind ), [ 'art', 'art', 'art' ] );
    assert.deepEqual( rules.map( r => r.files[ 0 ] ), [ 'mipmaps/two-loop-back.png', 'mipmaps/two-loop-back_png.js', 'mipmaps/license.json' ] );
    assert.ok( rules.every( r => /^[a-z0-9-]+$/.test( r.id ) && r.required ) );
    assert.ok( seen[ 0 ].svg.includes( tokens.sim.physics.copper ) && !seen[ 0 ].svg.includes( '{{' ), 'the renderer sees token colors, not placeholders' );
    assert.equal( hashInput.length, 1 );
    assert.deepEqual( await prepareArt( { 'scenery-phet': m.deps[ 'scenery-phet' ] }, tokens, { map, artDir: dir, render: fakeRender } ), { rules: [], hashInput: [] }, 'a sim without that file gets no rules' );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

test( 'guard (1): art whose size differs from the original PNG fails the build when it is prepared', async t => {
  const m = await readManifest( 'faradays-law' );
  if ( !m ) { t.skip( 'source cache absent' ); return; }
  const orig = pngSize( await readBlob( 'faradays-law', m.deps[ 'faradays-law' ], 'mipmaps/two-loop-back.png' ) );
  const { dir, map } = await artFixture( orig.w + 1, orig.h );
  try {
    await assert.rejects( () => prepareArt( m.deps, tokens, { map, artDir: dir, render: fakeRender } ), /art dimension mismatch for faradays-law\/mipmaps\/two-loop-back\.png/ );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

test( 'guard (2): the picture rule refuses a file of another size when it meets it', async t => {
  const m = await readManifest( 'faradays-law' );
  if ( !m ) { t.skip( 'source cache absent' ); return; }
  const orig = await readBlob( 'faradays-law', m.deps[ 'faradays-law' ], 'mipmaps/two-loop-back.png' );
  const { w, h } = pngSize( orig );
  const { dir, map } = await artFixture( w, h );
  try {
    const { rules } = await prepareArt( m.deps, tokens, { map, artDir: dir, render: fakeRender } );
    const out = rules[ 0 ].content( {}, orig );
    assert.deepEqual( pngSize( out ), { w, h } );
    assert.throws( () => rules[ 0 ].content( {}, encodePng( solid( w + 2, h, [ 0, 0, 0, 255 ] ), w + 2, h ) ), /art dimension mismatch/ );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

test( 'an entry for a file that exists only at other sizes fails loudly instead of being skipped', async t => {
  const m = await readManifest( 'faradays-law' );
  if ( !m ) { t.skip( 'source cache absent' ); return; }
  const { dir, map } = await artFixture( 5, 5 );
  map.entries[ 0 ].size = '1x1';
  try {
    await assert.rejects( () => prepareArt( m.deps, tokens, { map, artDir: dir, render: fakeRender } ), /no art entry for faradays-law\/mipmaps\/two-loop-back\.png at \d+x\d+/ );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

test( 'RequireJS-style family (no committed modules): only the PNG and the license record are replaced', async t => {
  const m = await readManifest( 'charges-and-fields' );
  if ( !m ) { t.skip( 'source cache absent' ); return; }
  assert.equal( m.chipperVersion, '0.0.0' );
  const tree = await listTree( 'charges-and-fields', m.deps[ 'charges-and-fields' ] );
  const png = tree.find( f => /^images\/.+\.png$/.test( f ) );
  const size = pngSize( await readBlob( 'charges-and-fields', m.deps[ 'charges-and-fields' ], png ) );
  assert.ok( !tree.includes( png.replace( /\.png$/, '_png.js' ) ), 'this family keeps no module beside the picture' );
  const { dir } = await artFixture( size.w, size.h );
  try {
    const map = { entries: [ { repo: 'charges-and-fields', files: [ png ], svg: 'faradays-law/two-loop-back.svg' } ] };
    const { rules } = await prepareArt( m.deps, tokens, { map, artDir: dir, render: fakeRender } );
    assert.deepEqual( rules.map( r => r.files[ 0 ] ), [ png, `${path.posix.dirname( png )}/license.json` ] );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

test( 'guard (5): art without a license.json beside it is refused', async t => {
  const m = await readManifest( 'faradays-law' );
  if ( !m ) { t.skip( 'source cache absent' ); return; }
  // faradays-law keeps its pictures in mipmaps/ WITH a license.json; the guard is exercised on a picture whose folder has none.
  const tree = await listTree( 'sherpa', m.deps.sherpa );
  const png = tree.find( f => f.endsWith( '.png' ) && !tree.includes( `${path.posix.dirname( f )}/license.json` ) );
  if ( !png ) { t.skip( 'no license-less png in sherpa at this pin' ); return; }
  const size = pngSize( await readBlob( 'sherpa', m.deps.sherpa, png ) );
  const { dir } = await artFixture( size.w, size.h );
  try {
    const map = { entries: [ { repo: 'sherpa', files: [ png ], svg: 'faradays-law/two-loop-back.svg' } ] };
    await assert.rejects( () => prepareArt( m.deps, tokens, { map, artDir: dir, render: fakeRender } ), /no .*license\.json beside the picture/ );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

test( 'mipmapDownscale gives the same bytes as chipper\'s own mipmapDownscale (read from a cache slot when one has it)', async t => {
  const { existsSync } = await import( 'node:fs' );
  const { pathToFileURL } = await import( 'node:url' );
  const { slotsDir } = await import( '../../tools/lib/paths.mjs' );
  const file = [ 0, 1, 2, 3 ].map( n => path.join( slotsDir(), `slot-${n}`, 'chipper', 'js', 'common', 'mipmapDownscale.ts' ) ).find( existsSync );
  if ( !file ) { t.skip( 'no chipper checkout in the slots' ); return; }
  const chipper = ( await import( pathToFileURL( file ).href ) ).default;
  let seed = 12345;
  const rnd = () => ( seed = ( seed * 1103515245 + 12345 ) & 0x7fffffff ) / 0x7fffffff;
  for ( const [ w, h ] of [ [ 89, 71 ], [ 23, 18 ], [ 7, 5 ], [ 1, 1 ], [ 2, 3 ] ] ) {
    const data = Buffer.alloc( w * h * 4 );
    for ( let i = 0; i < data.length; i++ ) { data[ i ] = Math.floor( rnd() * 256 ); }
    for ( let i = 3; i < data.length; i += 8 ) { data[ i ] = 0; }
    const a = mipmapDownscale( { data, width: w, height: h } );
    const b = chipper( { data, width: w, height: h }, ( ww, hh ) => Buffer.alloc( 4 * ww * hh ) );
    assert.deepEqual( [ a.width, a.height ], [ b.width, b.height ], `${w}x${h}` );
    assert.ok( a.data.equals( b.data ), `${w}x${h} bytes` );
  }
} );

test( 'a retouched original needs a note, keeps its license record and must not change size', async () => {
  const dir = await mkdtemp( path.join( tmpdir(), 'art-retouch-' ) );
  try {
    const png = encodePng( Buffer.alloc( 4 * 4 * 4, 200 ), 4, 4 );
    await writeFile( path.join( dir, 'a.png' ), png );
    assert.deepEqual( validateArtMap( { entries: [ { repo: 'r', files: [ 'images/a.png' ], png: 'a.png', note: 'removed a label' } ] }, dir ), [] );
    assert.ok( validateArtMap( { entries: [ { repo: 'r', files: [ 'images/a.png' ], png: 'a.png' } ] }, dir ).some( m => /note/.test( m ) ), 'note is required' );
    assert.ok( validateArtMap( { entries: [ { repo: 'r', files: [ 'images/a.png' ], png: 'a.png', svg: 'b.svg', note: 'x' } ] }, dir ).some( m => /exactly one/.test( m ) ), 'one source only' );
    const after = JSON.parse( annotateLicenseEntry( JSON.stringify( { 'a.png': { text: [ 'orig' ], license: 'contact' } } ), 'a.png', 'removed a label' ) );
    assert.equal( after[ 'a.png' ].license, 'contact' );
    assert.match( after[ 'a.png' ].notes, /removed a label/ );
    assert.throws( () => annotateLicenseEntry( '{}', 'a.png', 'x' ), /no license record/ );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );
