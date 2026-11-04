// drawer.helpers.screen() / model() / isHomeScreen() / screenName() on every joist generation found in
// the 68 themed builds:
//   - selectedScreenProperty (newer joist; the home screen is screens[0] when present),
//   - screenProperty (2019-2021 joist; same layout),
//   - screenIndexProperty + showHomeScreenProperty (older joist; the home screen is NOT in screens).
// Each generation is checked with and without a home screen on a real build. The drawer is injected with
// the fixture adapter (helpers do not depend on the adapter). Skips a build that is missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FIX, ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch } from './helpers.mjs';

const OPTS = { id: 'fake-sim', repoRoot: ROOT, adapterDir: path.join( FIX, 'adapters/fake' ), lessonsFile: path.join( FIX, 'lessons/fake-sim.json' ) };

// [ build id, generation, has a home screen, index (into the non-home screens) to switch to, expected Korean name ]
const CASES = [
  [ 'bending-light', 'selected', true, 1, '프리즘' ],
  [ 'generator', 'selected', false, 0, '발전기' ],
  [ 'collision-lab', 'screen', true, 1, '1차원 탐색' ],
  [ 'faradays-law', 'screen', false, 0, null ],
  [ 'wave-interference', 'index', true, 2, '슬릿' ],
  [ 'blackbody-spectrum', 'index', false, 0, null ]
];

let browser;
before( async () => { browser = await launch(); } );
after( async () => { await browser?.close(); } );

/** In-page: switches the sim to its i-th non-home screen with the generation's own property. */
function selectRaw( i ) {
  const s = phet.joist.sim;
  const screens = s.screens.filter( x => x !== s.homeScreen );
  if ( s.selectedScreenProperty ) { s.selectedScreenProperty.value = screens[ i ]; }
  else if ( s.screenProperty ) { s.screenProperty.value = screens[ i ]; }
  else { s.showHomeScreenProperty.value = false; s.screenIndexProperty.value = s.screens.indexOf( screens[ i ] ); }
}

/** In-page snapshot of what the helpers return. @param {number} i - expected non-home screen index */
function probe( i ) {
  const s = phet.joist.sim;
  const h = bsshsDrawer.helpers;
  const screens = s.screens.filter( x => x !== s.homeScreen );
  const sc = h.screen();
  return {
    gen: s.selectedScreenProperty ? 'selected' : s.screenProperty ? 'screen' : s.screenIndexProperty ? 'index' : 'none',
    hasHome: !!s.homeScreen,
    isHome: h.isHomeScreen(),
    screenIsHome: !!s.homeScreen && sc === s.homeScreen,
    screenIsExpected: sc === screens[ i ],
    modelIsExpected: !!h.model() && h.model() === ( screens[ i ].model || screens[ i ]._model ),
    name: h.screenName(),
    apiName: bsshsDrawer.screenName(),
    simName: h.cleanName( s.simNameProperty ? s.simNameProperty.value : s.name )
  };
}

for ( const [ id, gen, hasHome, index, expectedName ] of CASES ) {
  const src = themedBuild( id );
  test( `helpers on ${id} (${gen} joist, ${hasHome ? 'with' : 'no'} home screen)`, { skip: src ? false : `themed ${id} build missing`, timeout: 120000 }, async () => {
    const file = injectTo( src, `helpers-${id}.html`, OPTS );
    const context = await browser.newContext( contextOptions( 1280 ) );
    const page = await context.newPage();
    try {
      await page.goto( fileUrl( file ) );
      await page.waitForFunction( () => window.bsshsDrawer && window.bsshsDrawer.mounted, null, { timeout: 60000 } );
      const first = await page.evaluate( probe, index );
      assert.equal( first.gen, gen, 'the build is of the generation this case covers' );
      assert.equal( first.hasHome, hasHome );
      if ( hasHome ) {
        assert.equal( first.isHome, true, `${id} starts on the home screen` );
        assert.equal( first.screenIsHome, true );
        assert.equal( first.name, '홈 화면' );
        await page.evaluate( selectRaw, index );
        await page.waitForTimeout( 300 );
      }
      const p = await page.evaluate( probe, index );
      assert.equal( p.isHome, false );
      assert.equal( p.screenIsExpected, true, 'screen() is the selected screen' );
      assert.equal( p.modelIsExpected, true, 'model() is the selected screen model' );
      // A single screen without a name of its own is called by the sim's name (as the sim shows it).
      assert.equal( p.name, expectedName ?? p.simName );
      assert.ok( p.name && !/[A-Za-z]{3,}/.test( p.name ), `Korean screen name, got ${JSON.stringify( p.name )}` );
    }
    finally { await context.close(); }
  } );
}
