#!/usr/bin/env node
// V9 layout comparator: is the experiment screen of <a> (drawer injected, closed) pixel-identical to
// <b> (the same build without the drawer)? Uses the same viewport setup as tools/check-sim.mjs
// (installed Chrome; below 600 px the CDP device-metrics emulation with DPR 3 and touch).
//
// Usage: node tools/compare-layout.mjs <a.html> <b.html> [--width 1280] [--height N] [--exclude-button]
//          [--all-screens | --first-screen] [--pause-clock] [--seed-random]
//          [--settle 1500] [--timeout 30000] [--max-diff-pixels 0] [--tolerance 0] [--diff <out.png>]
// --all-screens (default): compares the home screen (when the sim has one) and then every sim screen,
// selected the same way in both builds through joist's own screen property (selectedScreenProperty,
// screenProperty, or showHomeScreenProperty + screenIndexProperty on older joist). --first-screen
// compares only the screen shown after loading (the behaviour before multi-screen support).
// --pause-clock: stops joist's clock (sim.activeProperty) in both builds after the first screen's capture;
// each screen selected afterwards is drawn with a zero time step, so its model shows the state it was built
// in (joist steps only the selected screen) instead of a frame of a running animation that differs by timing.
// --seed-random: replaces Math.random in both pages, before any page script runs, with the same seeded
// generator, for sims that draw random decorations when a view is built (the comparison then sees the
// same decorations in both builds; the drawer itself never calls Math.random).
// --exclude-button skips exactly the drawer's open-button box in <a> (window.bsshsDrawer.buttonRect(),
// rounded outward to whole device pixels, plus a 1-device-pixel anti-aliasing ring) and nothing else.
// Prints one JSON object; exit 0 = identical on every screen (within --max-diff-pixels each),
// 1 = different, 2 = usage/browser error.
import { existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './lib/cli.mjs';

export const SCHEMA_VERSION = 2;

/** @param {string[]} argv */
export function parseCompareArgs( argv ) {
  const o = { a: null, b: null, width: 1280, height: null, excludeButton: false, allScreens: true, pauseClock: false, seedRandom: false, settle: 1500, timeout: 30000, maxDiffPixels: 0, tolerance: 0, diff: null };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--width' ) ) { o.width = Number( val() ); }
    else if ( a.startsWith( '--height' ) ) { o.height = Number( val() ); }
    else if ( a === '--exclude-button' ) { o.excludeButton = true; }
    else if ( a === '--all-screens' ) { o.allScreens = true; }
    else if ( a === '--first-screen' ) { o.allScreens = false; }
    else if ( a === '--pause-clock' ) { o.pauseClock = true; }
    else if ( a === '--seed-random' ) { o.seedRandom = true; }
    else if ( a.startsWith( '--settle' ) ) { o.settle = Number( val() ); }
    else if ( a.startsWith( '--timeout' ) ) { o.timeout = Number( val() ); }
    else if ( a.startsWith( '--max-diff-pixels' ) ) { o.maxDiffPixels = Number( val() ); }
    else if ( a.startsWith( '--tolerance' ) ) { o.tolerance = Number( val() ); }
    else if ( a.startsWith( '--diff' ) ) { o.diff = val(); }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else if ( !o.a ) { o.a = a; }
    else if ( !o.b ) { o.b = a; }
    else { throw new Error( `unexpected argument ${a}` ); }
  }
  if ( !o.a || !o.b ) { throw new Error( 'usage: compare-layout.mjs <a.html> <b.html> [--width 390] [--exclude-button]' ); }
  for ( const k of [ 'width', 'settle', 'timeout', 'maxDiffPixels', 'tolerance' ] ) {
    if ( !( Number.isFinite( o[ k ] ) && o[ k ] >= 0 ) ) { throw new Error( `--${k} expects a number` ); }
  }
  return o;
}

/** Same emulation rule as check-sim. @param {number} width @param {number|null} height */
export function viewportFor( width, height ) {
  const emulated = width < 600;
  const h = height ?? ( emulated ? 844 : 800 );
  return emulated ?
    { viewport: { width, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } :
    { viewport: { width, height: h }, deviceScaleFactor: 1 };
}

/** In-page: the sim is built and the splash is gone (as check-sim's ready probe); the drawer, if any, mounted. */
function pageReady() {
  const sim = window.phet && window.phet.joist && window.phet.joist.sim;
  if ( !sim ) { return false; }
  const display = sim.display || window.phet.joist.display;
  if ( !display || !display.rootNode ) { return false; }
  const cc = sim.isConstructionCompleteProperty || sim._isConstructionCompleteProperty;
  if ( cc && cc.value === false ) { return false; }
  if ( document.querySelector( '[id*="splash"]' ) ) { return false; }
  if ( document.getElementById( 'bsshs-drawer-data' ) && !( window.bsshsDrawer && window.bsshsDrawer.mounted ) ) { return false; }
  return true;
}

/**
 * In-page pixel diff of two PNG data URLs.
 * @param {{ a: string, b: string, rect: {x:number,y:number,w:number,h:number}|null, tolerance: number, wantDiff: boolean }} args
 */
async function pageDiff( { a, b, rect, tolerance, wantDiff } ) {
  const load = src => new Promise( ( res, rej ) => { const im = new Image(); im.onload = () => res( im ); im.onerror = rej; im.src = src; } );
  const [ ia, ib ] = await Promise.all( [ load( a ), load( b ) ] );
  if ( ia.width !== ib.width || ia.height !== ib.height ) { return { sizeMismatch: [ ia.width, ia.height, ib.width, ib.height ] }; }
  const w = ia.width, h = ia.height;
  const px = im => { const c = document.createElement( 'canvas' ); c.width = w; c.height = h; const x = c.getContext( '2d' ); x.drawImage( im, 0, 0 ); return x.getImageData( 0, 0, w, h ); };
  const da = px( ia ).data, db = px( ib ).data;
  const out = wantDiff ? new ImageData( w, h ) : null;
  let diff = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  for ( let y = 0; y < h; y++ ) {
    for ( let x = 0; x < w; x++ ) {
      const i = ( y * w + x ) * 4;
      if ( rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h ) { if ( out ) { out.data[ i + 2 ] = 255; out.data[ i + 3 ] = 80; } continue; }
      const d = Math.max( Math.abs( da[ i ] - db[ i ] ), Math.abs( da[ i + 1 ] - db[ i + 1 ] ), Math.abs( da[ i + 2 ] - db[ i + 2 ] ), Math.abs( da[ i + 3 ] - db[ i + 3 ] ) );
      if ( d > tolerance ) {
        diff++;
        if ( x < minX ) { minX = x; } if ( y < minY ) { minY = y; } if ( x > maxX ) { maxX = x; } if ( y > maxY ) { maxY = y; }
        if ( out ) { out.data[ i ] = 255; out.data[ i + 3 ] = 255; }
      }
    }
  }
  let diffPng = null;
  if ( out ) { const c = document.createElement( 'canvas' ); c.width = w; c.height = h; c.getContext( '2d' ).putImageData( out, 0, 0 ); diffPng = c.toDataURL( 'image/png' ); }
  return { w, h, diff, box: diff ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null, diffPng };
}

/**
 * In-page: the screens to compare, in order: the home screen (if any) as -1, then every sim screen by its
 * index among the non-home screens. Works with or without the drawer (joist generations as in
 * drawer/runtime.js helpers.screen()).
 * @returns {{ index: number, name: string }[]}
 */
function listScreens() {
  const s = window.phet.joist.sim;
  const clean = v => String( v && typeof v === 'object' && 'value' in v ? v.value : v == null ? '' : v ).replace( /[‎‏‪-‮⁦-⁩]/g, '' ).trim();
  const simName = clean( s.simNameProperty !== undefined ? s.simNameProperty : s.name );
  const screens = s.screens.filter( x => x !== s.homeScreen );
  const out = s.homeScreen ? [ { index: -1, name: '홈 화면' } ] : [];
  screens.forEach( ( sc, i ) => out.push( { index: i, name: clean( sc.nameProperty !== undefined ? sc.nameProperty : sc.name ) || simName } ) );
  return out;
}

/** In-page: selects the home screen (-1) or the i-th non-home screen with joist's own property. @param {number} i */
function selectScreen( i ) {
  const s = window.phet.joist.sim;
  const screens = s.screens.filter( x => x !== s.homeScreen );
  const target = i < 0 ? s.homeScreen : screens[ i ];
  if ( !target ) { throw new Error( `no screen ${i}` ); }
  if ( s.selectedScreenProperty ) { s.selectedScreenProperty.value = target; }
  else if ( s.screenProperty ) { s.screenProperty.value = target; }
  else if ( s.screenIndexProperty ) {
    if ( i < 0 ) { s.showHomeScreenProperty.value = true; }
    else {
      s.screenIndexProperty.value = s.screens.indexOf( target );
      if ( s.showHomeScreenProperty ) { s.showHomeScreenProperty.value = false; }
    }
  }
  else { throw new Error( 'unknown joist: no screen property' ); }
}

/**
 * In-page: stops joist's clock (sim.activeProperty) so no model advances any more; false when the sim has
 * no activeProperty. While stopped, renderFrozen() draws a newly selected screen without advancing time.
 */
function pauseClock() {
  const s = window.phet.joist.sim;
  if ( !s.activeProperty ) { return false; }
  s.activeProperty.value = false;
  return true;
}

/** In-page: one display update with dt = 0 (the model does not advance). */
function renderFrozen() {
  const s = window.phet.joist.sim;
  if ( typeof s.stepSimulation === 'function' ) { s.stepSimulation( 0 ); }
  else { const d = s.display || window.phet.joist.display; d.updateDisplay(); }
}

/** In-page init script: Math.random becomes a fixed-seed generator (mulberry32), the same in both builds. */
function seededRandom() {
  let a = 0x2545f491;
  Math.random = () => {
    a = ( a + 0x6d2b79f5 ) | 0;
    let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
    t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
    return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
  };
}

const frames = page => page.evaluate( () => new Promise( r => requestAnimationFrame( () => requestAnimationFrame( r ) ) ) );

/**
 * Loads one page and screenshots the viewport on each screen (or only the first one shown).
 * @returns {Promise<{ shots: { index: number|null, name: string, png: Buffer, button: object|null }[], inner: {w:number,h:number}, errors: string[], paused: boolean|null }>}
 */
async function shoot( browser, file, o ) {
  const context = await browser.newContext( viewportFor( o.width, o.height ) );
  try {
    const page = await context.newPage();
    const errors = [];
    page.on( 'pageerror', e => errors.push( String( e ).slice( 0, 300 ) ) );
    if ( o.seedRandom ) { await page.addInitScript( seededRandom ); }
    await page.goto( pathToFileURL( path.resolve( file ) ).href, { waitUntil: 'load', timeout: o.timeout } );
    await page.waitForFunction( pageReady, null, { timeout: o.timeout, polling: 100 } );
    await frames( page );
    await page.waitForTimeout( o.settle );
    const inner = await page.evaluate( () => ( { w: innerWidth, h: innerHeight } ) );
    const targets = o.allScreens ? await page.evaluate( listScreens ) : [ { index: null, name: '' } ];
    const shots = [];
    let paused = null;
    for ( const t of targets ) {
      if ( t.index !== null ) {
        // --pause-clock: the clock stops before the first switch, so every screen selected afterwards shows
        // its model as built (joist only steps the selected screen's model), identical in both builds.
        if ( o.pauseClock && paused === null ) { paused = await page.evaluate( pauseClock ); }
        await page.evaluate( selectScreen, t.index );
        if ( paused ) { await page.evaluate( renderFrozen ); }
        await frames( page );
        await page.waitForTimeout( o.settle );
        if ( paused ) { await page.evaluate( renderFrozen ); await frames( page ); }
      }
      const button = await page.evaluate( () => ( window.bsshsDrawer && window.bsshsDrawer.buttonRect ? window.bsshsDrawer.buttonRect() : null ) );
      const png = await page.screenshot( { type: 'png', animations: 'disabled', caret: 'hide' } );
      shots.push( { index: t.index, name: t.name, png, button } );
    }
    return { shots, inner, errors, paused };
  }
  finally { await context.close(); }
}

/** The excluded rect (device px) around a's open button. */
function buttonRect( button, dpr ) {
  // The box rounded outward to device pixels, plus ONE device pixel of anti-aliasing around it
  // (edges at fractional positions bleed into the neighbouring pixel).
  const x0 = Math.floor( button.x * dpr ) - 1, y0 = Math.floor( button.y * dpr ) - 1;
  const x1 = Math.ceil( ( button.x + button.width ) * dpr ) + 1, y1 = Math.ceil( ( button.y + button.height ) * dpr ) + 1;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** --diff path for screen k of n (the given path itself when there is one screen). */
const diffPath = ( p, k, n ) => ( n === 1 ? p : p.replace( /(\.png)?$/i, `.screen${k}$1` ) );

/**
 * @param {ReturnType<typeof parseCompareArgs>} o
 * @returns {Promise<object>} report
 */
export async function compareLayout( o ) {
  for ( const f of [ o.a, o.b ] ) { if ( !existsSync( f ) ) { throw new Error( `no such file: ${f}` ); } }
  const { chromium } = await import( 'playwright' );
  const browser = await chromium.launch( { channel: 'chrome', headless: true } );
  try {
    const A = await shoot( browser, o.a, o );
    const B = await shoot( browser, o.b, o );
    if ( A.shots.map( s => s.name ).join( '|' ) !== B.shots.map( s => s.name ).join( '|' ) ) {
      throw new Error( `screens differ: ${A.shots.map( s => s.name ).join( ', ' )} vs ${B.shots.map( s => s.name ).join( ', ' )}` );
    }
    const dpr = viewportFor( o.width, o.height ).deviceScaleFactor;
    const page = await browser.newPage();
    const screens = [];
    for ( let k = 0; k < A.shots.length; k++ ) {
      const a = A.shots[ k ];
      let rect = null;
      if ( o.excludeButton ) {
        if ( !a.button ) { throw new Error( `--exclude-button: no drawer open button in ${o.a}` ); }
        rect = buttonRect( a.button, dpr );
      }
      const d = await page.evaluate( pageDiff, {
        a: `data:image/png;base64,${a.png.toString( 'base64' )}`, b: `data:image/png;base64,${B.shots[ k ].png.toString( 'base64' )}`,
        rect, tolerance: o.tolerance, wantDiff: !!o.diff
      } );
      if ( d.sizeMismatch ) { throw new Error( `screenshot sizes differ on ${a.name || 'the first screen'}: ${d.sizeMismatch.join( ' ' )}` ); }
      const file = o.diff && d.diffPng ? diffPath( o.diff, k, A.shots.length ) : null;
      if ( file ) { writeFileSync( file, Buffer.from( d.diffPng.split( ',' )[ 1 ], 'base64' ) ); }
      screens.push( {
        index: a.index, name: a.name, totalPixels: d.w * d.h, diffPixels: d.diff, diffBox: d.box,
        // Screenshot fingerprint of <a>: distinct screens must give distinct images (proves the switch rendered).
        shotSha1: createHash( 'sha1' ).update( a.png ).digest( 'hex' ),
        excluded: rect ? { x: a.button.x, y: a.button.y, width: a.button.width, height: a.button.height, devicePixels: rect } : null,
        ok: d.diff <= o.maxDiffPixels, diffImage: file
      } );
    }
    const s0 = screens[ 0 ];
    return {
      tool: 'compare-layout', schemaVersion: SCHEMA_VERSION, a: o.a, b: o.b,
      viewport: { requestedWidth: o.width, emulated: o.width < 600, dpr, innerWidth: A.inner.w, innerHeight: A.inner.h },
      allScreens: o.allScreens, pauseClock: o.pauseClock ? { a: A.paused, b: B.paused } : false, seedRandom: o.seedRandom,
      // First-screen fields as before (backward compatible), totals over every screen.
      excluded: s0.excluded,
      tolerance: o.tolerance, totalPixels: screens.reduce( ( n, s ) => n + s.totalPixels, 0 ),
      diffPixels: screens.reduce( ( n, s ) => n + s.diffPixels, 0 ), diffBox: s0.diffBox,
      screens,
      errors: { a: A.errors, b: B.errors },
      ok: screens.every( s => s.ok ) && !A.errors.length && !B.errors.length,
      diffImage: o.diff ? ( screens.length === 1 ? o.diff : screens.map( s => s.diffImage ) ) : null
    };
  }
  finally { await browser.close(); }
}

/** @param {string[]} argv @returns {Promise<number>} */
export async function main( argv ) {
  let o;
  try { o = parseCompareArgs( argv ); }
  catch ( e ) { console.error( e.message ); return 2; }
  try {
    const r = await compareLayout( o );
    console.log( JSON.stringify( r, null, 2 ) );
    return r.ok ? 0 : 1;
  }
  catch ( e ) {
    console.log( JSON.stringify( { tool: 'compare-layout', schemaVersion: SCHEMA_VERSION, a: o.a, b: o.b, ok: false, fatal: String( e.message || e ) } ) );
    return 2;
  }
}

if ( isMain( import.meta.url ) ) { main( process.argv.slice( 2 ) ).then( c => { process.exitCode = c; } ); }
