#!/usr/bin/env node
// Headless check of ONE built sim (installed Google Chrome via Playwright, channel 'chrome').
//
// Usage: node tools/check-sim.mjs <sim.html | http(s)://url> [--width 390] [--height N] [--timeout 10000]
//                                [--settle 2000] [--shots <dir>] [--no-about] [--quiet]
//        node tools/check-sim.mjs --refresh-logo-fingerprints
// Prints ONE JSON object (format: docs/theme.md "check-sim JSON", schema version 1) and exits
// 0 = every check passed, 1 = a check failed, 2 = usage / browser error.
//
// Widths below 500 px cannot be reached with a headless window, so the viewport is emulated through
// Playwright's CDP device-metrics override (Emulation.setDeviceMetricsOverride); `viewport.innerWidth`
// in the output shows what the page actually got.
import { readFileSync, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './lib/cli.mjs';
import { loadFingerprints, refreshFingerprints } from './lib/phet-logos.mjs';
import { WORDMARK, REQUIRED_ABOUT_STRINGS } from '../brand/bsshs/attribution.mjs';

export const SCHEMA_VERSION = 1;
const ABOUT_LABELS = [ '개요', 'About' ]; // joist menuItem.about in ko / en

/**
 * @param {string[]} argv
 * @returns {{ target: string|null, width: number|null, height: number|null, timeout: number, settle: number,
 *             shots: string|null, about: boolean, quiet: boolean, refresh: boolean }}
 */
export function parseCheckArgs( argv ) {
  const o = { target: null, width: null, height: null, timeout: 10000, settle: 2000, shots: null, about: true, quiet: false, refresh: false };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--width' ) ) { o.width = Number( val() ); }
    else if ( a.startsWith( '--height' ) ) { o.height = Number( val() ); }
    else if ( a.startsWith( '--timeout' ) ) { o.timeout = Number( val() ); }
    else if ( a.startsWith( '--settle' ) ) { o.settle = Number( val() ); }
    else if ( a.startsWith( '--shots' ) ) { o.shots = val(); }
    else if ( a === '--no-about' ) { o.about = false; }
    else if ( a === '--quiet' ) { o.quiet = true; }
    else if ( a === '--refresh-logo-fingerprints' ) { o.refresh = true; }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else if ( !o.target ) { o.target = a; }
    else { throw new Error( `unexpected argument ${a}` ); }
  }
  for ( const k of [ 'width', 'height', 'timeout', 'settle' ] ) {
    if ( o[ k ] !== null && !( Number.isFinite( o[ k ] ) && o[ k ] >= 0 ) ) { throw new Error( `--${k} expects a number` ); }
  }
  return o;
}

/**
 * Classifies a request URL against the page URL.
 * file:// pages: any http(s)/ws(s) request is external. http(s) pages: a different origin is external.
 * @param {string} url
 * @param {string} pageUrl
 * @returns {'local'|'same-origin'|'external'}
 */
export function classifyRequest( url, pageUrl ) {
  let u;
  try { u = new URL( url ); } catch { return 'external'; }
  if ( [ 'data:', 'blob:', 'about:', 'javascript:' ].includes( u.protocol ) ) { return 'local'; }
  const p = new URL( pageUrl );
  if ( p.protocol === 'file:' ) { return u.protocol === 'file:' ? 'same-origin' : 'external'; }
  return u.origin === p.origin ? 'same-origin' : 'external';
}

/** @param {string} html @param {{ path: string, base64Slice: string }[]} fps */
export function staticLogoHits( html, fps ) {
  return fps.filter( f => html.includes( f.base64Slice ) ).map( f => f.path );
}

/** Strips bidi embedding marks that PhET wraps around every translated string. @param {string} s */
export const plain = s => String( s ).replace( /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '' );
/** @param {string} s */
const squash = s => plain( s ).replace( /\s+/g, '' );

/**
 * Which required attribution strings are missing from the collected texts (whitespace-insensitive,
 * because wrapped RichText may split a line across several text nodes).
 * @param {string[]} texts
 * @returns {string[]}
 */
export function missingAttribution( texts ) {
  const all = squash( texts.join( '' ) );
  return REQUIRED_ABOUT_STRINGS.filter( s => !all.includes( squash( s ) ) );
}

/**
 * User-perceivable texts (accessible names, PDOM text, visible labels) that still name PhET, after
 * removing the About attribution strings (the only place the spec allows the PhET name).
 * "PhET-iO" internals never reach these sources in a non-PhET-iO build, so any hit counts.
 * @param {{ where: string, text: string }[]} entries
 * @returns {{ where: string, text: string }[]}
 */
export function phetMentions( entries ) {
  const hits = [];
  const seen = new Set();
  // SVG text uses no-break spaces, and wrapped About lines arrive as fragments of an attribution string.
  const norm = s => plain( s ).replace( /[\s\u00A0]+/g, ' ' ).trim();
  const allowed = REQUIRED_ABOUT_STRINGS.map( norm );
  for ( const e of entries ) {
    let t = norm( e.text );
    if ( t.length >= 15 && allowed.some( a => a.includes( t ) ) ) { continue; } // a wrapped attribution line
    for ( const s of allowed ) { t = t.split( s ).join( '' ); }
    if ( /PhET/.test( t ) ) {
      const key = `${e.where}|${t}`;
      if ( !seen.has( key ) ) { seen.add( key ); hits.push( { where: e.where, text: plain( e.text ).slice( 0, 200 ) } ); }
    }
  }
  return hits;
}

// ---- in-page probes (serialised into the page; must not use Node APIs) ----

/**
 * Collects what a user or a screen reader can perceive outside the canvas pixels: every DOM text node
 * and naming attribute (the scenery PDOM is plain DOM), plus the accessible/voicing strings of visible
 * scenery nodes.
 * @returns {{ where: string, text: string }[]}
 */
function pageA11yProbe() {
  const out = [];
  const ATTRS = [ 'aria-label', 'aria-roledescription', 'aria-valuetext', 'aria-description', 'title', 'alt', 'placeholder' ];
  const walker = document.createTreeWalker( document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT );
  for ( let n = walker.currentNode; n; n = walker.nextNode() ) {
    if ( n.nodeType === Node.TEXT_NODE ) {
      const p = n.parentElement;
      if ( p && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test( p.tagName ) && n.nodeValue.trim() ) { out.push( { where: `dom-text <${p.tagName.toLowerCase()}>`, text: n.nodeValue } ); }
    }
    else {
      for ( const a of ATTRS ) {
        const v = n.getAttribute( a );
        if ( v && v.trim() ) { out.push( { where: `dom @${a} <${n.tagName.toLowerCase()}>`, text: v } ); }
      }
    }
  }
  const PROPS = [ 'accessibleName', 'labelContent', 'innerContent', 'descriptionContent', 'helpText', 'accessibleHelpText',
                  'accessibleParagraph', 'accessibleHeading', 'voicingNameResponse', 'voicingObjectResponse',
                  'voicingContextResponse', 'voicingHintResponse' ];
  const sim = window.phet.joist.sim;
  const display = sim.display || window.phet.joist.display;
  const stack = [ display.rootNode ];
  const seen = new Set();
  while ( stack.length ) {
    const n = stack.pop();
    if ( !n || seen.has( n ) ) { continue; }
    seen.add( n );
    try { if ( n.visible === false ) { continue; } } catch { /* ignore */ }
    for ( const k of PROPS ) {
      let v = null;
      try { v = n[ k ]; } catch { v = null; }
      if ( v && typeof v === 'object' && typeof v.value === 'string' ) { v = v.value; }
      if ( typeof v === 'string' && v.trim() ) { out.push( { where: `scenery ${k}`, text: v } ); }
    }
    for ( const c of ( n._children || n.children || [] ) ) { stack.push( c ); }
  }
  return out;
}


/** Waits for a running sim. Returns a short status object. */
function pageReadyProbe() {
  const sim = window.phet && window.phet.joist && window.phet.joist.sim;
  if ( !sim ) { return { ready: false, why: 'no phet.joist.sim' }; }
  const display = sim.display || ( window.phet.joist.display );
  if ( !display || !display.rootNode ) { return { ready: false, why: 'no display' }; }
  const cc = sim.isConstructionCompleteProperty || sim._isConstructionCompleteProperty;
  if ( cc && cc.value === false ) { return { ready: false, why: 'construction not complete' }; }
  if ( document.querySelector( '[id*="splash"]' ) ) { return { ready: false, why: 'splash still shown' }; }
  return { ready: true };
}

/**
 * Walks the visible scenery tree and reports images, text leaves (with global bounds) and fonts.
 * @returns {{ images: object[], texts: object[], fonts: object|null, innerWidth: number, innerHeight: number,
 *             meta: Record<string,string> }}
 */
function pageSceneProbe() {
  const sim = window.phet.joist.sim;
  const display = sim.display || window.phet.joist.display;
  const images = [];
  const texts = [];
  const bounds = n => {
    try {
      const b = n.globalBounds || n.getGlobalBounds();
      return b && Number.isFinite( b.minX ) ? { x: b.minX, y: b.minY, w: b.width, h: b.height } : null;
    }
    catch { return null; }
  };
  const textOf = n => {
    for ( const k of [ 'renderedText', '_renderedText', 'text', '_text', 'string' ] ) {
      try { if ( typeof n[ k ] === 'string' ) { return n[ k ]; } } catch { /* getter may throw */ }
    }
    return null;
  };
  window.__bsshsImages = [];
  const stack = [ display.rootNode ];
  const seen = new Set();
  while ( stack.length ) {
    const n = stack.pop();
    if ( !n || seen.has( n ) ) { continue; }
    seen.add( n );
    let visible = true;
    try { visible = n.visible !== false && ( n.opacity === undefined || n.opacity > 0 ); } catch { visible = true; }
    if ( !visible ) { continue; }
    const kids = n._children || n.children || [];
    // Plain images keep an HTMLImageElement in _image; old (RequireJS) builds use mipmaps (_mipmapData).
    const img = n._image && typeof n._image.src === 'string' ? n._image :
                n._mipmapData && n._mipmapData[ 0 ] && ( n._mipmapData[ 0 ].img || n._mipmapData[ 0 ].canvas ) || null;
    if ( img ) {
      images.push( { src: typeof img.src === 'string' ? img.src : null, bounds: bounds( n ), mipmap: !n._image, index: images.length } );
      ( window.__bsshsImages = window.__bsshsImages || [] )[ images.length - 1 ] = img;
    }
    if ( !kids.length ) {
      const t = textOf( n );
      if ( t && t.trim() ) { texts.push( { text: t, bounds: bounds( n ) } ); }
    }
    for ( const k of kids ) { stack.push( k ); }
  }
  const meta = {};
  for ( const m of document.querySelectorAll( 'meta[name^="bsshs-"]' ) ) { meta[ m.getAttribute( 'name' ) ] = m.getAttribute( 'content' ); }
  let fonts = null;
  if ( window.bsshsFonts ) {
    fonts = { ...window.bsshsFonts, check: window.bsshsFonts.families.map( f => document.fonts.check( `16px "${f}"` ) ) };
  }
  return { images, texts, fonts, innerWidth: window.innerWidth, innerHeight: window.innerHeight, meta };
}

/**
 * Indexes of probed images whose pixels equal one of the expected wordmark PNGs (any channel within 8,
 * on at least 99% of pixels; re-encoding is lossless but premultiplied alpha may round).
 * @param {string[]} expectedB64
 * @returns {Promise<number[]>}
 */
async function pagePixelMatch( expectedB64 ) {
  const load = b64 => new Promise( ( res, rej ) => { const i = new Image(); i.onload = () => res( i ); i.onerror = rej; i.src = `data:image/png;base64,${b64}`; } );
  const pixels = el => {
    const w = el.naturalWidth || el.width;
    const h = el.naturalHeight || el.height;
    const c = document.createElement( 'canvas' );
    c.width = w; c.height = h;
    const ctx = c.getContext( '2d' );
    ctx.drawImage( el, 0, 0 );
    return { w, h, d: ctx.getImageData( 0, 0, w, h ).data };
  };
  const expected = ( await Promise.all( expectedB64.map( load ) ) ).map( pixels );
  const hits = [];
  ( window.__bsshsImages || [] ).forEach( ( el, idx ) => {
    let p;
    try { p = pixels( el ); } catch { return; }
    for ( const e of expected ) {
      if ( e.w !== p.w || e.h !== p.h ) { continue; }
      let bad = 0;
      for ( let i = 0; i < e.d.length; i += 4 ) {
        if ( Math.max( Math.abs( e.d[ i ] - p.d[ i ] ), Math.abs( e.d[ i + 1 ] - p.d[ i + 1 ] ), Math.abs( e.d[ i + 2 ] - p.d[ i + 2 ] ), Math.abs( e.d[ i + 3 ] - p.d[ i + 3 ] ) ) > 8 ) { bad++; }
      }
      if ( bad <= e.d.length / 4 * 0.01 ) { hits.push( idx ); return; }
    }
  } );
  return hits;
}

/** Navigates to the first screen (leaves the home screen), for screenshots. */
function pageGoToFirstScreen() {
  const sim = window.phet.joist.sim;
  try {
    const screenProperty = sim.selectedScreenProperty || sim.screenProperty;
    if ( sim.screens && screenProperty && sim.homeScreen ) {
      const first = ( sim.simScreens || sim.screens ).find( s => s !== sim.homeScreen );
      if ( first ) { screenProperty.value = first; return true; }
    }
    if ( sim.showHomeScreenProperty && sim.homeScreen ) {
      if ( sim.screenIndexProperty ) { sim.screenIndexProperty.value = 0; }
      sim.showHomeScreenProperty.value = false;
      return true;
    }
  }
  catch ( e ) { return String( e ); }
  return false;
}

// ---- runner ----

/** @param {string} src - data: URL @returns {string|null} sha256 of the bytes */
function dataUrlSha( src ) {
  const m = /^data:[^;,]+;base64,(.*)$/s.exec( src );
  return m ? createHash( 'sha256' ).update( Buffer.from( m[ 1 ], 'base64' ) ).digest( 'hex' ) : null;
}

/** @param {{x:number,y:number,w:number,h:number}} b */
const center = b => ( { x: b.x + b.w / 2, y: b.y + b.h / 2 } );

/**
 * Runs every check on one sim.
 * @param {ReturnType<typeof parseCheckArgs>} o
 * @returns {Promise<object>} the JSON report
 */
export async function checkSim( o ) {
  const isUrl = /^https?:\/\//.test( o.target );
  const file = isUrl ? null : path.resolve( o.target );
  if ( file && !existsSync( file ) ) { throw new Error( `no such file: ${file}` ); }
  const url = isUrl ? o.target : pathToFileURL( file ).href;
  const html = file ? readFileSync( file, 'utf8' ) : null;
  const fps = loadFingerprints();
  const phetLogoShas = new Set( fps.map( f => f.sha256 ) );

  const report = {
    tool: 'check-sim', schemaVersion: SCHEMA_VERSION, target: o.target, url,
    viewport: { requestedWidth: o.width, emulated: o.width !== null, innerWidth: null, innerHeight: null },
    ok: false,
    checks: {
      ready: { ok: false, ms: null, detail: null },
      errors: { ok: false, uncaught: [], console: [] },
      wordmark: { ok: false, method: 'scenery-image-sha256', expected: WORDMARK, markerSha256: [], visibleMatches: 0 },
      phetLogo: { ok: false, staticHits: [], displayedHits: [], displayedImages: 0 },
      about: { ok: false, method: 'menu-click', opened: false, missing: [ ...REQUIRED_ABOUT_STRINGS ] },
      network: { ok: false, requests: [], external: [] },
      fonts: { ok: true, applicable: false, families: [], loaded: null, readyBeforeSim: null },
      phetName: { ok: false, method: 'pdom-and-accessible-names', scanned: 0, hits: [] }
    },
    screenshots: []
  };
  const c = report.checks;
  if ( html ) { c.phetLogo.staticHits = staticLogoHits( html, fps ); }

  const { chromium } = await import( 'playwright' );
  const browser = await chromium.launch( { channel: 'chrome', headless: true } );
  try {
    const w = o.width ?? 1280;
    const h = o.height ?? ( o.width !== null && o.width < 600 ? 844 : 800 );
    const context = await browser.newContext( o.width !== null && o.width < 600 ?
      { viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } :
      { viewport: { width: w, height: h } } );
    const page = await context.newPage();
    page.on( 'request', req => {
      const kind = classifyRequest( req.url(), url );
      const entry = { url: req.url().slice( 0, 300 ), type: req.resourceType(), kind };
      if ( kind !== 'local' ) { c.network.requests.push( entry ); }
      if ( kind === 'external' ) { c.network.external.push( entry ); }
    } );
    page.on( 'websocket', ws => {
      const entry = { url: ws.url().slice( 0, 300 ), type: 'websocket', kind: classifyRequest( ws.url().replace( /^ws/, 'http' ), url ) };
      c.network.requests.push( entry );
      if ( entry.kind === 'external' ) { c.network.external.push( entry ); }
    } );
    page.on( 'pageerror', e => c.errors.uncaught.push( String( e && e.stack || e ).slice( 0, 800 ) ) );
    page.on( 'console', m => { if ( m.type() === 'error' ) { c.errors.console.push( m.text().slice( 0, 400 ) ); } } );

    const t0 = Date.now();
    await page.goto( url, { waitUntil: 'load', timeout: o.timeout } );
    let last = null;
    while ( Date.now() - t0 < o.timeout ) {
      last = await page.evaluate( pageReadyProbe ).catch( e => ( { ready: false, why: String( e ) } ) );
      if ( last.ready ) { break; }
      await page.waitForTimeout( 100 );
    }
    c.ready.ok = !!( last && last.ready );
    c.ready.ms = Date.now() - t0;
    c.ready.detail = last && last.why || null;
    if ( c.ready.ok ) {
      await page.evaluate( () => new Promise( r => requestAnimationFrame( () => requestAnimationFrame( r ) ) ) );
      await page.waitForTimeout( Math.min( 1000, o.settle ) );
      const shotBase = o.shots ? path.join( o.shots, path.basename( o.target ).replace( /\.html$/, '' ) ) : null;
      if ( shotBase ) { await mkdir( o.shots, { recursive: true } ); }
      const shoot = async tag => {
        if ( !shotBase ) { return; }
        const p = `${shotBase}-${o.width ?? 'desktop'}-${tag}.png`;
        await page.screenshot( { path: p } );
        report.screenshots.push( p );
      };
      await shoot( 'home' );
      const sweep = async () => {
        const entries = await page.evaluate( pageA11yProbe );
        c.phetName.scanned += entries.length;
        for ( const h of phetMentions( entries ) ) {
          if ( !c.phetName.hits.some( x => x.where === h.where && x.text === h.text ) ) { c.phetName.hits.push( h ); }
        }
      };
      await sweep();
      if ( shotBase ) {
        // First experiment screen (sims with a home screen), before any dialog is opened.
        const moved = await page.evaluate( pageGoToFirstScreen ).catch( () => false );
        if ( moved === true ) { await page.waitForTimeout( 800 ); await shoot( 'screen1' ); }
      }

      let scene = await page.evaluate( pageSceneProbe );
      report.viewport.innerWidth = scene.innerWidth;
      report.viewport.innerHeight = scene.innerHeight;
      c.wordmark.markerSha256 = ( scene.meta[ 'bsshs-wordmark-sha256' ] || '' ).split( ',' ).filter( Boolean );
      const marker = new Set( c.wordmark.markerSha256 );
      const imgs = scene.images.map( im => ( { ...im, sha: im.src ? dataUrlSha( im.src ) : null } ) );
      c.phetLogo.displayedImages = imgs.length;
      c.phetLogo.displayedHits = imgs.filter( im => im.sha && phetLogoShas.has( im.sha ) ).map( im => im.sha );
      let wm = imgs.filter( im => im.sha && marker.has( im.sha ) && im.bounds && im.bounds.w > 0 );
      const expectedPng = ( scene.meta[ 'bsshs-wordmark-png' ] || '' ).split( ',' ).filter( Boolean );
      if ( !wm.length && expectedPng.length ) {
        const hits = new Set( await page.evaluate( pagePixelMatch, expectedPng ) );
        wm = imgs.filter( im => hits.has( im.index ) && im.bounds && im.bounds.w > 0 );
        c.wordmark.method = 'scenery-image-pixels';
      }
      c.wordmark.visibleMatches = wm.length;
      c.wordmark.ok = wm.length > 0;
      if ( scene.fonts ) {
        c.fonts.applicable = true;
        c.fonts.families = scene.fonts.families;
        c.fonts.loaded = scene.fonts.loaded && scene.fonts.check.every( Boolean );
        c.fonts.readyBeforeSim = scene.fonts.readyBeforeSim;
        c.fonts.ok = !!c.fonts.loaded;
      }

      if ( o.about && wm.length ) {
        // Open the PhET menu by clicking the wordmark button, then its About item.
        const key = t => `${t.text}|${t.bounds ? `${Math.round( t.bounds.x )},${Math.round( t.bounds.y )}` : ''}`;
        const before = new Set( scene.texts.map( key ) );
        const p1 = center( wm[ 0 ].bounds );
        await page.mouse.click( p1.x, p1.y );
        await page.waitForTimeout( 500 );
        scene = await page.evaluate( pageSceneProbe );
        await sweep(); // with the menu open
        const item = scene.texts.find( t => ABOUT_LABELS.includes( plain( t.text ).trim() ) && t.bounds && t.bounds.w > 0 );
        if ( item ) {
          const p2 = center( item.bounds );
          await page.mouse.click( p2.x, p2.y );
          await page.waitForTimeout( 800 );
          scene = await page.evaluate( pageSceneProbe );
          c.about.opened = true;
          // Only text that appeared with the dialog, in reading order (top-to-bottom, left-to-right),
          // so wrapped lines join back up without sim labels in between.
          const ordered = scene.texts.filter( t => t.bounds && !before.has( key( t ) ) ).sort( ( a, b ) =>
            ( Math.abs( a.bounds.y - b.bounds.y ) > 2 ? a.bounds.y - b.bounds.y : a.bounds.x - b.bounds.x ) );
          c.about.missing = missingAttribution( ordered.map( t => t.text ) );
          c.about.ok = c.about.missing.length === 0;
          await shoot( 'about' );
          await sweep(); // with the menu and the About dialog open
          await page.keyboard.press( 'Escape' ).catch( () => {} );
          await page.waitForTimeout( 200 );
        }
        else {
          c.about.detail = `menu item ${ABOUT_LABELS.join( '/' )} not found after clicking the wordmark`;
        }
      }
      else if ( !o.about ) {
        c.about = { ok: true, method: 'skipped', opened: false, missing: [] };
      }

      await page.waitForTimeout( Math.max( 0, o.settle - 1000 ) );
    }
    await context.close();
  }
  finally {
    await browser.close();
  }
  c.errors.ok = c.errors.uncaught.length === 0;
  c.phetName.ok = c.ready.ok && c.phetName.scanned > 0 && c.phetName.hits.length === 0;
  c.network.ok = c.network.external.length === 0;
  c.phetLogo.ok = c.phetLogo.staticHits.length === 0 && c.phetLogo.displayedHits.length === 0 && c.ready.ok;
  report.ok = Object.values( c ).every( x => x.ok );
  return report;
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main( argv ) {
  let o;
  try {
    o = parseCheckArgs( argv );
    if ( o.refresh ) { console.log( `wrote ${await refreshFingerprints()} fingerprints` ); return 0; }
    if ( !o.target ) { throw new Error( 'usage: check-sim.mjs <sim.html|url> [--width 390] [--timeout 10000] [--shots dir] [--no-about]' ); }
  }
  catch ( e ) { console.error( e.message ); return 2; }
  let report;
  try { report = await checkSim( o ); }
  catch ( e ) { console.log( JSON.stringify( { tool: 'check-sim', schemaVersion: SCHEMA_VERSION, target: o.target, ok: false, fatal: String( e.message || e ) } ) ); return 2; }
  console.log( JSON.stringify( report, null, o.quiet ? 0 : 2 ) );
  return report.ok ? 0 : 1;
}

if ( isMain( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).then( code => { process.exitCode = code; } );
}
