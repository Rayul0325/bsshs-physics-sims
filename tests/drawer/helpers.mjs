// Shared helpers for the drawer browser tests (not a test file itself).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { injectDrawer } from '../../drawer/inject.mjs';

export const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
export const FIX = path.join( ROOT, 'tests/fixtures/drawer' );
export const OUT = path.join( ROOT, 'build/test-drawer' );

/**
 * Where a themed build lives: $BSSHS_BUILD_DIR or <repo>/build.
 * @param {string} id
 * @returns {string|null}
 */
export function themedBuild( id ) {
  const dirs = [ process.env.BSSHS_BUILD_DIR, path.join( ROOT, 'build' ) ].filter( Boolean );
  for ( const d of dirs ) {
    const f = path.join( d, 'bsshs-theme', id, `${id}_ko.html` );
    if ( existsSync( f ) ) { return f; }
  }
  return null;
}

/**
 * Injects the drawer into `src` and writes it under build/test-drawer/.
 * @param {string} src
 * @param {string} name - output file name
 * @param {object} opts - injectDrawer options
 * @returns {string} absolute output path
 */
export function injectTo( src, name, opts ) {
  mkdirSync( OUT, { recursive: true } );
  const out = path.join( OUT, name );
  writeFileSync( out, injectDrawer( readFileSync( src, 'utf8' ), opts ) );
  return out;
}

/** @param {string} file @returns {string} */
export const fileUrl = file => pathToFileURL( file ).href;

/**
 * Browser context options matching tools/check-sim.mjs (CDP emulation below 600 px).
 * @param {number} width
 * @param {number} [height]
 */
export function contextOptions( width, height ) {
  return width < 600 ?
    { viewport: { width, height: height ?? 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true } :
    { viewport: { width, height: height ?? 800 }, acceptDownloads: true };
}

/** @returns {Promise<import('playwright').Browser>} */
export async function launch() {
  const { chromium } = await import( 'playwright' );
  return chromium.launch( { channel: 'chrome', headless: true } );
}

/** Waits until the drawer has mounted (and its adapter registered). @param {import('playwright').Page} page */
export async function drawerReady( page, timeout = 30000 ) {
  await page.waitForFunction( () => window.bsshsDrawer && window.bsshsDrawer.mounted && window.bsshsDrawer.adapterRegistered, null, { timeout } );
}

/** Element rects of everything a finger may press in the open drawer. @param {import('playwright').Page} page */
export function touchTargets( page ) {
  return page.evaluate( () => {
    const root = document.getElementById( 'bsshs-drawer-host' ).shadowRoot;
    return [ ...root.querySelectorAll( 'button, select, [role="tab"], label.check, a[download]' ) ]
      .filter( e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle( e ).visibility !== 'hidden'; } )
      .map( e => { const r = e.getBoundingClientRect(); return { what: `${e.tagName} ${( e.textContent || '' ).trim().slice( 0, 20 )}`, w: r.width, h: r.height }; } );
  } );
}

/** Computed font sizes of visible text-bearing elements in the open drawer. @param {import('playwright').Page} page */
export function textSizes( page ) {
  return page.evaluate( () => {
    const root = document.getElementById( 'bsshs-drawer-host' ).shadowRoot;
    const out = [];
    const walker = document.createTreeWalker( root, NodeFilter.SHOW_TEXT );
    for ( let n = walker.nextNode(); n; n = walker.nextNode() ) {
      const el = n.parentElement;
      if ( !n.nodeValue.trim() || !el || /^(STYLE|SCRIPT)$/.test( el.tagName ) ) { continue; }
      const r = el.getBoundingClientRect();
      if ( r.width === 0 || r.height === 0 ) { continue; }
      out.push( { text: n.nodeValue.trim().slice( 0, 20 ), size: parseFloat( getComputedStyle( el ).fontSize ) } );
    }
    return out;
  } );
}

/** innerText of the drawer shadow root. @param {import('playwright').Page} page */
export function drawerText( page ) {
  return page.evaluate( () => document.getElementById( 'bsshs-drawer-host' ).shadowRoot.querySelector( '.panel' ).innerText );
}
