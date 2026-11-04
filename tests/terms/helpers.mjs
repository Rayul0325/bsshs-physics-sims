// Shared helpers for the term-fix tests: pinned tables from the source cache, built-page string maps.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSims } from '../../tools/lib/sims.mjs';
import { readManifest } from '../../tools/lib/manifest.mjs';
import { loadKoTables } from '../../tools/lib/ko-strings.mjs';
import { buildDir } from '../../tools/lib/paths.mjs';

/** @returns {Promise<{ id: string, manifest: object, tables: Awaited<ReturnType<typeof loadKoTables>> }[]|null>} null when the source cache is absent */
export async function loadPinnedTables() {
  const out = [];
  for ( const sim of await loadSims() ) {
    const manifest = await readManifest( sim.id );
    if ( !manifest ) { return null; }
    out.push( { id: sim.id, manifest, tables: await loadKoTables( manifest ) } );
  }
  return out;
}

/** Path of a themed school-edition build. @param {string} id */
export const builtPath = id => path.join( buildDir(), 'bsshs-theme', id, `${id}_ko.html` );

/**
 * Older chipper builds embed `window.phet.chipper.strings = { "ko": {...}, "en": {...} }` as JSON; newer
 * ones embed a packed `(y=>{...})` blob where each Korean value follows a `\x08ko\x0c` marker.
 * Returns the Korean map (invisible bidi wrapper U+202A ... U+202C removed) for the JSON layout, or null
 * for the packed layout (use packedHas()).
 * @param {string} html
 * @returns {Record<string, string>|null}
 */
export function koStringsOf( html ) {
  const marker = 'window.phet.chipper.strings = ';
  const start = html.indexOf( marker );
  if ( start < 0 ) { throw new Error( 'no phet.chipper.strings in page' ); }
  const open = start + marker.length;
  if ( html[ open ] !== '{' ) { return null; }
  let depth = 0;
  let inString = false;
  let end = -1;
  for ( let i = open; i < html.length; i++ ) {
    const c = html[ i ];
    if ( inString ) {
      if ( c === '\\' ) { i++; }
      else if ( c === '"' ) { inString = false; }
    }
    else if ( c === '"' ) { inString = true; }
    else if ( c === '{' ) { depth++; }
    else if ( c === '}' && --depth === 0 ) { end = i + 1; break; }
  }
  const all = JSON.parse( html.slice( open, end ) );
  return Object.fromEntries( Object.entries( all.ko ).map( ( [ k, v ] ) => [ k, String( v ).replace( /[‪-‮]/g, '' ) ] ) );
}

/** chipper's key for a string: REPO_NAME/flat.key. @param {string} repo @param {string} key */
export const chipperKey = ( repo, key ) => `${repo.toUpperCase().replace( /-/g, '_' )}/${key}`;

export const readBuilt = id => ( existsSync( builtPath( id ) ) ? readFile( builtPath( id ), 'utf8' ) : null );

const isWordChar = c => /[\p{L}\p{N}]/u.test( c );

/**
 * True when the page holds `value` as a whole string of a packed blob: the characters just before and
 * after it are not letters or digits (so 「관례」 does not match inside 「관례적인」). The delimiters
 * differ between chipper versions, so only this boundary rule is relied on.
 * @param {string} html
 * @param {string} value - trimmed, plain (see isPlain)
 * @returns {boolean}
 */
export function packedHas( html, value ) {
  for ( let i = html.indexOf( value ); i >= 0; i = html.indexOf( value, i + 1 ) ) {
    const before = i > 0 ? html[ i - 1 ] : '';
    const after = html[ i + value.length ] ?? '';
    if ( !isWordChar( before ) && !isWordChar( after ) ) { return true; }
  }
  return false;
}

/** Values that appear verbatim in the packed blob (no quoting or markup characters). @param {string} v */
export const isPlain = v => !/["'\\\n\r<>&]/.test( v );
