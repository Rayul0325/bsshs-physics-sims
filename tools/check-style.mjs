#!/usr/bin/env node
// V11: is the inside of ONE built sim painted only with the token palette? (docs/verify.md, spec 5 V11)
//
// Usage: node tools/check-style.mjs <sim.html> [--id <sim id>] [--width 1280] [--height N] [--settle 800]
//                                   [--styles-dir <dir>] [--no-dialogs] [--quiet]
// Opens the sim with a repeatable timeline, visits the home screen and every screen (the same readiness and
// screen selection as check-sim and compare-layout), and on each view looks at three things:
//   (a) the scene graph: fills and strokes outside the palette, gradients, images equal to the original art,
//       nodes painted outside the scene graph that theme/sim-styles/<id>.json did not declare (canvasNodes);
//   (b) the screenshot: the share of pixels outside the palette against tokens sim.check.outsideShareMax;
//   (c) every text against the pixels behind it: contrast below sim.check.minContrast.
// The keyboard-help dialog (every screen) and the preferences dialog (once) are opened when the navigation bar
// has their buttons; their nodes are in the scene graph only while open. Exceptions come from the style file
// and need a reason and approvedBy, at most sim.check.maxExceptions per sim.
// Prints one Korean summary line, then one JSON object (last line). Exit 0 = no open finding, 1 = findings or
// a bad style file, 2 = usage / browser error.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isMain } from './lib/cli.mjs';
import { loadTokens } from '../theme/index.mjs';
import { loadSimStyle, validateSimStyle, SIM_STYLES_DIR } from '../theme/sim-style.mjs';
import { openSim, visitScreens, frames, renderFrozen } from './lib/page-control.mjs';
import { probe, sceneSnapshot, analyzeShot, findDialogButtons, hashPngs, enableInput, closeModals } from './lib/style-page.mjs';
import { findingsOfView, groupFindings, applyExceptions, pixelPalette, textKey, subtractScene } from './lib/style-core.mjs';
import { readManifest } from './lib/manifest.mjs';
import { listTree, readBlob } from './lib/pinned.mjs';
import { pngSize } from '../theme/patches/art.mjs';
import { pool } from './lib/verify-core.mjs';
import { REPO_ROOT } from './lib/paths.mjs';

export const SCHEMA_VERSION = 1;

/** @param {string[]} argv */
export function parseStyleArgs( argv ) {
  const o = { target: null, id: null, width: 1280, height: null, settle: 800, stylesDir: SIM_STYLES_DIR, dialogs: true, quiet: false };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--id' ) ) { o.id = val(); }
    else if ( a.startsWith( '--width' ) ) { o.width = Number( val() ); }
    else if ( a.startsWith( '--height' ) ) { o.height = Number( val() ); }
    else if ( a.startsWith( '--settle' ) ) { o.settle = Number( val() ); }
    else if ( a.startsWith( '--styles-dir' ) ) { o.stylesDir = path.resolve( val() ); }
    else if ( a === '--no-dialogs' ) { o.dialogs = false; }
    else if ( a === '--quiet' ) { o.quiet = true; }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else if ( !o.target ) { o.target = a; }
    else { throw new Error( `unexpected argument ${a}` ); }
  }
  if ( !o.target ) { throw new Error( 'usage: check-style.mjs <sim.html> [--id <sim id>] [--width 1280] [--settle 800]' ); }
  if ( !o.id ) { o.id = path.basename( o.target ).replace( /_ko\.html$/, '' ).replace( /\.html$/, '' ); }
  for ( const k of [ 'width', 'settle' ] ) { if ( !( Number.isFinite( o[ k ] ) && o[ k ] >= 0 ) ) { throw new Error( `--${k} expects a number` ); } }
  return o;
}

/** Dependencies (sibling dir -> SHA) of a sim: the manifest of a PhET sim, the library set of an original sim. @param {string} id */
async function depsOf( id ) {
  const m = await readManifest( id );
  if ( m ) { return m.deps; }
  const f = path.join( REPO_ROOT, 'data', 'build-matrix.new-sims.json' );
  if ( existsSync( f ) ) { const row = ( JSON.parse( readFileSync( f, 'utf8' ) ).sims || [] ).find( r => r.id === id ); if ( row ) { return row.deps; } }
  return null;
}

/**
 * Original pictures of a sim (every PNG in its pinned repos) that match a scene image in size, keyed by byte
 * hash (`b:`) and pixel hash (`p:`, which also catches mipmap levels that chipper re-encoded).
 * @param {import('playwright').Page} page
 * @param {Record<string,string>|null} deps
 * @param {Set<string>} dims - `WxH` of the images seen on screen
 * @returns {Promise<Map<string,string>>}
 */
async function originalArt( page, deps, dims ) {
  const out = new Map();
  if ( !deps || !dims.size ) { return out; }
  const files = [];
  for ( const [ dir, sha ] of Object.entries( deps ) ) {
    for ( const f of await listTree( dir, sha ) ) { if ( /\.png$/.test( f ) && /(^|\/)(images|mipmaps)\//.test( f ) ) { files.push( { dir, sha, f } ); } }
  }
  const blobs = await pool( files, 16, async x => ( { ...x, buf: await readBlob( x.dir, x.sha, x.f ) } ) );
  const candidates = [];
  for ( const b of blobs ) {
    if ( !b.buf ) { continue; }
    out.set( `b:${createHash( 'sha256' ).update( b.buf ).digest( 'hex' )}`, `${b.dir}/${b.f}` );
    let s; try { s = pngSize( b.buf ); } catch { continue; }
    if ( dims.has( `${s.w}x${s.h}` ) ) { candidates.push( { name: `${b.dir}/${b.f}`, b64: b.buf.toString( 'base64' ) } ); }
  }
  for ( let i = 0; i < candidates.length; i += 40 ) {
    for ( const h of await page.evaluate( hashPngs, candidates.slice( i, i + 40 ) ) ) { if ( h.pixelSha ) { out.set( `p:${h.pixelSha}`, h.name ); } }
  }
  return out;
}

/**
 * Checks one sim.
 * @param {ReturnType<typeof parseStyleArgs>} o
 * @param {{ onShot?: (info: { screen: number, dialog?: string, name: string, png: Buffer }) => void }} [hooks]
 * @returns {Promise<object>} report
 */
export async function checkStyle( o, hooks = {} ) {
  if ( !existsSync( o.target ) ) { throw new Error( `no such file: ${o.target}` ); }
  const tokens = loadTokens();
  const style = loadSimStyle( o.id, o.stylesDir );
  const styleProblems = style ? validateSimStyle( style, tokens, o.id ) : [];
  const declared = ( style && style.canvasNodes ) || [];
  const palette = pixelPalette( tokens );
  const { chromium } = await import( 'playwright' );
  const browser = await chromium.launch( { channel: 'chrome', headless: true } );
  /** @type {{ view: { screen: number, dialog?: string }, name: string, raw: any, knownTexts?: Set<string> }[]} */
  const views = [];
  let errors = [];
  let frozen = null;
  const dims = new Set();
  let originals = new Map();
  let screenNames = [];
  try {
    const sim = await openSim( browser, o.target, { width: o.width, height: o.height, settle: o.settle } );
    const { page } = sim;
    errors = sim.errors;
    frozen = sim.frozen;
    const viewport = await page.evaluate( () => ( { w: innerWidth, h: innerHeight, dpr: devicePixelRatio } ) );
    const snap = async ( view, name, baseScene ) => {
      const full = await page.evaluate( probe( sceneSnapshot, { viewW: viewport.w, viewH: viewport.h } ) );
      const png = await page.screenshot( { type: 'png', animations: 'disabled', caret: 'hide' } );
      const scene = baseScene ? subtractScene( full, baseScene ) : full;
      const texts = scene.texts.filter( t => t.fill ).map( t => ( { key: textKey( t ), bounds: t.bounds, fill: t.fill } ) );
      const shot = await page.evaluate( analyzeShot, { png: png.toString( 'base64' ), dpr: viewport.dpr, texts } );
      for ( const im of scene.images ) { if ( im.w && im.h ) { dims.add( `${im.w}x${im.h}` ); } }
      if ( hooks.onShot ) { hooks.onShot( { ...view, name, png } ); }
      views.push( { view, name, raw: { scene, shot } } );
      return full;
    };
    const openDialog = async ( button, screenIndex, base ) => {
      await page.evaluate( enableInput );
      await page.mouse.click( button.bounds[ 0 ] + button.bounds[ 2 ] / 2, button.bounds[ 1 ] + button.bounds[ 3 ] / 2 );
      await page.waitForTimeout( 400 );
      await page.evaluate( renderFrozen );
      await frames( page );
      await snap( { screen: screenIndex, dialog: button.dialog }, `${button.dialog}`, base );
      await page.evaluate( closeModals );
      await page.evaluate( renderFrozen );
      await frames( page );
    };
    let preferencesDone = false;
    const targets = await visitScreens( page, { settle: o.settle }, async t => {
      const base = await snap( { screen: t.index }, t.name === 'null' ? '' : t.name );
      if ( !o.dialogs ) { return; }
      for ( const b of await page.evaluate( probe( findDialogButtons ) ) ) {
        if ( b.dialog === 'preferences' && preferencesDone ) { continue; }
        if ( b.dialog === 'preferences' ) { preferencesDone = true; }
        await openDialog( b, t.index, base );
      }
    } );
    originals = await originalArt( page, await depsOf( o.id ), dims );
    await sim.context.close();
    screenNames = targets.map( t => ( { ...t, name: t.name === 'null' ? '' : t.name } ) );
  }
  finally { await browser.close(); }

  const all = [];
  const perView = [];
  for ( const v of views ) {
    const { findings, stats } = findingsOfView( v.view, { ...v.raw, originals }, tokens, { declaredCanvas: declared, pixelPalette: palette } );
    all.push( ...findings );
    perView.push( { ...v.view, name: v.name, stats } );
  }
  const grouped = groupFindings( all );
  const applied = applyExceptions( grouped, style, tokens );
  const seenCanvas = new Set( views.flatMap( v => v.raw.scene.canvases.map( c => c.node ) ) );
  const counts = {};
  for ( const f of grouped ) { counts[ f.kind ] = ( counts[ f.kind ] || 0 ) + f.count; }
  const problems = [ ...styleProblems, ...applied.problems, ...errors.map( e => `page error: ${e}` ) ];
  const notes = [];
  for ( const d of declared ) { if ( ![ ...seenCanvas ].some( n => n === d || n.endsWith( `.${d}` ) ) ) { notes.push( `canvasNodes ${d} was not seen on any view` ); } }
  if ( frozen === false ) { notes.push( 'the sim clock could not be stopped; screenshots may differ between runs' ); }
  return {
    tool: 'check-style', schemaVersion: SCHEMA_VERSION, target: o.target, id: o.id, width: o.width,
    ok: applied.open.length === 0 && problems.length === 0,
    screens: screenNames, views: perView, counts,
    openFindings: applied.open, excepted: applied.excepted, unusedExceptions: applied.unusedExceptions,
    problems, notes, hasStyleFile: !!style, originalsKnown: originals.size
  };
}

/** One Korean line for people. @param {any} r */
export function summaryLine( r ) {
  const parts = Object.entries( r.counts ).map( ( [ k, n ] ) => `${k} ${n}` ).join( ', ' ) || '없음';
  return `${r.ok ? '통과' : '실패'}  ${r.id}  화면 ${r.screens.length}개, 보기 ${r.views.length}개 — 열린 지적 ${r.openFindings.length}건(그룹), 예외로 넘긴 ${r.excepted.length}건, 종류별 ${parts}${r.problems.length ? `, 문제 ${r.problems.length}건` : ''}`;
}

/** @param {string[]} argv @returns {Promise<number>} */
export async function main( argv ) {
  let o;
  try { o = parseStyleArgs( argv ); }
  catch ( e ) { console.error( e.message ); return 2; }
  let report;
  try { report = await checkStyle( o ); }
  catch ( e ) { console.log( JSON.stringify( { tool: 'check-style', schemaVersion: SCHEMA_VERSION, target: o.target, id: o.id, ok: false, fatal: String( e.message || e ) } ) ); return 2; }
  if ( !o.quiet ) { console.log( summaryLine( report ) ); }
  console.log( JSON.stringify( report ) );
  return report.ok ? 0 : 1;
}

if ( isMain( import.meta.url ) ) { main( process.argv.slice( 2 ) ).then( c => { process.exitCode = c; } ); }
