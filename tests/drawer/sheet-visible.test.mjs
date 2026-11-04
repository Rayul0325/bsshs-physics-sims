// Phones (390 px): with the bottom sheet open, the experiment must stay visible above it (spec 3.4: the
// sheet overlays, the sim is never pushed or re-laid out). PhET letterboxes a portrait phone, so a sheet of
// a fixed height covered the whole play area and left only the empty letterbox above it (wave-interference
// looked blank). The test samples the pixels above the sheet (the open button excluded) and requires them to
// be non-uniform, and checks that the sim's own layout did not change when the sheet opened.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from './helpers.mjs';
import { loadTokens } from '../../theme/index.mjs';

const tokens = loadTokens();
const SHOTS = path.join( ROOT, 'build/screenshots/FX1' );
let browser;
before( async () => { browser = await launch(); } );
after( async () => { await browser?.close(); } );

/** In-page: the sim's layout (display size and the selected ScreenView's global bounds). */
function simLayout() {
  const s = phet.joist.sim;
  const sc = bsshsDrawer.helpers.screen();
  const v = sc && ( sc.view || sc._view );
  const g = v && v.localToGlobalBounds ? v.localToGlobalBounds( v.layoutBounds ) : null;
  const d = s.display || phet.joist.display;
  return { display: [ d.width, d.height ], view: g ? [ g.minX, g.minY, g.maxX, g.maxY ].map( x => Math.round( x * 100 ) / 100 ) : null };
}

/**
 * In-page: pixel statistics of the rows above `top` (device px), skipping the `skip` box.
 * @param {{ png: string, top: number, skip: { x: number, y: number, w: number, h: number } }} a
 */
async function stats( { png, top, skip } ) {
  const im = new Image();
  await new Promise( ( res, rej ) => { im.onload = res; im.onerror = rej; im.src = png; } );
  const c = document.createElement( 'canvas' );
  c.width = im.width; c.height = im.height;
  const ctx = c.getContext( '2d' );
  ctx.drawImage( im, 0, 0 );
  const d = ctx.getImageData( 0, 0, im.width, Math.min( top, im.height ) ).data;
  const counts = new Map();
  let n = 0;
  for ( let y = 0; y < Math.min( top, im.height ); y++ ) {
    for ( let x = 0; x < im.width; x++ ) {
      if ( x >= skip.x && x < skip.x + skip.w && y >= skip.y && y < skip.y + skip.h ) { continue; }
      const i = ( y * im.width + x ) * 4;
      const k = ( d[ i ] << 16 ) | ( d[ i + 1 ] << 8 ) | d[ i + 2 ];
      counts.set( k, ( counts.get( k ) || 0 ) + 1 );
      n++;
    }
  }
  const dominant = Math.max( 0, ...counts.values() );
  return { pixels: n, colors: counts.size, otherFraction: n ? 1 - dominant / n : 0 };
}

/** Opens `file` at 390, optionally runs `pre`, opens the sheet and measures what shows above it. */
async function aboveSheet( file, pre, shot ) {
  const context = await browser.newContext( contextOptions( 390 ) );
  const page = await context.newPage();
  try {
    await page.goto( fileUrl( file ) );
    await drawerReady( page, 60000 );
    if ( pre ) { await page.evaluate( pre ); }
    await page.waitForTimeout( 800 );
    const before0 = await page.evaluate( simLayout );
    await page.evaluate( () => bsshsDrawer.open( 'log' ) );
    await page.waitForTimeout( 800 );
    const after0 = await page.evaluate( simLayout );
    const g = await page.evaluate( () => {
      const p = document.getElementById( 'bsshs-drawer-host' ).shadowRoot.querySelector( '.panel' ).getBoundingClientRect();
      return { top: p.top, height: p.height, ih: innerHeight, dpr: devicePixelRatio, mode: bsshsDrawer.layout().mode, button: bsshsDrawer.buttonRect() };
    } );
    const buf = await page.screenshot( { type: 'png', ...( shot ? { path: shot } : {} ) } );
    const b = g.button;
    const skip = { x: Math.floor( b.x * g.dpr ) - 2, y: Math.floor( b.y * g.dpr ) - 2, w: Math.ceil( b.width * g.dpr ) + 4, h: Math.ceil( b.height * g.dpr ) + 4 };
    const s = await page.evaluate( stats, { png: `data:image/png;base64,${buf.toString( 'base64' )}`, top: Math.floor( g.top * g.dpr ), skip } );
    return { g, s, before0, after0 };
  }
  finally { await context.close(); }
}

const WI = themedBuild( 'wave-interference' );
const GEN = themedBuild( 'generator' );

for ( const [ id, src, label, pre ] of [
  [ 'wave-interference', WI, 'home screen', null ],
  [ 'wave-interference', WI, '슬릿 screen', () => { const s = phet.joist.sim; s.showHomeScreenProperty.value = false; s.screenIndexProperty.value = 2; } ],
  [ 'generator', GEN, 'single screen', null ]
] ) {
  test( `390 sheet open: ${id} (${label}) stays visible above the sheet, and is not re-laid out`, { skip: src ? false : `themed ${id} build missing`, timeout: 180000 }, async () => {
    const file = injectTo( src, `sheet-${id}.html`, { id, repoRoot: ROOT } );
    const shot = id === 'wave-interference' && pre ? path.join( SHOTS, 'wave-interference-390-sheet-open.png' ) : null;
    if ( shot ) { ( await import( 'node:fs' ) ).mkdirSync( SHOTS, { recursive: true } ); }
    const { g, s, before0, after0 } = await aboveSheet( file, pre, shot );
    assert.equal( g.mode, 'sheet' );
    assert.deepEqual( after0, before0, 'opening the sheet must not re-layout the sim' );
    assert.ok( s.pixels > 0 );
    assert.ok( s.colors > 16 && s.otherFraction > 0.02, `pixels above the sheet look blank: ${JSON.stringify( s )} (sheet top ${g.top}px, sim view ${JSON.stringify( after0.view )})` );
    // The sheet stays a usable sheet: at least drawer.sheetMinHeight, at most drawer.sheetHeight.
    const vh = v => Number.parseFloat( v ) / 100 * g.ih;
    assert.ok( g.height >= vh( tokens.drawer.sheetMinHeight ) - 1, `sheet ${g.height}px` );
    assert.ok( g.height <= vh( tokens.drawer.sheetHeight ) + 1, `sheet ${g.height}px` );
  } );
}

test( 'sheet height follows the sim view bottom and is clamped to the tokens', { skip: WI ? false : 'themed wave-interference build missing', timeout: 120000 }, async () => {
  const file = injectTo( WI, 'sheet-wave-interference.html', { id: 'wave-interference', repoRoot: ROOT } );
  const { g, after0 } = await aboveSheet( file, null, null );
  // The sheet top sits at the bottom of the play area unless that would make it smaller than the minimum.
  const vh = v => Number.parseFloat( v ) / 100 * g.ih;
  const want = Math.min( vh( tokens.drawer.sheetHeight ), Math.max( vh( tokens.drawer.sheetMinHeight ), g.ih - after0.view[ 3 ] ) );
  assert.ok( Math.abs( g.height - want ) <= 1, `height ${g.height}, expected ${want}` );
} );
