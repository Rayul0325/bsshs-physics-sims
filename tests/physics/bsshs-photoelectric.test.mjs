// V3 physics check for the original sim bsshs-photoelectric: injects the drawer (adapters/bsshs-photoelectric/) into
// the themed build and runs tools/run-cases.mjs on adapters/bsshs-photoelectric/cases.json. The expected values in
// cases.json come from the class formulas (E = hf, K_max = hf − W, eV₀ = K_max, I_sat = e·N) computed independently of
// the sim. Skips when the themed build is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from '../drawer/helpers.mjs';

const ID = 'bsshs-photoelectric';
const run = promisify( execFile );
const BUILD = themedBuild( ID );
const SKIP = BUILD ? false : `themed ${ID} build missing (node tools/build-new-sim.mjs ${ID})`;

test( `${ID}: the cases cover the required edge cases`, () => {
  const cases = JSON.parse( readFileSync( path.join( ROOT, 'adapters', ID, 'cases.json' ), 'utf8' ) );
  assert.ok( cases.length >= 4, 'at least 4 cases' );
  const zeroCurrent = c => c.expect.photocurrent && c.expect.photocurrent.value === 0;
  // Below the threshold: no photoelectrons even at full intensity.
  assert.ok( cases.some( c => zeroCurrent( c ) && c.params.intensity === 100 && !( 'kineticEnergyMax' in c.expect ) ), 'below-threshold case' );
  // Same light, different intensity: K_max equal, current different.
  const na400 = cases.filter( c => c.params.metal === 'Na' && c.params.wavelength === 400 && c.params.voltage === 3 && c.params.lightOn !== false );
  assert.ok( new Set( na400.map( c => c.params.intensity ) ).size >= 2, 'intensity pair' );
  assert.equal( new Set( na400.map( c => c.expect.kineticEnergyMax.value ) ).size, 1, 'K_max does not depend on intensity' );
  // Cutoff at −V₀ and saturation at a positive voltage.
  assert.ok( cases.some( c => zeroCurrent( c ) && c.params.voltage < 0 && c.expect.stoppingVoltage &&
                              Math.abs( c.params.voltage + c.expect.stoppingVoltage.value ) < 1e-9 ), 'cutoff at −V₀' );
  assert.ok( cases.some( c => c.params.voltage >= 5 && c.expect.photocurrent && c.expect.photocurrent.value > 0 ), 'saturation case' );
} );

test( `${ID}: every V3 case passes run-cases`, { skip: SKIP, timeout: 600000 }, async () => {
  const cases = JSON.parse( readFileSync( path.join( ROOT, 'adapters', ID, 'cases.json' ), 'utf8' ) );
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
    await page.evaluate( async p => { await bsshsDrawer.apply( p ); }, { metal: 'Na', wavelength: 400, intensity: 100, voltage: 3 } );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    let rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1 );
    assert.equal( rows[ 0 ].values.wavelength, 400 );
    assert.ok( Math.abs( rows[ 0 ].values.kineticEnergyMax - 0.8196 ) < 1e-3 );
    // The sim's own Reset All (model and view).
    await page.evaluate( () => { const s = phet.joist.sim.screens[ 0 ]; s.model.reset(); s.view.reset && s.view.reset(); } );
    await page.waitForTimeout( 300 );
    assert.equal( await page.evaluate( () => phet.joist.sim.screens[ 0 ].model.lightOnProperty.value ), false, 'reset happened' );
    assert.equal( ( await page.evaluate( () => bsshsDrawer.rows() ) ).length, 1, 'Reset All keeps the log' );
    await page.reload();
    await drawerReady( page );
    rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1, 'the log survives a reload' );
    assert.equal( rows[ 0 ].values.wavelength, 400 );
    assert.ok( Math.abs( rows[ 0 ].values.photocurrent - 1.5989 ) < 1e-3 );
    assert.deepEqual( errors, [] );
  }
  finally {
    await context.close();
    await browser.close();
  }
} );
