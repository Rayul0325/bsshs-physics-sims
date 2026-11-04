// Reads the pinned Korean string tables of a sim straight from the cached git mirrors (no checkout).
// chipper bundles <repo>/<repo>-strings_ko.json from babel (pinned per sim by babelSha) for the sim
// and every sibling repo it depends on; this module lists exactly those files and their values.
import { showFile } from './git.mjs';
import { mirrorPath } from './paths.mjs';
import { remoteRepoFor } from './deps.mjs';

/**
 * Babel path of a repo's Korean strings.
 * @param {string} repo
 * @returns {string}
 */
export const koStringFile = repo => `${repo}/${repo}-strings_ko.json`;

/**
 * Flattens a babel string file. Both layouts occur: flat ("a.b": { "value" }) and nested
 * ({ "a": { "b": { "value" } } }).
 * @param {object} json
 * @returns {{ key: string, value: string }[]}
 */
export function flattenStrings( json ) {
  const out = [];
  const walk = ( obj, prefix ) => {
    for ( const [ k, v ] of Object.entries( obj ) ) {
      if ( !v || typeof v !== 'object' ) { continue; }
      const key = prefix ? `${prefix}.${k}` : k;
      if ( typeof v.value === 'string' ) { out.push( { key, value: v.value } ); }
      else { walk( v, key ); }
    }
  };
  walk( json, '' );
  return out;
}

/**
 * The Korean tables of a pinned sim. A string is `live` when its key also exists in the repo's English
 * string file at the pinned SHA: chipper only bundles keys the code declares, so a Korean string whose
 * key is missing from the English file (an obsolete leftover in babel) never reaches the built page.
 * @param {{ deps: Record<string,string>, babelSha: string }} manifest
 * @returns {Promise<{ repo: string, file: string, strings: { key: string, value: string, live: boolean }[] }[]>}
 *          one entry per dependency repo that has a Korean string file in babel at the pinned SHA
 */
export async function loadKoTables( manifest ) {
  const out = [];
  for ( const repo of Object.keys( manifest.deps ).sort() ) {
    const file = koStringFile( repo );
    let text;
    try { text = await showFile( mirrorPath( 'babel' ), manifest.babelSha, file ); }
    catch { continue; } // no translation file for this repo
    let enKeys = null;
    try {
      enKeys = new Set( flattenStrings( JSON.parse( await showFile( mirrorPath( remoteRepoFor( repo ) ), manifest.deps[ repo ], `${repo}-strings_en.json` ) ) ).map( s => s.key ) );
    }
    catch { /* no English file: treat every key as live */ }
    out.push( { repo, file, strings: flattenStrings( JSON.parse( text ) ).map( s => ( { ...s, live: enKeys ? enKeys.has( s.key ) : true } ) ) } );
  }
  return out;
}
