// Shared suite for tests/physics/<id>.test.mjs (not a test file itself): V3 cases through
// tools/run-cases.mjs on the injected themed build, and the class-log persistence check
// (record a row → the sim's Reset All → reload → the row is still there).
// Builds come from $BSSHS_BUILD_DIR or <repo>/build (node tools/build-sim.mjs <id> --brand bsshs --theme);
// without one, every test skips with the reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from '../drawer/helpers.mjs';

const run = promisify( execFile );

/** @param {string[]} args @returns {Promise<{ code: number, out: string }>} */
async function tool( args ) {
  try {
    const { stdout } = await run( process.execPath, args, { cwd: ROOT, maxBuffer: 64 << 20, timeout: 600000 } );
    return { code: 0, out: stdout };
  }
  catch ( e ) {
    if ( typeof e.code !== 'number' ) { throw e; }
    return { code: e.code, out: e.stdout };
  }
}

/**
 * Registers the physics tests for one sim.
 * @param {string} id
 * @param {{ minCases?: number }} [opts]
 */
export function physicsSuite( id, opts = {} ) {
  const src = themedBuild( id );
  const skip = src ? false : `themed ${id} build missing (node tools/build-sim.mjs ${id} --brand bsshs --theme)`;
  let injected = null;
  const html = () => ( injected = injected || injectTo( src, `${id}-physics.html`, { id, repoRoot: ROOT } ) );

  test( `${id}: every V3 case in adapters/${id}/cases.json passes (run-cases exit 0)`, { skip, timeout: 600000 }, async () => {
    const r = await tool( [ 'tools/run-cases.mjs', html(), id ] );
    const lines = r.out.trim().split( '\n' ).filter( Boolean ).map( l => JSON.parse( l ) );
    const failed = lines.filter( l => l.type === 'case' && !l.ok ).map( l => `${l.name}: ${l.error || JSON.stringify( l.results )}` );
    assert.deepEqual( failed, [], 'failing cases' );
    assert.equal( r.code, 0, r.out );
    const sum = lines.at( -1 );
    assert.equal( sum.type, 'summary' );
    assert.ok( sum.passed >= ( opts.minCases || 4 ), `at least ${opts.minCases || 4} cases` );
  } );

  test( `${id}: a recorded row survives Reset All and a reload`, { skip, timeout: 120000 }, async () => {
    const browser = await launch();
    try {
      const page = await ( await browser.newContext( contextOptions( 1280 ) ) ).newPage();
      const errors = [];
      page.on( 'pageerror', e => errors.push( String( e ) ) );
      await page.goto( fileUrl( html() ) );
      await drawerReady( page );
      await page.evaluate( () => {
        const sim = window.phet.joist.sim;
        if ( sim.homeScreen && sim.selectedScreenProperty.value === sim.homeScreen ) {
          sim.selectedScreenProperty.value = sim.screens.find( s => s !== sim.homeScreen );
        }
        window.bsshsDrawer.clear();
      } );
      await page.waitForTimeout( 1000 );
      await page.click( '[data-act="open"]' );
      await page.click( '[data-act="record"]' );
      const before = await page.evaluate( () => window.bsshsDrawer.rows() );
      assert.equal( before.length, 1 );
      assert.ok( before[ 0 ].screen, 'the row names a screen' );
      assert.ok( Object.values( before[ 0 ].values ).some( v => typeof v === 'number' ), 'the row holds numbers' );
      // The sim's own Reset All (model and view of the selected screen).
      await page.evaluate( () => {
        const sim = window.phet.joist.sim;
        const sc = sim.selectedScreenProperty ? sim.selectedScreenProperty.value : sim.screenProperty.value;
        sc.model.reset();
        if ( sc.view.reset ) { sc.view.reset(); }
      } );
      assert.equal( ( await page.evaluate( () => window.bsshsDrawer.rows() ) ).length, 1, 'Reset All keeps the log' );
      await page.reload();
      await drawerReady( page );
      const after = await page.evaluate( () => window.bsshsDrawer.rows() );
      assert.equal( after.length, 1, 'the log survives a reload' );
      assert.deepEqual( after[ 0 ].values, before[ 0 ].values );
      assert.deepEqual( errors, [] );
    }
    finally { await browser.close(); }
  } );
}
