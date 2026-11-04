// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only
//
// V3 physics check for the original sim bsshs-compton: injects the drawer (adapters/bsshs-compton/) into the themed
// build and runs tools/run-cases.mjs on adapters/bsshs-compton/cases.json. The expected values in cases.json were
// computed independently from the class formulas (Δλ = (h/mₑc)(1 − cos θ), E = hc/λ, momentum conservation by the law
// of cosines, cot φ = (1 + E/mₑc²) tan(θ/2)), not read from the sim. Skips when the themed build is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from '../drawer/helpers.mjs';

const ID = 'bsshs-compton';
const run = promisify( execFile );
const BUILD = themedBuild( ID );
const SKIP = BUILD ? false : `themed ${ID} build missing (node tools/build-new-sim.mjs ${ID})`;

test( `${ID}: cases cover the required edge cases`, () => {
  const cases = JSON.parse( readFileSync( path.join( ROOT, 'adapters', ID, 'cases.json' ), 'utf8' ) );
  assert.ok( cases.length >= 6, 'at least 6 cases' );
  const at = theta => cases.find( c => c.params.scatteringAngle === theta && c.expect.wavelengthShift );
  assert.equal( at( 0 ).expect.wavelengthShift.value, 0, 'θ = 0 gives Δλ = 0' );
  assert.ok( Math.abs( at( 180 ).expect.wavelengthShift.value - 4.852 ) < 1e-3, 'θ = 180° gives 4.852 pm' );
  assert.ok( cases.some( c => c.expect.energyAfter ), 'energy conservation E = E′ + Kₑ is checked' );
  assert.ok( cases.some( c => 'photonEnergy' in c.params ), 'energy input is checked' );
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
    await page.evaluate( async p => { await bsshsDrawer.apply( p ); }, { incidentWavelength: 71, scatteringAngle: 90 } );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    let rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1 );
    assert.equal( rows[ 0 ].screen, '콤프턴 산란' );
    assert.equal( rows[ 0 ].values.scatteringAngle, 90 );
    assert.ok( Math.abs( rows[ 0 ].values.wavelengthShift - 2.4263 ) < 1e-3 );
    // Close the drawer (it covers the right side when open), then press the sim's own Reset All button with a
    // real pointer click at its on-screen center.
    await page.evaluate( () => bsshsDrawer.close() );
    await page.waitForTimeout( 400 );
    const at = await page.evaluate( () => {
      const b = phet.joist.sim.screens[ 0 ].view.resetAllButton;
      const r = b.globalBounds;
      return { x: r.centerX, y: r.centerY };
    } );
    await page.mouse.click( at.x, at.y );
    await page.waitForTimeout( 300 );
    assert.equal( await page.evaluate( () => phet.joist.sim.screens[ 0 ].model.scatteringAngleProperty.value ), 60, 'reset happened' );
    assert.equal( ( await page.evaluate( () => bsshsDrawer.rows() ) ).length, 1, 'Reset All keeps the log' );
    await page.reload();
    await drawerReady( page );
    rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1, 'the log survives a reload' );
    assert.equal( rows[ 0 ].values.scatteringAngle, 90 );
    assert.ok( Math.abs( rows[ 0 ].values.wavelengthShift - 2.4263 ) < 1e-3 );
    assert.deepEqual( errors, [] );
  }
  finally {
    await context.close();
    await browser.close();
  }
} );
