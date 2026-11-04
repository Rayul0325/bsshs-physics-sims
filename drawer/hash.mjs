// Physics-content hash of one exam sim (spec 3.5). A teacher's approval records this hash; when it no
// longer matches, the 확인 완료 label falls back to 확인 중.
//
// Scope (and NOTHING else):
//   lessons      data/lessons/<id>.json                (formulas, terms, notes, class units)
//   drawer.json  adapters/<id>/drawer.json             (measurement items: names, units, conversions; graphs)
//   cases.json   adapters/<id>/cases.json              (V3 physics check cases)
//   adapter.mjs  adapters/<id>/adapter.mjs             (reads and derives the values students see and log)
//   model/**     sims/<id>/js/model/**                 (new sims only, when present)
// Excluded on purpose: theme/tokens.json, theme/**, brand/**, data/term-fixes.json,
// drawer/** (layout and style), view code.
//
// JSON files are hashed in canonical form (keys sorted, no whitespace), so reformatting a file does not
// invalidate an approval; any change of content does. A missing file is part of the input too.
// tools/approve and tools/set-status (T12) must call physicsHash() — never re-implement it.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
/** Bump only when the scope or the encoding below changes (every approval then goes stale). */
export const HASH_SCOPE_VERSION = 2;

/**
 * JSON with object keys sorted at every level.
 * @param {unknown} v
 * @returns {string}
 */
export function canonicalJson( v ) {
  if ( Array.isArray( v ) ) { return `[${v.map( canonicalJson ).join( ',' )}]`; }
  if ( v && typeof v === 'object' ) {
    return `{${Object.keys( v ).sort().map( k => `${JSON.stringify( k )}:${canonicalJson( v[ k ] )}` ).join( ',' )}}`;
  }
  return JSON.stringify( v );
}

/** @param {string} dir @returns {string[]} files below dir, posix-relative, sorted */
function listFiles( dir ) {
  const out = [];
  const walk = rel => {
    for ( const name of readdirSync( path.join( dir, rel ) ).sort() ) {
      const r = rel ? `${rel}/${name}` : name;
      if ( statSync( path.join( dir, r ) ).isDirectory() ) { walk( r ); }
      else { out.push( r ); }
    }
  };
  walk( '' );
  return out.sort();
}

/**
 * @param {string} label
 * @param {string} file
 * @param {'json'|'text'} kind
 * @returns {{ label: string, file: string, kind: string, content: string|null }}
 */
function input( label, file, kind ) {
  if ( !existsSync( file ) ) { return { label, file, kind: 'missing', content: null }; }
  const raw = readFileSync( file, 'utf8' );
  if ( kind === 'json' ) {
    try { return { label, file, kind, content: canonicalJson( JSON.parse( raw ) ) }; }
    catch { return { label, file, kind: 'text', content: raw.replace( /\r\n/g, '\n' ) }; } // invalid JSON: hash bytes
  }
  return { label, file, kind, content: raw.replace( /\r\n/g, '\n' ) };
}

/**
 * The files (with labels) that make up the physics hash of a sim.
 * @param {string} id
 * @param {{ repoRoot?: string, adapterDir?: string, lessonsFile?: string }} [opts] - adapterDir/lessonsFile
 *   override where the files are read from (labels stay the same, so the hash does not depend on location)
 * @returns {{ label: string, file: string, kind: string, content: string|null }[]}
 */
export function physicsHashInputs( id, opts = {} ) {
  const root = opts.repoRoot || REPO_ROOT;
  const adapterDir = opts.adapterDir || path.join( root, 'adapters', id );
  const out = [
    input( 'lessons', opts.lessonsFile || path.join( root, 'data', 'lessons', `${id}.json` ), 'json' ),
    input( 'drawer.json', path.join( adapterDir, 'drawer.json' ), 'json' ),
    input( 'cases.json', path.join( adapterDir, 'cases.json' ), 'json' ),
    input( 'adapter.mjs', path.join( adapterDir, 'adapter.mjs' ), 'text' )
  ];
  const modelDir = path.join( root, 'sims', id, 'js', 'model' );
  if ( existsSync( modelDir ) && statSync( modelDir ).isDirectory() ) {
    for ( const rel of listFiles( modelDir ) ) { out.push( input( `model/${rel}`, path.join( modelDir, rel ), 'text' ) ); }
  }
  return out;
}

/**
 * sha256 hex of a sim's physics content (scope above).
 * @param {string} id
 * @param {{ repoRoot?: string, adapterDir?: string, lessonsFile?: string }} [opts]
 * @returns {string}
 */
export function physicsHash( id, opts = {} ) {
  const h = createHash( 'sha256' );
  h.update( `bsshs-physics-hash v${HASH_SCOPE_VERSION}\n` );
  for ( const i of physicsHashInputs( id, opts ) ) {
    h.update( `${i.label}\n` );
    if ( i.content === null ) { h.update( '<missing>\n' ); }
    else { h.update( `${Buffer.byteLength( i.content )}\n${i.content}\n` ); }
  }
  return h.digest( 'hex' );
}
