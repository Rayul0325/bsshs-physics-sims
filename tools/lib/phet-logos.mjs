// Fingerprints of every PhET / PhET-iO / adapted-from-phet logo and splash image that ever existed in
// phetsims/brand, so tools/check-sim.mjs can prove a built sim contains none of them.
// A fingerprint is the SHA-256 of the file plus a 48-character slice of its base64 text (how chipper
// embeds images and the splash in a built HTML file); see fingerprint() for where the slice comes from.
import { readFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from './git.mjs';
import { mirrorPath } from './paths.mjs';

export const FINGERPRINTS_JSON = path.join( path.dirname( fileURLToPath( import.meta.url ) ), 'phet-logo-fingerprints.json' );
const LOGO_PATH_RE = /(^|\/)images\/(logo[^/]*\.png|splash\.svg)$/;

/**
 * @param {Buffer} buf
 * @returns {{ sha256: string, base64Slice: string }}
 */
export function fingerprint( buf ) {
  const b64 = buf.toString( 'base64' );
  // PNG: the 36 bytes just before the IEND chunk (end of the compressed pixels + CRC). The middle of
  // a PhET PNG is often shared Adobe XMP metadata, which would match unrelated images.
  // SVG: 36 bytes from the middle (path data).
  const iend = buf.lastIndexOf( 'IEND' );
  const at = iend > 48 ? iend - 4 - 40 : Math.floor( buf.length / 2 );
  const start = Math.floor( at / 3 ) * 3;
  const base64Slice = b64.slice( ( start / 3 ) * 4, ( ( start + 36 ) / 3 ) * 4 );
  return { sha256: createHash( 'sha256' ).update( buf ).digest( 'hex' ), base64Slice };
}

/**
 * Collects fingerprints from the cached phetsims/brand mirror (all commits, all brands).
 * @returns {Promise<{ path: string, blob: string, sha256: string, base64Slice: string }[]>}
 */
export async function collectFingerprints() {
  const dir = mirrorPath( 'brand' );
  if ( !existsSync( dir ) ) { throw new Error( `no brand mirror at ${dir}; run npm run fetch-sources` ); }
  const listing = await git( [ '-C', dir, 'rev-list', '--all', '--objects' ] );
  const seen = new Map();
  for ( const line of listing.split( '\n' ) ) {
    const [ blob, p ] = [ line.slice( 0, 40 ), line.slice( 41 ) ];
    if ( p && LOGO_PATH_RE.test( p ) && !seen.has( blob ) ) { seen.set( blob, p ); }
  }
  const out = [];
  for ( const [ blob, p ] of seen ) {
    const buf = await blobBuffer( dir, blob );
    const fp = fingerprint( buf );
    if ( buf.length >= 64 ) { out.push( { path: p, blob, ...fp } ); }
  }
  out.sort( ( a, b ) => a.path.localeCompare( b.path ) || a.blob.localeCompare( b.blob ) );
  return out;
}

/**
 * @param {string} dir
 * @param {string} blob
 * @returns {Promise<Buffer>}
 */
function blobBuffer( dir, blob ) {
  return new Promise( ( resolve, reject ) => {
    execFile( 'git', [ '-C', dir, 'cat-file', 'blob', blob ], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      ( err, stdout ) => ( err ? reject( err ) : resolve( stdout ) ) );
  } );
}

/** Rewrites the committed fingerprint file from the mirror. */
export async function refreshFingerprints() {
  const list = await collectFingerprints();
  await writeFile( FINGERPRINTS_JSON, JSON.stringify( {
    about: 'PhET brand logo/splash images (phetsims/brand, every commit in the local mirror). Regenerate: node tools/check-sim.mjs --refresh-logo-fingerprints',
    count: list.length,
    fingerprints: list
  }, null, 2 ) + '\n' );
  return list.length;
}

/** @returns {{ path: string, sha256: string, base64Slice: string }[]} */
export function loadFingerprints() {
  return JSON.parse( readFileSync( FINGERPRINTS_JSON, 'utf8' ) ).fingerprints;
}
