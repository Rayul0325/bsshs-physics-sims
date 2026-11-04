// Post-build injection of the class drawer into ONE built sim HTML (never the PhET sources).
// Inlines, right before </body>: the token CSS variables, the drawer data (drawer.json, the lessons
// content WITHOUT `sources`, the computed verification status, the physics hash, the drawer CSS), the
// drawer core + runtime, and the sim's adapter as an inline module script. Nothing is fetched at run
// time. Re-injecting replaces the previous block (idempotent).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadTokens, toCssVariables } from '../theme/index.mjs';
import { physicsHash, REPO_ROOT } from './hash.mjs';
import { resolveStatus, loadStatusFile, STATUS_FILE } from './status.mjs';
import { drawerLayout } from './config.mjs';

export const DRAWER_DIR = path.join( REPO_ROOT, 'drawer' );
export const DRAWER_MARKER_START = '<!-- bsshs-drawer:begin';
export const DRAWER_MARKER_END = '<!-- bsshs-drawer:end -->';
const BLOCK_RE = /<!-- bsshs-drawer:begin[\s\S]*?<!-- bsshs-drawer:end -->\n?/;
const DATA_RE = /(<script type="application\/json" id="bsshs-drawer-data">)([\s\S]*?)(<\/script>)/;

const CAMEL_RE = /^[a-z][a-zA-Z0-9]*$/;
const GRAPH_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const HANGUL_RE = /[가-힣]/;
/** Lessons fields that may be shown. Everything else (notably `sources`) stays in the repo. */
const PUBLIC_LESSON_FIELDS = [ 'id', 'title', 'unit', 'formulas', 'terms', 'classUnits' ];

const isObj = v => !!v && typeof v === 'object' && !Array.isArray( v );
const nonEmpty = v => typeof v === 'string' && v.trim().length > 0;
const finite = v => typeof v === 'number' && Number.isFinite( v );

/**
 * Problems in an adapters/<id>/drawer.json (empty = valid). The shape is pinned (docs/drawer.md).
 * @param {any} dj
 * @param {string} id - expected simId
 * @returns {string[]}
 */
export function validateDrawerJson( dj, id ) {
  const e = [];
  if ( !isObj( dj ) ) { return [ 'drawer.json must be an object' ]; }
  for ( const k of Object.keys( dj ) ) {
    if ( ![ 'simId', 'schemaVersion', 'measurements', 'graphs' ].includes( k ) ) { e.push( `unexpected top-level key ${k}` ); }
  }
  if ( dj.simId !== id ) { e.push( `simId must be ${JSON.stringify( id )}, got ${JSON.stringify( dj.simId )}` ); }
  if ( !Number.isInteger( dj.schemaVersion ) || dj.schemaVersion < 1 ) { e.push( 'schemaVersion must be an integer ≥ 1' ); }
  const keys = new Set();
  if ( !Array.isArray( dj.measurements ) || !dj.measurements.length ) { e.push( 'measurements must be a non-empty array' ); }
  for ( const m of dj.measurements || [] ) {
    const w = `measurement ${JSON.stringify( m && m.key )}`;
    if ( !isObj( m ) ) { e.push( `${w}: must be an object` ); continue; }
    for ( const k of Object.keys( m ) ) { if ( ![ 'key', 'name', 'unit', 'classUnit' ].includes( k ) ) { e.push( `${w}: unexpected field ${k}` ); } }
    if ( typeof m.key !== 'string' || !CAMEL_RE.test( m.key ) ) { e.push( `${w}: key must be camelCase` ); }
    else if ( keys.has( m.key ) ) { e.push( `${w}: duplicate key` ); }
    keys.add( m.key );
    if ( !nonEmpty( m.name ) || !HANGUL_RE.test( m.name ) ) { e.push( `${w}: name must be Korean` ); }
    if ( typeof m.unit !== 'string' ) { e.push( `${w}: unit must be a string ('' for none)` ); }
    if ( 'classUnit' in m ) {
      const c = m.classUnit;
      if ( !isObj( c ) ) { e.push( `${w}: classUnit must be an object` ); continue; }
      for ( const k of Object.keys( c ) ) { if ( ![ 'unit', 'factor', 'offset' ].includes( k ) ) { e.push( `${w}: classUnit has unexpected field ${k}` ); } }
      if ( !nonEmpty( c.unit ) ) { e.push( `${w}: classUnit.unit required` ); }
      if ( !finite( c.factor ) || c.factor === 0 ) { e.push( `${w}: classUnit.factor must be a non-zero number` ); }
      if ( 'offset' in c && !finite( c.offset ) ) { e.push( `${w}: classUnit.offset must be a number` ); }
      if ( c.unit === m.unit ) { e.push( `${w}: classUnit.unit equals unit` ); }
    }
  }
  if ( !Array.isArray( dj.graphs ) || dj.graphs.length < 2 ) { e.push( 'graphs: two or more graphs are required' ); }
  const gids = new Set();
  for ( const g of dj.graphs || [] ) {
    const w = `graph ${JSON.stringify( g && g.id )}`;
    if ( !isObj( g ) ) { e.push( `${w}: must be an object` ); continue; }
    for ( const k of Object.keys( g ) ) { if ( ![ 'id', 'title', 'x', 'y', 'fit' ].includes( k ) ) { e.push( `${w}: unexpected field ${k}` ); } }
    if ( typeof g.id !== 'string' || !GRAPH_ID_RE.test( g.id ) || g.id === 'free' ) { e.push( `${w}: id must be kebab-case and not "free"` ); }
    else if ( gids.has( g.id ) ) { e.push( `${w}: duplicate id` ); }
    gids.add( g.id );
    if ( !nonEmpty( g.title ) || !HANGUL_RE.test( g.title ) ) { e.push( `${w}: title must be Korean` ); }
    if ( !keys.has( g.x ) ) { e.push( `${w}: x ${JSON.stringify( g.x )} is not a measurement key` ); }
    const ys = Array.isArray( g.y ) ? g.y : [ g.y ];
    if ( !ys.length ) { e.push( `${w}: y must be a key or a non-empty array of keys` ); }
    for ( const y of ys ) { if ( !keys.has( y ) ) { e.push( `${w}: y ${JSON.stringify( y )} is not a measurement key` ); } }
    if ( !( 'fit' in g ) || ( g.fit !== 'linear' && g.fit !== null ) ) { e.push( `${w}: fit must be "linear" or null` ); }
  }
  return e;
}

/**
 * Problems in an adapters/<id>/cases.json (V3 cases) against its drawer.json.
 * @param {any} cases
 * @param {{ measurements: { key: string }[] }} dj
 * @returns {string[]}
 */
export function validateCases( cases, dj ) {
  if ( !Array.isArray( cases ) ) { return [ 'cases.json must be an array' ]; }
  const keys = new Set( ( dj.measurements || [] ).map( m => m.key ) );
  const e = [];
  cases.forEach( ( c, i ) => {
    const w = `case ${i} ${JSON.stringify( c && c.name )}`;
    if ( !isObj( c ) ) { e.push( `${w}: must be an object` ); return; }
    for ( const k of Object.keys( c ) ) { if ( ![ 'name', 'params', 'expect' ].includes( k ) ) { e.push( `${w}: unexpected field ${k}` ); } }
    if ( !nonEmpty( c.name ) ) { e.push( `${w}: name required` ); }
    if ( !isObj( c.params ) ) { e.push( `${w}: params must be an object` ); }
    if ( !isObj( c.expect ) || !Object.keys( c.expect ).length ) { e.push( `${w}: expect must be a non-empty object` ); return; }
    for ( const [ k, x ] of Object.entries( c.expect ) ) {
      if ( !keys.has( k ) ) { e.push( `${w}: expect key ${k} is not a measurement key` ); }
      if ( !isObj( x ) || !finite( x.value ) ) { e.push( `${w}: expect.${k}.value must be a number` ); continue; }
      for ( const kk of Object.keys( x ) ) { if ( ![ 'value', 'relTol' ].includes( kk ) ) { e.push( `${w}: expect.${k} has unexpected field ${kk}` ); } }
      if ( 'relTol' in x && ( !finite( x.relTol ) || x.relTol < 0 ) ) { e.push( `${w}: expect.${k}.relTol must be ≥ 0` ); }
    }
  } );
  return e;
}

/**
 * Problems in an adapter.mjs source: it is inlined as an inline module script, so it cannot import.
 * @param {string} src
 * @returns {string[]}
 */
export function validateAdapterSource( src ) {
  const e = [];
  const code = src.replace( /\/\*[\s\S]*?\*\//g, '' ).replace( /(^|[^:])\/\/.*$/gm, '$1' );
  if ( /^\s*import[\s{*'"]/m.test( code ) || /\bimport\s*\(/.test( code ) ) { e.push( 'adapter.mjs must not import (it is inlined; there is nothing to fetch)' ); }
  if ( !/\bregister\s*\(/.test( code ) ) { e.push( 'adapter.mjs must call bsshsDrawer.register({...})' ); }
  return e;
}

/** @param {string} file */
const readJson = file => JSON.parse( readFileSync( file, 'utf8' ) );

/** Script text that cannot close its own <script> element. @param {string} s */
const scriptSafe = s => s.replace( /<\/(script)/gi, '<\\/$1' ).replace( /<!--/g, '<\\!--' );
/** JSON that is safe inside <script type="application/json">. @param {unknown} v */
const jsonSafe = v => JSON.stringify( v ).replace( /</g, '\\u003c' )
  .split( String.fromCharCode( 0x2028 ) ).join( '\\u2028' ).split( String.fromCharCode( 0x2029 ) ).join( '\\u2029' );

/**
 * drawer.css with the layout values (from theme/tokens.json, via drawer/config.mjs) filled in.
 * @param {any} [tokens]
 * @returns {string}
 */
export function drawerCss( tokens = loadTokens() ) {
  const layout = drawerLayout( tokens );
  return readFileSync( path.join( DRAWER_DIR, 'drawer.css' ), 'utf8' ).replace( /__(\w+)__/g, ( m, k ) => {
    if ( !( k in layout ) ) { throw new Error( `drawer.css: unknown placeholder ${m}` ); }
    return String( layout[ k ] );
  } );
}

/**
 * Everything the runtime needs for one sim (validated).
 * @param {string} id
 * @param {{ repoRoot?: string, adapterDir?: string, lessonsFile?: string, status?: object, statusFile?: string }} [opts]
 * @returns {{ data: object, adapterSource: string }}
 */
export function buildDrawerData( id, opts = {} ) {
  const root = opts.repoRoot || REPO_ROOT;
  const adapterDir = opts.adapterDir || path.join( root, 'adapters', id );
  const lessonsFile = opts.lessonsFile || path.join( root, 'data', 'lessons', `${id}.json` );
  const djFile = path.join( adapterDir, 'drawer.json' );
  const adFile = path.join( adapterDir, 'adapter.mjs' );
  const casesFile = path.join( adapterDir, 'cases.json' );
  for ( const f of [ djFile, adFile ] ) { if ( !existsSync( f ) ) { throw new Error( `inject-drawer: missing ${f}` ); } }
  const drawer = readJson( djFile );
  const problems = validateDrawerJson( drawer, id );
  if ( existsSync( casesFile ) ) { problems.push( ...validateCases( readJson( casesFile ), drawer ).map( p => `cases.json: ${p}` ) ); }
  const adapterSource = readFileSync( adFile, 'utf8' );
  problems.push( ...validateAdapterSource( adapterSource ).map( p => `adapter.mjs: ${p}` ) );
  if ( problems.length ) { throw new Error( `inject-drawer: ${adapterDir} is invalid:\n  ${problems.join( '\n  ' )}` ); }

  let lessons = null;
  if ( existsSync( lessonsFile ) ) {
    const full = readJson( lessonsFile );
    lessons = Object.fromEntries( PUBLIC_LESSON_FIELDS.filter( k => k in full ).map( k => [ k, full[ k ] ] ) );
  }
  const hash = physicsHash( id, { repoRoot: root, adapterDir, lessonsFile } );
  const tokens = opts.tokens || loadTokens();
  const statusAll = opts.status || loadStatusFile( opts.statusFile || ( opts.repoRoot ? path.join( root, 'data', 'verification-status.json' ) : STATUS_FILE ) );
  const status = resolveStatus( statusAll[ id ], hash );
  return {
    data: { simId: id, drawer, lessons, status, hash, layout: drawerLayout( tokens ), css: drawerCss( tokens ) },
    adapterSource
  };
}

/**
 * Inserts (or replaces) the drawer block right before </body>.
 * @param {string} html - a built sim HTML
 * @param {{ id: string, repoRoot?: string, adapterDir?: string, lessonsFile?: string, status?: object,
 *           statusFile?: string, tokens?: any }} opts
 * @returns {string}
 */
export function injectDrawer( html, opts ) {
  if ( !opts || !opts.id ) { throw new Error( 'injectDrawer: opts.id required' ); }
  const clean = html.replace( BLOCK_RE, '' );
  const at = clean.lastIndexOf( '</body>' );
  if ( at < 0 ) { throw new Error( 'inject-drawer: no </body> in the built html' ); }
  const tokens = opts.tokens || loadTokens();
  const { data, adapterSource } = buildDrawerData( opts.id, { ...opts, tokens } );
  const read = f => readFileSync( path.join( DRAWER_DIR, f ), 'utf8' );
  const block = [
    `${DRAWER_MARKER_START} generated by drawer/inject.mjs from theme/tokens.json, drawer/, adapters/${opts.id}/ and data/; do not edit -->`,
    `<style id="bsshs-drawer-tokens">\n${toCssVariables( tokens )}</style>`,
    `<script type="application/json" id="bsshs-drawer-data">${jsonSafe( data )}</script>`,
    `<script id="bsshs-drawer-core">\n${scriptSafe( read( 'core.js' ) )}\n</script>`,
    `<script id="bsshs-drawer-runtime">\n${scriptSafe( read( 'runtime.js' ) )}\n</script>`,
    `<script type="module" id="bsshs-drawer-adapter">\n${scriptSafe( adapterSource )}\n</script>`,
    DRAWER_MARKER_END
  ].join( '\n' );
  return `${clean.slice( 0, at )}${block}\n${clean.slice( at )}`;
}

/**
 * The embedded drawer data of an injected HTML.
 * @param {string} html
 * @returns {any}
 */
export function extractDrawerData( html ) {
  const m = DATA_RE.exec( html );
  if ( !m ) { throw new Error( 'no drawer data in this html' ); }
  return JSON.parse( m[ 2 ] );
}

/**
 * Replaces the embedded drawer data (tests and tools only).
 * @param {string} html
 * @param {any} data
 * @returns {string}
 */
export function replaceDrawerData( html, data ) {
  if ( !DATA_RE.test( html ) ) { throw new Error( 'no drawer data in this html' ); }
  return html.replace( DATA_RE, ( m, a, b, c ) => `${a}${jsonSafe( data )}${c}` );
}
