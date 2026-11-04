// V3 physics check for the original sim bsshs-semiconductor: injects the drawer (adapters/bsshs-semiconductor/) into
// the themed build and runs tools/run-cases.mjs on adapters/bsshs-semiconductor/cases.json. The expected values come
// from the class/standard formulas, computed independently of the sim (adapters/bsshs-semiconductor/reference.py:
// Lambert W operating point, exact rectifier turn-on/turn-off instants, an ODE solver). Skips when the build is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from '../drawer/helpers.mjs';

const ID = 'bsshs-semiconductor';
const run = promisify( execFile );
const BUILD = themedBuild( ID );
const SKIP = BUILD ? false : `themed ${ID} build missing (node tools/build-new-sim.mjs ${ID})`;

test( `${ID}: cases cover both screens and the required edge cases`, () => {
  const cases = JSON.parse( readFileSync( path.join( ROOT, 'adapters', ID, 'cases.json' ), 'utf8' ) );
  assert.ok( cases.length >= 4, 'at least 4 cases' );
  const junction = cases.filter( c => c.params.screen === 'junction' );
  const rectifier = cases.filter( c => c.params.screen === 'rectifier' );
  assert.ok( junction.length >= 4 && rectifier.length >= 4, 'both screens' );
  // Reverse bias: I ≈ −I_s.
  const reverse = junction.filter( c => c.params.sourceVoltage < 0 && c.expect.diodeCurrent );
  assert.ok( reverse.length >= 1 );
  for ( const c of reverse ) {
    assert.ok( Math.abs( c.expect.diodeCurrent.value + c.expect.saturationCurrent.value ) <= 1e-9 * c.expect.saturationCurrent.value, c.name );
  }
  // Constant-drop peaks without a capacitor: V_p − 0.7 V (half-wave), V_p − 1.4 V (bridge).
  const peak = ( circuit, drop ) => rectifier.find( c => c.params.circuit === circuit && c.params.diodeModel === 'constantDrop' &&
    !c.params.capacitance && c.params.inputAmplitude > drop && c.expect.peakVoltage &&
    Math.abs( c.expect.peakVoltage.value - ( c.params.inputAmplitude - drop ) ) < 1e-12 );
  assert.ok( peak( 'halfWave', 0.7 ), 'half-wave V_p − 0.7 V case' );
  assert.ok( peak( 'bridge', 1.4 ), 'bridge V_p − 1.4 V case' );
  // All three diode models appear.
  for ( const m of [ 'ideal', 'constantDrop', 'piecewiseLinear' ] ) { assert.ok( rectifier.some( c => c.params.diodeModel === m ), m ); }
} );

test( `${ID}: every V3 case passes run-cases`, { skip: SKIP, timeout: 900000 }, async () => {
  const cases = JSON.parse( readFileSync( path.join( ROOT, 'adapters', ID, 'cases.json' ), 'utf8' ) );
  const html = injectTo( BUILD, `${ID}-physics.html`, { id: ID, repoRoot: ROOT } );
  let code = 0;
  let out = '';
  try {
    ( { stdout: out } = await run( process.execPath, [ 'tools/run-cases.mjs', html, ID ], { cwd: ROOT, maxBuffer: 64 << 20, timeout: 840000 } ) );
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
    await page.evaluate( async p => { await bsshsDrawer.apply( p ); }, { screen: 'junction', sourceVoltage: -5 } );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    let rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1 );
    assert.equal( rows[ 0 ].screen, 'PN 접합' );
    assert.equal( rows[ 0 ].values.sourceVoltage, -5 );
    assert.ok( Math.abs( rows[ 0 ].values.depletionWidth - 1.2157 ) < 1e-3 );
    // The sim's own Reset All (model and view).
    await page.evaluate( () => { const s = phet.joist.sim.selectedScreenProperty.value; s.model.reset(); s.view.reset && s.view.reset(); } );
    await page.waitForTimeout( 300 );
    assert.equal( await page.evaluate( () => phet.joist.sim.selectedScreenProperty.value.model.sourceVoltageProperty.value ), 0, 'reset happened' );
    assert.equal( ( await page.evaluate( () => bsshsDrawer.rows() ) ).length, 1, 'Reset All keeps the log' );
    await page.reload();
    await drawerReady( page );
    rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1, 'the log survives a reload' );
    assert.equal( rows[ 0 ].values.sourceVoltage, -5 );
    assert.ok( Math.abs( rows[ 0 ].values.depletionWidth - 1.2157 ) < 1e-3 );
    assert.deepEqual( errors, [] );
  }
  finally {
    await context.close();
    await browser.close();
  }
} );
