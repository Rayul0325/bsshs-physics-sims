// Browser plumbing shared by the style tools (check-style, compare-bounds, style-review): open a built sim in
// the installed Chrome, make its timeline repeatable, and visit every screen the way check-sim and
// compare-layout do (same readiness test, same screen selection through joist's own properties).
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { pageReady, listScreens, selectScreen, renderFrozen, frames, viewportFor } from '../compare-layout.mjs';

/** Frames the sim runs before its clock stops. Counted from "construction complete", so it never depends on timing. */
export const FREEZE_FRAMES = 30;

/**
 * Init script (runs before any page script). Makes a sim's timeline repeatable:
 *  - Math.random is a fixed-seed generator;
 *  - performance.now and Date.now are a virtual clock that advances 1/60 s per animation frame, so every
 *    step gets the same dt whatever the machine is doing;
 *  - the sim's clock (sim.activeProperty) stops after `freezeFrames` frames since the sim finished building.
 * Serialised into the page: no outer references. `window.__bsshsFrozen` tells when the clock has stopped.
 * @param {{ freezeFrames: number }} arg
 */
export function deterministicInit( { freezeFrames } ) {
  let a = 0x2545f491;
  Math.random = () => {
    a = ( a + 0x6d2b79f5 ) | 0;
    let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
    t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
    return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
  };
  const dateBase = 1.75e12;
  let virtualMs = 0;
  performance.now = () => virtualMs;
  Date.now = () => dateBase + virtualMs;
  const realRaf = window.requestAnimationFrame.bind( window );
  let counted = 0;
  window.__bsshsFrozen = false;
  window.requestAnimationFrame = cb => realRaf( () => {
    virtualMs += 1000 / 60;
    const sim = window.phet && window.phet.joist && window.phet.joist.sim;
    if ( sim && !window.__bsshsFrozen && sim.activeProperty ) {
      const cc = sim.isConstructionCompleteProperty || sim._isConstructionCompleteProperty;
      if ( !cc || cc.value !== false ) {
        counted++;
        if ( counted >= freezeFrames ) { sim.activeProperty.value = false; window.__bsshsFrozen = true; }
      }
    }
    cb( virtualMs );
  } );
}

/**
 * Opens a built sim and waits until it is built, its splash is gone and (deterministic mode) its clock stopped.
 * @param {import('playwright').Browser} browser
 * @param {string} file
 * @param {{ width?: number, height?: number|null, timeout?: number, settle?: number, deterministic?: boolean }} [o]
 * @returns {Promise<{ context: import('playwright').BrowserContext, page: import('playwright').Page, errors: string[], frozen: boolean|null }>}
 */
export async function openSim( browser, file, o = {} ) {
  const { width = 1280, height = null, timeout = 30000, settle = 1000, deterministic = true } = o;
  const context = await browser.newContext( viewportFor( width, height ) );
  const page = await context.newPage();
  const errors = [];
  page.on( 'pageerror', e => errors.push( String( e ).slice( 0, 300 ) ) );
  if ( deterministic ) { await page.addInitScript( deterministicInit, { freezeFrames: FREEZE_FRAMES } ); }
  await page.goto( pathToFileURL( path.resolve( file ) ).href, { waitUntil: 'load', timeout } );
  await page.waitForFunction( pageReady, null, { timeout, polling: 100 } );
  let frozen = null;
  if ( deterministic ) {
    frozen = await page.waitForFunction( () => window.__bsshsFrozen === true, null, { timeout: 5000, polling: 50 } ).then( () => true, () => false );
  }
  await frames( page );
  await page.waitForTimeout( settle );
  return { context, page, errors, frozen };
}

/**
 * Visits the home screen (when there is one) and every sim screen in turn: select it, draw one frame with
 * dt 0, let it settle, then call `fn`.
 * @param {import('playwright').Page} page
 * @param {{ settle?: number }} o
 * @param {(target: { index: number, name: string }) => Promise<void>} fn
 * @returns {Promise<{ index: number, name: string }[]>} the visited screens
 */
export async function visitScreens( page, o, fn ) {
  const settle = o.settle ?? 800;
  const targets = await page.evaluate( listScreens );
  for ( const t of targets ) {
    await page.evaluate( selectScreen, t.index );
    await page.evaluate( renderFrozen );
    await frames( page );
    await page.waitForTimeout( settle );
    await page.evaluate( renderFrozen );
    await frames( page );
    await fn( t );
  }
  return targets;
}

export { frames, renderFrozen, listScreens, selectScreen, pageReady, viewportFor };
