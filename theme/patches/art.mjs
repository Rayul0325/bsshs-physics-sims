// Art layer: replaces a pinned sim's PNG pictures (and the generated modules that carry them) with flat
// pictures drawn from SVG files under theme/art/. Nothing here draws or invents art; it only maps
// theme/art/map.json entries onto the files each sim's pinned repos really contain.
//
//   map.json: { "entries": [ { "repo": "scenery-phet", "files": [ "images/eraser.png" ], "svg": "scenery-phet/eraser.svg",
//                              "size": "70x57" } ] }
//   - `files` lists the pinned file names of ONE picture (families spell them differently);
//   - `size` (optional) narrows an entry to the family whose PNG has that pixel size;
//   - the SVG states its pixel size in width/height and colors as {{sim.physics.copper}} token placeholders.
//
// Guards (tests/theme/art.test.mjs): a rendered picture whose pixel size differs from the original fails the
// build; a module of an unknown shape is refused; a picture without a license.json beside it is refused;
// anything but .png is refused. RequireJS-style families (no committed modules, the build's image plugin reads
// the PNG) need only the PNG replaced, which is exactly what happens when no module is tracked.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';
import { THEME_DIR, resolveSvgPlaceholders } from '../index.mjs';
import { listTree, readBlob } from '../../tools/lib/pinned.mjs';
import { cacheDir } from '../../tools/lib/paths.mjs';
import { REPO_URL } from '../../brand/bsshs/attribution.mjs';

export const ART_DIR = path.join( THEME_DIR, 'art' );
export const ART_MAP = path.join( ART_DIR, 'map.json' );
const RENDER_VERSION = 1;
const PNG_SIGNATURE = Buffer.from( [ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ] );

/**
 * @typedef {object} ArtEntry
 * @property {string} repo - sibling directory in the slot
 * @property {string[]} files - repo-relative .png names of this picture
 * @property {string} [svg] - new drawing: path under theme/art/
 * @property {string} [png] - retouched original (same pixel size, its license record is kept and annotated): path under theme/art/
 * @property {string} [note] - for `png`: what was changed; required, it goes into license.json
 * @property {string} [size] - `WxH`: only the family whose PNG has this pixel size
 */

/**
 * Reads and validates theme/art/map.json (a missing file means no art).
 * @param {string} [file]
 * @param {string} [artDir]
 * @returns {{ entries: ArtEntry[] }}
 */
export function loadArtMap( file = ART_MAP, artDir = ART_DIR ) {
  if ( !existsSync( file ) ) { return { entries: [] }; }
  const raw = JSON.parse( readFileSync( file, 'utf8' ) );
  const problems = validateArtMap( raw, artDir );
  if ( problems.length ) { throw new Error( `invalid ${file}:\n  ${problems.join( '\n  ' )}` ); }
  return { entries: raw.entries.map( e => ( { ...e, files: e.files || [ e.file ] } ) ) };
}

/**
 * @param {any} map
 * @param {string} [artDir]
 * @returns {string[]} problems
 */
export function validateArtMap( map, artDir = ART_DIR ) {
  const out = [];
  if ( !map || !Array.isArray( map.entries ) ) { return [ 'map.json needs an "entries" array' ]; }
  map.entries.forEach( ( e, i ) => {
    const at = `entries[${i}]`;
    const files = e.files || ( e.file ? [ e.file ] : [] );
    if ( typeof e.repo !== 'string' || !e.repo ) { out.push( `${at}.repo missing` ); }
    if ( !files.length ) { out.push( `${at} needs file or files` ); }
    for ( const f of files ) {
      if ( typeof f !== 'string' || !f.endsWith( '.png' ) ) { out.push( `${at}: ${JSON.stringify( f )} is not a .png (only PNG art is replaced; .jpg and .svg sources are refused)` ); }
      else if ( f.startsWith( '/' ) || f.split( '/' ).includes( '..' ) ) { out.push( `${at}: ${f} is not repo-relative` ); }
    }
    if ( ( e.svg === undefined ) === ( e.png === undefined ) ) { out.push( `${at} needs exactly one of svg or png` ); }
    else if ( e.png !== undefined ) {
      if ( typeof e.png !== 'string' || e.png.split( '/' ).includes( '..' ) || !e.png.endsWith( '.png' ) ) { out.push( `${at}.png must be a .png path under theme/art/` ); }
      else if ( !existsSync( path.join( artDir, e.png ) ) ) { out.push( `${at}: ${e.png} does not exist under theme/art/` ); }
      if ( typeof e.note !== 'string' || !e.note ) { out.push( `${at}.note must say what was retouched` ); }
    }
    else if ( typeof e.svg !== 'string' || e.svg.split( '/' ).includes( '..' ) || !e.svg.endsWith( '.svg' ) ) { out.push( `${at}.svg must be a .svg path under theme/art/` ); }
    else if ( !existsSync( path.join( artDir, e.svg ) ) ) { out.push( `${at}: ${e.svg} does not exist under theme/art/` ); }
    if ( e.size !== undefined && !/^\d+x\d+$/.test( e.size ) ) { out.push( `${at}.size must look like 70x57` ); }
  } );
  return out;
}

// ---- image helpers ------------------------------------------------------------------------------------

/** @param {Buffer} buf @returns {{ w: number, h: number }} pixel size from the IHDR chunk */
export function pngSize( buf ) {
  if ( buf.length < 24 || !buf.subarray( 0, 8 ).equals( PNG_SIGNATURE ) ) { throw new Error( 'not a PNG file' ); }
  return { w: buf.readUInt32BE( 16 ), h: buf.readUInt32BE( 20 ) };
}

/** @param {string} svg @returns {{ w: number, h: number }} the pixel size stated by width/height (px or unitless) */
export function svgSize( svg ) {
  const head = /<svg\b[^>]*>/.exec( svg );
  const num = name => {
    const m = head && new RegExp( `\\b${name}\\s*=\\s*["']\\s*(\\d+(?:\\.\\d+)?)\\s*(?:px)?\\s*["']` ).exec( head[ 0 ] );
    return m ? Number( m[ 1 ] ) : null;
  };
  const w = num( 'width' );
  const h = num( 'height' );
  if ( !w || !h ) { throw new Error( 'svg needs pixel width and height attributes' ); }
  return { w, h };
}

/**
 * The dimension guard: a picture may replace an original only at exactly the same pixel size
 * (code such as CoilNode scales by it and anchors wires to it).
 * @param {{ w: number, h: number }} original
 * @param {{ w: number, h: number }} art
 * @param {string} label
 */
export function assertSameSize( original, art, label ) {
  if ( original.w !== art.w || original.h !== art.h ) {
    throw new Error( `art dimension mismatch for ${label}: original ${original.w}x${original.h}, art ${art.w}x${art.h}` );
  }
}

/** @param {Buffer} rgba @param {number} w @param {number} h @returns {Buffer} PNG file (RGBA, 8 bit, no filter) */
export function encodePng( rgba, w, h ) {
  const stride = w * 4;
  const raw = Buffer.alloc( ( stride + 1 ) * h );
  for ( let y = 0; y < h; y++ ) {
    raw[ y * ( stride + 1 ) ] = 0;
    rgba.copy( raw, y * ( stride + 1 ) + 1, y * stride, ( y + 1 ) * stride );
  }
  const chunk = ( type, data ) => {
    const head = Buffer.alloc( 8 );
    head.writeUInt32BE( data.length, 0 );
    head.write( type, 4, 'latin1' );
    const crc = Buffer.alloc( 4 );
    crc.writeUInt32BE( zlib.crc32( Buffer.concat( [ head.subarray( 4 ), data ] ) ) >>> 0, 0 );
    return Buffer.concat( [ head, data, crc ] );
  };
  const ihdr = Buffer.alloc( 13 );
  ihdr.writeUInt32BE( w, 0 );
  ihdr.writeUInt32BE( h, 4 );
  ihdr[ 8 ] = 8; ihdr[ 9 ] = 6; ihdr[ 10 ] = 0; ihdr[ 11 ] = 0; ihdr[ 12 ] = 0;
  return Buffer.concat( [ PNG_SIGNATURE, chunk( 'IHDR', ihdr ), chunk( 'IDAT', zlib.deflateSync( raw, { level: 9 } ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] );
}

/**
 * Half-size level of an RGBA image, the same arithmetic as chipper's mipmapDownscale (alpha-weighted blend in
 * gamma 2.2 space, sizes rounded up). chipper loops over the full-size grid and relies on later rows to
 * overwrite stray writes; looping over the small grid gives the same result.
 * @param {{ data: Buffer, width: number, height: number }} level
 * @returns {{ data: Buffer, width: number, height: number }}
 */
export function mipmapDownscale( { data, width, height } ) {
  const GAMMA = 2.2;
  const sw = Math.ceil( width / 2 );
  const sh = Math.ceil( height / 2 );
  const out = Buffer.alloc( 4 * sw * sh );
  const px = ( row, col ) => {
    if ( row >= height || col >= width ) { return [ 0, 0, 0, 0 ]; }
    const i = 4 * ( row * width + col );
    return [ Math.pow( data[ i ] / 255, GAMMA ), Math.pow( data[ i + 1 ] / 255, GAMMA ), Math.pow( data[ i + 2 ] / 255, GAMMA ), Math.pow( data[ i + 3 ] / 255, GAMMA ) ];
  };
  for ( let row = 0; row < sh; row++ ) {
    for ( let col = 0; col < sw; col++ ) {
      const p = [ px( 2 * row, 2 * col ), px( 2 * row, 2 * col + 1 ), px( 2 * row + 1, 2 * col ), px( 2 * row + 1, 2 * col + 1 ) ];
      const alphaSum = p[ 0 ][ 3 ] + p[ 1 ][ 3 ] + p[ 2 ][ 3 ] + p[ 3 ][ 3 ];
      const o = 4 * ( row * sw + col );
      for ( let c = 0; c < 3; c++ ) {
        const v = ( p[ 0 ][ c ] * p[ 0 ][ 3 ] + p[ 1 ][ c ] * p[ 1 ][ 3 ] + p[ 2 ][ c ] * p[ 2 ][ 3 ] + p[ 3 ][ c ] * p[ 3 ][ 3 ] ) / alphaSum;
        out[ o + c ] = Math.floor( Math.pow( v, 1 / GAMMA ) * 255 ) || 0;
      }
      out[ o + 3 ] = Math.floor( Math.pow( alphaSum / 4, 1 / GAMMA ) * 255 ) || 0;
    }
  }
  return { data: out, width: sw, height: sh };
}

/** @param {Buffer} rgba @param {number} w @param {number} h @param {number} count @returns {{ width: number, height: number, url: string }[]} */
export function mipmapLevels( rgba, w, h, count ) {
  const levels = [];
  let level = { data: rgba, width: w, height: h };
  for ( let i = 0; i < count; i++ ) {
    levels.push( { width: level.width, height: level.height, url: `data:image/png;base64,${encodePng( level.data, level.width, level.height ).toString( 'base64' )}` } );
    if ( level.width <= 1 && level.height <= 1 ) { break; }
    level = mipmapDownscale( level );
  }
  return levels;
}

// ---- generated modules (_png.js / _png.ts) --------------------------------------------------------------

const IMAGE_SRC = /(image\.src = ')data:image\/png;base64,[A-Za-z0-9+/=]+(')/;
const MIPMAP_JS = /const mipmaps = \[\n[\s\S]*?\n\];/;
const MIPMAP_TS = /(const mipmaps = \[\n)[\s\S]*?(\n\];)/;

/**
 * New text of a committed picture module. The module keeps its own wrapper; only the picture data and, for a
 * mipmap, the level list change (same level count as before).
 * @param {string} oldText
 * @param {Buffer} rgba - level 0 pixels
 * @param {number} w
 * @param {number} h
 * @param {string} label - for messages
 * @returns {string}
 */
export function regenerateModule( oldText, rgba, w, h, label ) {
  if ( /new MipmapElement\(/.test( oldText ) ) {
    const n = ( oldText.match( /new MipmapElement\(/g ) || [] ).length;
    const levels = mipmapLevels( rgba, w, h, n );
    const first = /new MipmapElement\( (\d+), (\d+),/.exec( oldText );
    if ( !first ) { throw new Error( `art module format not recognised (refusing to guess): ${label}` ); }
    assertSameSize( { w: Number( first[ 1 ] ), h: Number( first[ 2 ] ) }, { w, h }, label );
    return oldText.replace( MIPMAP_TS, ( _, a, b ) => `${a}${levels.map( l => `  new MipmapElement( ${l.width}, ${l.height}, '${l.url}' )` ).join( ',\n' )}${b}` );
  }
  if ( MIPMAP_JS.test( oldText ) ) {
    const n = ( oldText.match( /"width":/g ) || [] ).length;
    const first = /"width": (\d+),\s*"height": (\d+)/.exec( oldText );
    if ( !first ) { throw new Error( `art module format not recognised (refusing to guess): ${label}` ); }
    assertSameSize( { w: Number( first[ 1 ] ), h: Number( first[ 2 ] ) }, { w, h }, label );
    const levels = mipmapLevels( rgba, w, h, n );
    return oldText.replace( MIPMAP_JS, () => `const mipmaps = ${JSON.stringify( levels, null, 2 )};` );
  }
  if ( IMAGE_SRC.test( oldText ) ) {
    return oldText.replace( IMAGE_SRC, ( _, a, b ) => `${a}data:image/png;base64,${encodePng( rgba, w, h ).toString( 'base64' )}${b}` );
  }
  throw new Error( `art module format not recognised (refusing to guess): ${label}` );
}

/**
 * license.json after the entry of `fileName` was replaced by our own, truthful record: the picture is new
 * work of this project under GPL-3.0, not a copy of the PhET file it stands in for.
 * @param {string} oldText
 * @param {string} fileName - key (base name) of the picture in that license.json
 * @returns {string}
 */
export function replaceLicenseEntry( oldText, fileName ) {
  const json = JSON.parse( oldText );
  json[ fileName ] = {
    text: [ 'Copyright 2026, bsshs-physics-sims contributors' ],
    projectURL: REPO_URL,
    license: 'GPL-3.0',
    notes: 'Original flat vector drawing for the school edition (theme/art); not a copy of the picture it replaces.'
  };
  return `${JSON.stringify( json, null, 2 )}\n`;
}

/**
 * license.json of a retouched original: the record stays what it was, plus a note of the change.
 * @param {string} oldText
 * @param {string} fileName
 * @param {string} note
 * @returns {string}
 */
export function annotateLicenseEntry( oldText, fileName, note ) {
  const json = JSON.parse( oldText );
  if ( !json[ fileName ] ) { throw new Error( `no license record for ${fileName}; refusing to retouch without one` ); }
  json[ fileName ] = { ...json[ fileName ], notes: [ json[ fileName ].notes, `Retouched for the school edition: ${note}` ].filter( Boolean ).join( ' ' ) };
  return `${JSON.stringify( json, null, 2 )}\n`;
}

// ---- rendering --------------------------------------------------------------------------------------------

/**
 * Renders SVG texts to RGBA pixels in the installed Chrome (one browser for the whole batch) and caches the
 * pixels under $BSSHS_CACHE/bsshs-art/ by a hash of text, size and renderer version.
 * @param {{ svg: string, w: number, h: number }[]} jobs
 * @returns {Promise<Buffer[]>} RGBA buffers, in job order
 */
export async function renderSvgs( jobs ) {
  const dir = path.join( cacheDir(), 'bsshs-art' );
  const keyOf = j => createHash( 'sha256' ).update( JSON.stringify( [ RENDER_VERSION, j.svg, j.w, j.h ] ) ).digest( 'hex' ).slice( 0, 32 );
  const out = new Array( jobs.length );
  const todo = [];
  for ( const [ i, j ] of jobs.entries() ) {
    const f = path.join( dir, `${keyOf( j )}.rgba` );
    if ( existsSync( f ) ) { out[ i ] = await readFile( f ); } else { todo.push( i ); }
  }
  if ( todo.length ) {
    const { chromium } = await import( 'playwright' );
    const browser = await chromium.launch( { channel: 'chrome', headless: true } );
    try {
      const page = await browser.newPage( { deviceScaleFactor: 1 } );
      await page.setContent( '<!DOCTYPE html><html><body></body></html>' );
      await mkdir( dir, { recursive: true } );
      for ( const i of todo ) {
        const j = jobs[ i ];
        const b64 = await page.evaluate( async ( { svg, w, h } ) => {
          const img = new Image();
          img.src = `data:image/svg+xml;base64,${btoa( unescape( encodeURIComponent( svg ) ) )}`;
          await img.decode();
          const c = document.createElement( 'canvas' );
          c.width = w; c.height = h;
          const ctx = c.getContext( '2d', { willReadFrequently: true } );
          ctx.drawImage( img, 0, 0, w, h );
          const d = ctx.getImageData( 0, 0, w, h ).data;
          let bin = '';
          for ( let k = 0; k < d.length; k += 8192 ) { bin += String.fromCharCode( ...d.subarray( k, k + 8192 ) ); }
          return btoa( bin );
        }, j );
        out[ i ] = Buffer.from( b64, 'base64' );
        const f = path.join( dir, `${keyOf( j )}.rgba` );
        await writeFile( `${f}.tmp-${process.pid}`, out[ i ] );
        await rename( `${f}.tmp-${process.pid}`, f );
      }
    }
    finally { await browser.close(); }
  }
  return out;
}

// ---- per-sim preparation ---------------------------------------------------------------------------------

/** @param {string} s */
const slug = s => `${s.toLowerCase().replace( /[^a-z0-9]+/g, '-' ).replace( /^-|-$/g, '' )}-${createHash( 'sha1' ).update( s ).digest( 'hex' ).slice( 0, 6 )}`;

/**
 * The art rules of ONE sim, built from the files its pinned repos really contain, plus the text its hash
 * must cover. A sim whose repos contain none of the mapped files gets no rules.
 * @param {Record<string, string>} deps - sibling directory -> pinned SHA
 * @param {any} tokens
 * @param {{ map?: { entries: ArtEntry[] }, artDir?: string, render?: typeof renderSvgs }} [opts]
 * @returns {Promise<{ rules: import('./engine.mjs').PatchRule[], hashInput: string[] }>}
 */
export async function prepareArt( deps, tokens, { map = loadArtMap(), artDir = ART_DIR, render = renderSvgs } = {} ) {
  /** @type {{ repo: string, sha: string, file: string, entry: ArtEntry, svg: string, w: number, h: number }[]} */
  const picks = [];
  for ( const [ repo, sha ] of Object.entries( deps ) ) {
    const relevant = map.entries.filter( e => e.repo === repo );
    if ( !relevant.length ) { continue; }
    const tree = new Set( await listTree( repo, sha ) );
    const names = [ ...new Set( relevant.flatMap( e => e.files ) ) ].filter( f => tree.has( f ) );
    for ( const file of names ) {
      const orig = await readBlob( repo, sha, file );
      const size = pngSize( orig );
      const cands = relevant.filter( e => e.files.includes( file ) && ( !e.size || e.size === `${size.w}x${size.h}` ) );
      if ( cands.length !== 1 ) {
        throw new Error( cands.length ? `art map is ambiguous for ${repo}/${file}` :
                                        `no art entry for ${repo}/${file} at ${size.w}x${size.h} (map.json lists it only for other sizes)` );
      }
      let svg;
      if ( cands[ 0 ].png ) {
        // A retouched original goes through the same renderer, so size checks and modules stay one code path.
        const retouched = readFileSync( path.join( artDir, cands[ 0 ].png ) );
        assertSameSize( size, pngSize( retouched ), `${repo}/${file}` );
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}"><image width="${size.w}" height="${size.h}" href="data:image/png;base64,${retouched.toString( 'base64' )}"/></svg>`;
      }
      else { svg = resolveSvgPlaceholders( readFileSync( path.join( artDir, cands[ 0 ].svg ), 'utf8' ), tokens ); }
      assertSameSize( size, svgSize( svg ), `${repo}/${file}` );
      picks.push( { repo, sha, file, entry: cands[ 0 ], svg, w: size.w, h: size.h } );
    }
  }
  if ( !picks.length ) { return { rules: [], hashInput: [] }; }
  const pixels = await render( picks.map( p => ( { svg: p.svg, w: p.w, h: p.h } ) ) );
  const rules = [];
  for ( const [ i, p ] of picks.entries() ) {
    const rgba = pixels[ i ];
    if ( rgba.length !== p.w * p.h * 4 ) { throw new Error( `art dimension mismatch for ${p.repo}/${p.file}: renderer returned ${rgba.length} bytes for ${p.w}x${p.h}` ); }
    const label = `${p.repo}/${p.file}`;
    const base = `art-${slug( `${p.repo}/${p.file}` )}`;
    rules.push( {
      id: `${base}-png`, kind: 'art', repo: p.repo, files: [ p.file ], required: true, why: `${label}: picture from ${p.entry.svg || p.entry.png}`,
      content: ( env, old ) => { assertSameSize( pngSize( old ), { w: p.w, h: p.h }, label ); return encodePng( rgba, p.w, p.h ); }
    } );
    const tree = new Set( await listTree( p.repo, p.sha ) );
    for ( const mod of [ p.file.replace( /\.png$/, '_png.js' ), p.file.replace( /\.png$/, '_png.ts' ) ].filter( f => tree.has( f ) ) ) {
      rules.push( {
        id: `${base}-module-${mod.endsWith( '.ts' ) ? 'ts' : 'js'}`, kind: 'art', repo: p.repo, files: [ mod ], required: true, why: `${label}: module of the picture`,
        content: ( env, old ) => regenerateModule( old.toString( 'utf8' ), rgba, p.w, p.h, `${p.repo}/${mod}` )
      } );
    }
    const licenseFile = `${path.posix.dirname( p.file )}/license.json`;
    if ( !tree.has( licenseFile ) ) { throw new Error( `${label}: no ${licenseFile} beside the picture; refusing to replace art without a license record` ); }
    rules.push( {
      id: `${base}-license`, kind: 'art', repo: p.repo, files: [ licenseFile ], required: true, why: `${label}: license record of the new picture`,
      content: ( env, old ) => ( p.entry.png ? annotateLicenseEntry : replaceLicenseEntry )( old.toString( 'utf8' ), path.posix.basename( p.file ), p.entry.note )
    } );
  }
  return { rules, hashInput: picks.map( p => `${p.repo}/${p.file}\n${p.svg}` ) };
}
