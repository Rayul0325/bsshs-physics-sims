// V3 physics check for quantum-measurement: injects the drawer (adapters/quantum-measurement/) into the themed build and runs
// tools/run-cases.mjs on adapters/quantum-measurement/cases.json. The expected values in cases.json come from the class
// formulas, computed independently of the sim. Skips when the themed build is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from '../drawer/helpers.mjs';

const ID = 'quantum-measurement';
const run = promisify( execFile );
const BUILD = themedBuild( ID );
const SKIP = BUILD ? false : `themed ${ID} build missing (node tools/build-sim.mjs ${ID} --brand bsshs --theme)`;

test( `${ID}: at least 4 V3 cases, every one passes run-cases`, { skip: SKIP, timeout: 600000 }, async () => {
  const cases = JSON.parse( readFileSync( path.join( ROOT, 'adapters', ID, 'cases.json' ), 'utf8' ) );
  assert.ok( cases.length >= 4, 'at least 4 cases' );
  const html = injectTo( BUILD, `${ID}-physics.html`, { id: ID, repoRoot: ROOT } );
  let code = 0;
  let out = '';
  try {
    ( { stdout: out } = await run( process.execPath, [ 'tools/run-cases.mjs', html, ID ], { cwd: ROOT, maxBuffer: 64 << 20, timeout: 540000 } ) );
  }
  catch ( e ) {
    if ( typeof e.code !== 'number' ) { throw e; }
    code = e.code;
    out = e.stdout || '';
  }
  const lines = out.trim().split( '\n' ).filter( Boolean ).map( l => JSON.parse( l ) );
  const failed = lines.filter( l => l.type === 'case' && !l.ok )
    .map( l => `${l.name}: ${l.error || JSON.stringify( l.results.filter( r => !r.ok ) )}` );
  assert.equal( code, 0, failed.join( '\n' ) || out );
  const sum = lines.at( -1 );
  assert.equal( sum.type, 'summary' );
  assert.equal( sum.passed, cases.length );
} );

test( `${ID}: a recorded row survives Reset All and a reload`, { skip: SKIP, timeout: 180000 }, async () => {
  const html = injectTo( BUILD, `${ID}-log.html`, { id: ID, repoRoot: ROOT } );
  const browser = await launch();
  const context = await browser.newContext( contextOptions( 1280 ) );
  const page = await context.newPage();
  const errors = [];
  page.on( 'pageerror', e => errors.push( String( e ) ) );
  try {
    await page.goto( fileUrl( html ) );
    await drawerReady( page );
    await page.evaluate( async p => { await bsshsDrawer.apply( p ); }, { screen: 'photons', polarizationAngle: 30 } );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    let rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1 );
    assert.equal( rows[ 0 ].screen, '광자' );
    assert.equal( rows[ 0 ].values.polarizationAngle, 30 );
    assert.ok( Math.abs( rows[ 0 ].values.passProbability - 0.75 ) < 1e-9 );
    // The sim's own Reset All (model and view).
    await page.evaluate( () => { const s = phet.joist.sim.selectedScreenProperty.value; s.model.reset(); s.view.reset && s.view.reset(); } );
    await page.waitForTimeout( 300 );
    assert.deepEqual( await page.evaluate( () => phet.joist.sim.selectedScreenProperty.value.model.singlePhotonSceneModel.laser.polarizationAngleProperty.value ), 45, 'reset happened' );
    assert.equal( ( await page.evaluate( () => bsshsDrawer.rows() ) ).length, 1, 'Reset All keeps the log' );
    await page.reload();
    await drawerReady( page );
    rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1, 'the log survives a reload' );
    assert.equal( rows[ 0 ].values.polarizationAngle, 30 );
    assert.ok( Math.abs( rows[ 0 ].values.passProbability - 0.75 ) < 1e-9 );
    assert.deepEqual( errors, [] );
  }
  finally {
    await context.close();
    await browser.close();
  }
} );
