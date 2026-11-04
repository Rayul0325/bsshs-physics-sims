#!/usr/bin/env node
// V3 physics check runner: for every case in adapters/<id>/cases.json, load the injected sim headless
// (same viewport setup as tools/check-sim.mjs), put the model into the case's state through the
// adapter (bsshsDrawer.apply(params)), wait until the expected quantities stop changing, read them
// (bsshsDrawer.read()) and compare with `expect`.
//
// Usage: node tools/run-cases.mjs <injected.html> <sim id> [--width W] [--height H]
//          [--cases <file> | --adapter-dir <dir>] [--rel-tol 0.01] [--abs-tol 1e-9]
//          [--settle 300] [--settle-timeout 5000] [--timeout 30000]
// Tolerances (drawer/core.js checkExpect): expected value ≠ 0 → |actual − value| ≤ relTol·|value|, relTol =
// the case's relTol, else --rel-tol (default 1%). Expected value 0 → |actual| ≤ --abs-tol (default 1e-9).
// Every case starts from a freshly loaded page, so cases never depend on each other.
// Output: one JSON line per case ({"type":"case",...}), then one {"type":"summary",...} line.
// Exit 0 = every case passed, 1 = a case failed (or did not run), 2 = usage / file / browser error.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './lib/cli.mjs';
import { viewportFor } from './compare-layout.mjs';
import { extractDrawerData, validateCases } from '../drawer/inject.mjs';
import { REPO_ROOT } from '../drawer/hash.mjs';
import '../drawer/core.js';

export const SCHEMA_VERSION = 1;
const C = globalThis.BsshsDrawerCore;

/** @param {string[]} argv */
export function parseRunArgs( argv ) {
  const o = { html: null, id: null, width: 1280, height: null, cases: null, adapterDir: null,
              relTol: C.DEFAULT_REL_TOL, absTol: C.DEFAULT_ABS_TOL, settle: 300, settleTimeout: 5000, timeout: 30000 };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--width' ) ) { o.width = Number( val() ); }
    else if ( a.startsWith( '--height' ) ) { o.height = Number( val() ); }
    else if ( a.startsWith( '--cases' ) ) { o.cases = val(); }
    else if ( a.startsWith( '--adapter-dir' ) ) { o.adapterDir = val(); }
    else if ( a.startsWith( '--rel-tol' ) ) { o.relTol = Number( val() ); }
    else if ( a.startsWith( '--abs-tol' ) ) { o.absTol = Number( val() ); }
    else if ( a.startsWith( '--settle-timeout' ) ) { o.settleTimeout = Number( val() ); }
    else if ( a.startsWith( '--settle' ) ) { o.settle = Number( val() ); }
    else if ( a.startsWith( '--timeout' ) ) { o.timeout = Number( val() ); }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else if ( !o.html ) { o.html = a; }
    else if ( !o.id ) { o.id = a; }
    else { throw new Error( `unexpected argument ${a}` ); }
  }
  if ( !o.html || !o.id ) { throw new Error( 'usage: run-cases.mjs <injected.html> <sim id> [--width W] [--cases file | --adapter-dir dir] [--rel-tol 0.01] [--abs-tol 1e-9]' ); }
  for ( const k of [ 'width', 'relTol', 'absTol', 'settle', 'settleTimeout', 'timeout' ] ) {
    if ( !( Number.isFinite( o[ k ] ) && o[ k ] >= 0 ) ) { throw new Error( `--${k} expects a number ≥ 0` ); }
  }
  return o;
}

/** @param {import('playwright').Page} page @param {string} url @param {number} timeout */
async function loadFresh( page, url, timeout ) {
  await page.goto( url, { waitUntil: 'load', timeout } );
  await page.waitForFunction( () => window.bsshsDrawer && window.bsshsDrawer.mounted && window.bsshsDrawer.adapterRegistered,
    null, { timeout, polling: 100 } );
}

/**
 * Polls read() until the expected keys hold the same values for 3 reads in a row (100 ms apart).
 * @returns {Promise<{ values: Record<string, number|null>, settled: boolean }>}
 */
async function settle( page, keys, o ) {
  await page.waitForTimeout( o.settle );
  const t0 = Date.now();
  let last = null;
  let same = 0;
  let values = await page.evaluate( () => window.bsshsDrawer.read() );
  while ( Date.now() - t0 < o.settleTimeout ) {
    const sig = JSON.stringify( keys.map( k => values[ k ] ) );
    same = sig === last ? same + 1 : 0;
    last = sig;
    if ( same >= 2 ) { return { values, settled: true }; }
    await page.waitForTimeout( 100 );
    values = await page.evaluate( () => window.bsshsDrawer.read() );
  }
  return { values, settled: false };
}

/**
 * Runs every case; calls `emit` with each case line.
 * @param {ReturnType<typeof parseRunArgs>} o
 * @param {(line: object) => void} emit
 * @returns {Promise<object>} summary line
 */
export async function runCases( o, emit ) {
  if ( !existsSync( o.html ) ) { throw new Error( `no such file: ${o.html}` ); }
  const data = extractDrawerData( readFileSync( o.html, 'utf8' ) );
  if ( data.simId !== o.id ) { throw new Error( `${o.html} carries the drawer of ${data.simId}, not ${o.id}` ); }
  const casesFile = path.resolve( o.cases || path.join( o.adapterDir || path.join( REPO_ROOT, 'adapters', o.id ), 'cases.json' ) );
  if ( !existsSync( casesFile ) ) { throw new Error( `no cases file: ${casesFile}` ); }
  const cases = JSON.parse( readFileSync( casesFile, 'utf8' ) );
  const problems = validateCases( cases, data.drawer );
  if ( problems.length ) { throw new Error( `invalid ${casesFile}:\n  ${problems.join( '\n  ' )}` ); }

  const { chromium } = await import( 'playwright' );
  const browser = await chromium.launch( { channel: 'chrome', headless: true } );
  const url = pathToFileURL( path.resolve( o.html ) ).href;
  let passed = 0;
  let viewport = null;
  try {
    const context = await browser.newContext( viewportFor( o.width, o.height ) );
    const page = await context.newPage();
    const pageErrors = [];
    page.on( 'pageerror', e => pageErrors.push( String( e ).slice( 0, 300 ) ) );
    for ( const c of cases ) {
      const t0 = Date.now();
      const line = { type: 'case', name: c.name, ok: false, settled: false, params: c.params, results: [], error: null, ms: 0 };
      try {
        await loadFresh( page, url, o.timeout );
        viewport = viewport || await page.evaluate( () => ( { innerWidth, innerHeight } ) );
        await page.evaluate( p => window.bsshsDrawer.apply( p ), c.params );
        const keys = Object.keys( c.expect );
        const { values, settled } = await settle( page, keys, o );
        line.settled = settled;
        line.screen = await page.evaluate( () => window.bsshsDrawer.screenName() );
        line.results = C.checkExpect( c.expect, values, { relTol: o.relTol, absTol: o.absTol } );
        line.ok = line.results.every( r => r.ok );
      }
      catch ( e ) { line.error = String( e.message || e ).split( '\n' )[ 0 ].slice( 0, 300 ); }
      if ( pageErrors.length ) { line.pageErrors = pageErrors.splice( 0 ); line.ok = false; }
      line.ms = Date.now() - t0;
      if ( line.ok ) { passed++; }
      emit( line );
    }
    await context.close();
  }
  finally { await browser.close(); }
  return {
    type: 'summary', tool: 'run-cases', schemaVersion: SCHEMA_VERSION, target: o.html, simId: o.id, cases: casesFile,
    viewport: { requestedWidth: o.width, emulated: o.width < 600, ...viewport },
    tolerance: { relTol: o.relTol, absTol: o.absTol },
    ok: passed === cases.length, passed, failed: cases.length - passed
  };
}

/** @param {string[]} argv @returns {Promise<number>} */
export async function main( argv ) {
  let o;
  try { o = parseRunArgs( argv ); }
  catch ( e ) { console.error( e.message ); return 2; }
  try {
    const summary = await runCases( o, line => console.log( JSON.stringify( line ) ) );
    console.log( JSON.stringify( summary ) );
    return summary.ok ? 0 : 1;
  }
  catch ( e ) {
    console.log( JSON.stringify( { type: 'summary', tool: 'run-cases', schemaVersion: SCHEMA_VERSION, target: o.html, simId: o.id, ok: false, fatal: String( e.message || e ) } ) );
    return 2;
  }
}

if ( isMain( import.meta.url ) ) { main( process.argv.slice( 2 ) ).then( c => { process.exitCode = c; } ); }
