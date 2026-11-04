// Korean term corrections (data/term-fixes.json) applied at build time as a string override.
//
// PhET's Korean translations come from the pinned `babel` repo. A few strings are plain mistranslations
// (제논 -> 제놈) or disagree with the class terminology (콘덴서 vs 축전기). Each fix is recorded as
// original -> corrected in data/term-fixes.json and applied here to the Korean string files of the
// throwaway slot checkout, then reverted like every other patch (engine.mjs). Nothing else is touched:
// fixes are plain substring replacements inside string VALUES; keys, English text and code stay as is.
//
// Matching rules (the data file is the source of truth; tests/terms checks them against the pinned tables):
//   - a sim's fixes are its `perSim` list followed by the `global` list, applied in file order;
//   - a fix replaces every occurrence of `from` inside a Korean string value;
//   - `global` holds only replacements that are safe in every sim and every string.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from '../../tools/lib/paths.mjs';
import { loadKoTables } from '../../tools/lib/ko-strings.mjs';

export const TERM_FIXES_FILE = path.join( REPO_ROOT, 'data', 'term-fixes.json' );
export const TITLES_FILE = path.join( REPO_ROOT, 'data', 'titles.json' );

/** The three allowed reasons (short Korean tags). */
export const REASONS = Object.freeze( [ '오역', '수업 용어', '표기' ] );

/**
 * @typedef {{ from: string, to: string, reason: string }} TermFix
 * @typedef {{ global: TermFix[], perSim: Record<string, TermFix[]> }} TermFixes
 */

/**
 * @param {string} [file]
 * @returns {Promise<TermFixes>}
 */
export async function loadTermFixes( file = TERM_FIXES_FILE ) {
  const data = JSON.parse( await readFile( file, 'utf8' ) );
  const problems = validateTermFixes( data );
  if ( problems.length ) { throw new Error( `${path.basename( file )}: ${problems.join( '; ' )}` ); }
  return data;
}

/**
 * Shape check for data/term-fixes.json. Returns a list of problems (empty = valid).
 * @param {unknown} data
 * @returns {string[]}
 */
export function validateTermFixes( data ) {
  const errors = [];
  if ( !data || typeof data !== 'object' || Array.isArray( data ) ) { return [ 'must be an object { global, perSim }' ]; }
  const extra = Object.keys( data ).filter( k => k !== 'global' && k !== 'perSim' );
  if ( extra.length ) { errors.push( `unknown keys: ${extra.join( ', ' )}` ); }
  const checkList = ( list, where ) => {
    if ( !Array.isArray( list ) ) { errors.push( `${where} must be an array` ); return; }
    list.forEach( ( item, i ) => {
      const w = `${where}[${i}]`;
      if ( !item || typeof item !== 'object' ) { errors.push( `${w} must be an object` ); return; }
      const keys = Object.keys( item ).sort().join( ',' );
      if ( keys !== 'from,reason,to' ) { errors.push( `${w} must have exactly from, to, reason (has ${keys})` ); }
      for ( const k of [ 'from', 'to' ] ) {
        if ( typeof item[ k ] !== 'string' || !item[ k ] ) { errors.push( `${w}.${k} must be a non-empty string` ); }
      }
      if ( item.from === item.to ) { errors.push( `${w} changes nothing` ); }
      if ( !REASONS.includes( item.reason ) ) { errors.push( `${w}.reason must be one of ${REASONS.join( ' | ' )}` ); }
    } );
  };
  checkList( data.global, 'global' );
  if ( !data.perSim || typeof data.perSim !== 'object' || Array.isArray( data.perSim ) ) { errors.push( 'perSim must be an object' ); }
  else {
    for ( const [ id, list ] of Object.entries( data.perSim ) ) {
      if ( !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test( id ) ) { errors.push( `perSim key ${JSON.stringify( id )} is not a sim id` ); }
      checkList( list, `perSim.${id}` );
    }
  }
  return errors;
}

/**
 * The fixes that apply to one sim, in application order (its own first, then the global ones).
 * @param {TermFixes} data
 * @param {string} simId
 * @returns {TermFix[]}
 */
export const fixesForSim = ( data, simId ) => [ ...( data.perSim[ simId ] || [] ), ...data.global ];

/**
 * @param {string} value
 * @param {TermFix[]} fixes
 * @returns {string}
 */
export function applyFixesToValue( value, fixes ) {
  let out = value;
  for ( const f of fixes ) { out = out.split( f.from ).join( f.to ); }
  return out;
}

/**
 * Rewrites the values of a babel Korean string file (flat or nested layout). Returns the input
 * unchanged when no value is affected, so untouched files are never rewritten.
 * @param {Buffer} old
 * @param {TermFix[]} fixes
 * @returns {Buffer|string}
 */
export function rewriteKoStrings( old, fixes ) {
  let json;
  try { json = JSON.parse( old.toString( 'utf8' ) ); } catch { return old; }
  let changed = 0;
  const walk = obj => {
    for ( const v of Object.values( obj ) ) {
      if ( !v || typeof v !== 'object' ) { continue; }
      if ( typeof v.value === 'string' ) {
        const next = applyFixesToValue( v.value, fixes );
        if ( next !== v.value ) { v.value = next; changed++; }
      }
      else { walk( v ); }
    }
  };
  walk( json );
  return changed ? JSON.stringify( json, null, 2 ) + '\n' : old;
}

/**
 * Babel files (relative to the babel checkout) that contain at least one `from` of the sim's fixes.
 * @param {{ repo: string, file: string, strings: { value: string }[] }[]} tables - loadKoTables() result
 * @param {TermFix[]} fixes
 * @returns {string[]}
 */
export function targetFiles( tables, fixes ) {
  return tables.filter( t => t.strings.some( s => fixes.some( f => s.value.includes( f.from ) ) ) ).map( t => t.file );
}

/**
 * Patch rules for one sim's build (theme/patches/engine.mjs PatchRule[]). Empty when nothing applies.
 * @param {string} simId
 * @param {{ deps: Record<string,string>, babelSha: string }} manifest
 * @param {TermFixes} data
 * @returns {Promise<import('./engine.mjs').PatchRule[]>}
 */
export async function termFixRules( simId, manifest, data ) {
  const fixes = fixesForSim( data, simId );
  const files = targetFiles( await loadKoTables( manifest ), fixes );
  if ( !files.length ) { return []; }
  return [ {
    id: 'terms-ko-strings',
    kind: 'terms',
    repo: 'babel',
    files,
    match: 'all',
    required: true, // a fix list that no longer matches the pinned strings must not pass silently
    why: 'Korean term corrections (data/term-fixes.json): mistranslations and class-terminology mismatches in babel string values.',
    content: ( env, old ) => rewriteKoStrings( old, fixes )
  } ];
}

/**
 * Hash of the fix data, mixed into the variant's theme hash so changed fixes force a rebuild.
 * @param {TermFixes} data
 * @returns {string}
 */
export const termFixesHash = data => createHash( 'sha256' ).update( JSON.stringify( data ) ).digest( 'hex' );

/**
 * The Korean title of a sim as the catalogue shows it: the sim's `<id>.title` string with its fixes.
 * @param {string} simId
 * @param {{ deps: Record<string,string>, babelSha: string }} manifest
 * @param {TermFixes} data
 * @returns {Promise<string|null>}
 */
export async function correctedTitle( simId, manifest, data ) {
  return titleFromTables( simId, await loadKoTables( manifest ), data );
}

/**
 * Same as correctedTitle() for tables that are already loaded.
 * @param {string} simId
 * @param {{ repo: string, strings: { key: string, value: string }[] }[]} tables
 * @param {TermFixes} data
 * @returns {string|null}
 */
export function titleFromTables( simId, tables, data ) {
  const own = tables.find( t => t.repo === simId );
  const title = own && own.strings.find( s => s.key === `${simId}.title` );
  return title ? applyFixesToValue( title.value, fixesForSim( data, simId ) ) : null;
}
