#!/usr/bin/env node
// Lists every color literal in a sim's own repo and its sim-specific common repos at the pinned SHAs, read
// straight from the git mirrors (no checkout, nothing written). Workers use it to fill theme/sim-styles/<id>.json:
// each row gives the file, the line, the occurrence number (1-based among the generic color matches of that file,
// counted with COLOR_SCAN_SOURCE), the literal, whether the file is a model path (never restyled) and whether a
// style entry already maps it. The last lines print the unmapped counts.
//
// Usage: node theme/patches/color-inventory.mjs <sim-id> [--repos a,b] [--all-libs] [--json] [--styles-dir <dir>]
//   default repos: the sim's own repo plus every pinned repo that is not one of the shared PhET libraries
//   --repos: exactly these (comma separated)       --all-libs: the shared libraries too (large)
//   --json: one JSON object instead of the table
// Each row also carries `suggest`: a `find` with the line's context before the literal wrapped around a
// capture group, and the occurrence of THAT find, ready to paste into a style entry.
import path from 'node:path';
import { readManifest } from '../../tools/lib/manifest.mjs';
import { listTree, readBlob } from '../../tools/lib/pinned.mjs';
import { pool } from '../../tools/lib/verify-core.mjs';
import { isMain } from '../../tools/lib/cli.mjs';
import { loadSimStyle, SIM_STYLES_DIR } from '../sim-style.mjs';
import { COLOR_SCAN_SOURCE, classifyColorLiteral, MODEL_PATH_RE } from './sim-color.mjs';

/** Libraries every PhET sim shares; their colors belong to the common layer (theme.mjs), not to one sim. */
export const SHARED_LIBS = Object.freeze( [
  'assert', 'axon', 'babel', 'brand', 'chipper', 'dot', 'joist', 'kite', 'perennial-alias', 'phet-core', 'phetcommon', 'phetmarks',
  'query-string-machine', 'scenery', 'scenery-phet', 'sherpa', 'sun', 'tambo', 'tandem', 'twixt', 'utterance-queue', 'mobius', 'bamboo', 'griddle', 'nitroglycerin'
] );

/** @param {string} s @returns {string} regex-escaped text */
const escapeRegex = s => s.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );

/**
 * Every color literal of one file's text.
 * @param {string} text
 * @returns {{ start: number, end: number, line: number, literal: string, occurrence: number, supported: boolean }[]}
 */
export function scanColors( text ) {
  const re = new RegExp( COLOR_SCAN_SOURCE, 'g' );
  const lineStarts = [ 0 ];
  for ( let i = 0; i < text.length; i++ ) { if ( text[ i ] === '\n' ) { lineStarts.push( i + 1 ); } }
  const lineOf = pos => { let lo = 0; let hi = lineStarts.length - 1; while ( lo < hi ) { const mid = ( lo + hi + 1 ) >> 1; if ( lineStarts[ mid ] <= pos ) { lo = mid; } else { hi = mid - 1; } } return lo; };
  const out = [];
  let n = 0;
  for ( const m of text.matchAll( re ) ) {
    const line = lineOf( m.index );
    const before = text.slice( lineStarts[ line ], m.index );
    if ( /^\s*(\/\/|\*|\/\*)/.test( before ) || /\/\/[^'"]*$/.test( before ) ) { continue; } // comments
    n++;
    out.push( { start: m.index, end: m.index + m[ 0 ].length, line: line + 1, literal: m[ 0 ], occurrence: n, supported: !!classifyColorLiteral( m[ 0 ] ) } );
  }
  return out;
}

/** Compact regex source matching literals of the same shape as `literal` (so a suggestion stays short). @param {string} literal */
function shapeOf( literal ) {
  if ( /^Color\./.test( literal ) ) { return 'Color\\.[A-Z][A-Z0-9_]*'; }
  if ( /^new Color/.test( literal ) ) { return 'new Color\\([^()]*\\)'; }
  return literal[ 0 ] === '"' ? '"[^"]*"' : '\'[^\']*\'';
}

/**
 * A style-entry suggestion for one literal: the text before it on the line (from a word boundary), then the
 * literal's shape in a capture group. `occurrence` counts the matches of THAT find.
 * @param {string} text
 * @param {{ start: number, end: number, literal: string }} lit
 * @returns {{ find: string, occurrence: number }}
 */
export function suggestEntry( text, lit ) {
  const lineStart = text.lastIndexOf( '\n', lit.start - 1 ) + 1;
  let from = Math.max( lineStart, lit.start - 28 );
  while ( from < lit.start && from > lineStart && /\w/.test( text[ from - 1 ] ) && /\w/.test( text[ from ] ) ) { from++; }
  const prefix = text.slice( from, lit.start ).replace( /^\s+/, '' );
  const find = `${escapeRegex( prefix )}(${shapeOf( lit.literal )})`;
  let occurrence = 0;
  for ( const m of text.matchAll( new RegExp( find, 'dg' ) ) ) { occurrence++; if ( m.indices[ 1 ][ 0 ] === lit.start ) { return { find, occurrence }; } }
  return { find, occurrence: 0 };
}

/**
 * The spans a style's color entries cover in one file.
 * @param {any} style
 * @param {string} repo
 * @param {string} file
 * @param {string} text
 * @returns {Set<number>} start offsets of the mapped literals
 */
export function mappedStarts( style, repo, file, text ) {
  const out = new Set();
  for ( const c of ( style && style.colors ) || [] ) {
    if ( c.repo !== repo || c.file !== file ) { continue; }
    try {
      const m = [ ...text.matchAll( new RegExp( c.find, 'dg' ) ) ][ c.occurrence - 1 ];
      if ( m ) { out.add( ( m.indices[ 1 ] || m.indices[ 0 ] )[ 0 ] ); }
    }
    catch { /* an invalid entry is reported by validateSimStyle */ }
  }
  return out;
}

/**
 * Inventory of one sim.
 * @param {string} simId
 * @param {{ repos?: string[]|null, allLibs?: boolean, stylesDir?: string }} [o]
 * @returns {Promise<{ simId: string, repos: string[], rows: object[], totals: object }>}
 */
export async function colorInventory( simId, o = {} ) {
  const m = await readManifest( simId );
  if ( !m ) { throw new Error( `no manifest for ${simId}; run npm run fetch-sources` ); }
  const style = loadSimStyle( simId, o.stylesDir || SIM_STYLES_DIR );
  const repos = o.repos || Object.keys( m.deps ).filter( r => r === simId || o.allLibs || !SHARED_LIBS.includes( r ) );
  const files = [];
  for ( const repo of repos ) {
    if ( !m.deps[ repo ] ) { throw new Error( `${simId} has no pinned repo ${repo}` ); }
    for ( const f of await listTree( repo, m.deps[ repo ] ) ) {
      if ( /^js\/.+\.(js|ts)$/.test( f ) && !/(^|\/)(tests?|[^/]*Tests?)\.(js|ts)$/.test( f ) && !/(^|\/)tests\//.test( f ) ) { files.push( { repo, f } ); }
    }
  }
  const per = await pool( files, 16, async ( { repo, f } ) => {
    const buf = await readBlob( repo, m.deps[ repo ], f );
    if ( !buf ) { return []; }
    const text = buf.toString( 'utf8' );
    const mapped = mappedStarts( style, repo, f, text );
    return scanColors( text ).map( lit => ( {
      repo, file: f, line: lit.line, occurrence: lit.occurrence, literal: lit.literal, supported: lit.supported,
      model: MODEL_PATH_RE.test( f ), mapped: mapped.has( lit.start ), suggest: lit.supported ? suggestEntry( text, lit ) : null
    } ) );
  } );
  const rows = per.flat();
  const unmapped = rows.filter( r => !r.mapped );
  const totals = {
    literals: rows.length, mapped: rows.length - unmapped.length, unmapped: unmapped.length,
    unmappedEditable: unmapped.filter( r => !r.model && r.supported ).length, unmappedModel: unmapped.filter( r => r.model ).length,
    unmappedUnsupported: unmapped.filter( r => !r.model && !r.supported ).length,
    byRepo: Object.fromEntries( repos.map( r => [ r, { literals: rows.filter( x => x.repo === r ).length, unmapped: unmapped.filter( x => x.repo === r ).length } ] ) )
  };
  return { simId, repos, rows, totals };
}

/** @param {string[]} argv @returns {Promise<number>} */
export async function main( argv ) {
  const o = { id: null, repos: null, allLibs: false, json: false, stylesDir: SIM_STYLES_DIR };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--repos' ) ) { o.repos = val().split( ',' ).filter( Boolean ); }
    else if ( a === '--all-libs' ) { o.allLibs = true; }
    else if ( a === '--json' ) { o.json = true; }
    else if ( a.startsWith( '--styles-dir' ) ) { o.stylesDir = path.resolve( val() ); }
    else if ( a.startsWith( '-' ) ) { console.error( `unknown option ${a}` ); return 2; }
    else if ( !o.id ) { o.id = a; }
    else { console.error( `unexpected argument ${a}` ); return 2; }
  }
  if ( !o.id ) { console.error( 'usage: color-inventory.mjs <sim-id> [--repos a,b] [--all-libs] [--json]' ); return 2; }
  try {
    const r = await colorInventory( o.id, o );
    if ( o.json ) { console.log( JSON.stringify( r ) ); return 0; }
    for ( const x of r.rows ) {
      console.log( `${x.mapped ? 'mapped  ' : x.model ? 'model   ' : x.supported ? 'unmapped' : 'unsupp. '} ${x.repo}/${x.file}:${x.line}  #${x.occurrence}  ${x.literal}` );
    }
    console.log( `\n${r.simId}: ${r.totals.literals} color literals in ${r.repos.join( ', ' )}` );
    for ( const [ repo, c ] of Object.entries( r.totals.byRepo ) ) { console.log( `  ${repo}: ${c.literals} literals, ${c.unmapped} unmapped` ); }
    console.log( `unmapped ${r.totals.unmapped}: ${r.totals.unmappedEditable} editable, ${r.totals.unmappedModel} in model paths (exceptions only), ${r.totals.unmappedUnsupported} the grammar cannot rewrite` );
    return 0;
  }
  catch ( e ) { console.error( e.message ); return 2; }
}

if ( isMain( import.meta.url ) ) { main( process.argv.slice( 2 ) ).then( c => { process.exitCode = c; } ); }
