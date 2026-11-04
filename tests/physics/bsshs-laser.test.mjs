// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

// V3 physics check for the original 레이저 sim (bsshs-laser): injects the drawer (adapters/bsshs-laser/) into
// the themed build and runs tools/run-cases.mjs on adapters/bsshs-laser/cases.json. The expected values in
// cases.json come from the textbook steady state of a 3-level laser rate-equation model, computed
// independently of the sim:
//   g_th = −ln(0.99·R)/(2L), x_th = g_th/g₀, N₂/N = Wτ/(1+Wτ) below threshold, (1+x_th)/2 above,
//   stimulated photons/s = N(W·N₁/N − N₂/(Nτ)), P_out = stimulated × ln R/ln(0.99·R) × (E₂ − E₁),
//   with L = 0.10 m, g₀ = 2.0 1/m, N = 1e16 atoms, E₁ = 0 eV, E₃ = E₂ + 0.5 eV.
// A third test checks the photon picture: stimulated photons copy the energy, direction and phase of
// the photon that triggered them, and below threshold there are none. Skips when the build is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from '../drawer/helpers.mjs';

const ID = 'bsshs-laser';
const run = promisify( execFile );
const BUILD = themedBuild( ID );
const SKIP = BUILD ? false : `themed ${ID} build missing (node tools/build-new-sim.mjs ${ID})`;

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
    await page.evaluate( async p => { await bsshsDrawer.apply( p ); }, { pumpRate: 2000, upperLevelLifetime: 2, mirrorReflectivity: 95 } );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    let rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1 );
    assert.equal( rows[ 0 ].screen, '레이저 실험' );
    assert.equal( rows[ 0 ].values.pumpRate, 2000 );
    assert.ok( Math.abs( rows[ 0 ].values.outputPower - 1.46597 ) < 1e-3 );
    // The sim's own Reset All (model and view).
    await page.evaluate( () => { const s = phet.joist.sim.screens[ 0 ]; s.model.reset(); s.view.reset && s.view.reset(); } );
    await page.waitForTimeout( 300 );
    assert.notEqual( await page.evaluate( () => phet.joist.sim.screens[ 0 ].model.pumpRateProperty.value ), 2000, 'reset happened' );
    assert.equal( ( await page.evaluate( () => bsshsDrawer.rows() ) ).length, 1, 'Reset All keeps the log' );
    await page.reload();
    await drawerReady( page );
    rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1, 'the log survives a reload' );
    assert.equal( rows[ 0 ].values.pumpRate, 2000 );
    assert.ok( Math.abs( rows[ 0 ].values.outputPower - 1.46597 ) < 1e-3 );
    assert.deepEqual( errors, [] );
  }
  finally {
    await context.close();
    await browser.close();
  }
} );

test( `${ID}: stimulated photons copy energy, direction and phase; none below threshold`, { skip: SKIP, timeout: 180000 }, async () => {
  const html = injectTo( BUILD, `${ID}-photons.html`, { id: ID, repoRoot: ROOT } );
  const browser = await launch();
  const context = await browser.newContext( contextOptions( 1280 ) );
  const page = await context.newPage();
  const errors = [];
  page.on( 'pageerror', e => errors.push( String( e ) ) );
  try {
    await page.goto( fileUrl( html ) );
    await drawerReady( page );
    // Steps the photon picture for `seconds` of screen time (1/60 s steps) at the given inputs.
    const runPhotons = ( params, seconds ) => page.evaluate( async ( { p, s } ) => {
      await bsshsDrawer.apply( p );
      const m = phet.joist.sim.screens[ 0 ].model;
      m.isPlayingProperty.value = false; // only this loop advances the model
      m.photonSystem.clearLog();
      for ( let i = 0; i < s * 60; i++ ) { m.stepModel( 1 / 60 ); }
      const ps = m.photonSystem;
      return {
        log: ps.stimulatedLog.map( e => ( { parent: e.parent, child: e.child } ) ),
        spontaneous: ps.spontaneousCount,
        directions: [ ...new Set( ps.spontaneousDirections.map( d => d.toFixed( 3 ) ) ) ].length,
        coherent: ps.photons.filter( q => q.coherent ).length
      };
    }, { p: params, s: seconds } );

    const above = await runPhotons( { pumpRate: 3000, upperLevelLifetime: 2, mirrorReflectivity: 95, upperLevelEnergy: 2.33 }, 8 );
    assert.ok( above.log.length >= 10, `stimulated emissions happened above threshold (${above.log.length})` );
    for ( const { parent, child } of above.log ) {
      assert.equal( child.energy, parent.energy, 'same energy' );
      assert.equal( child.energy, 2.33, 'energy = E₂ − E₁' );
      assert.equal( child.direction, parent.direction, 'same direction' );
      assert.equal( child.phase, parent.phase, 'same phase' );
    }
    assert.ok( above.coherent > 0, 'a coherent beam builds up above threshold' );
    assert.ok( above.spontaneous > 0 && above.directions > 3, 'spontaneous photons go in many directions' );

    const below = await runPhotons( { pumpRate: 600, upperLevelLifetime: 2, mirrorReflectivity: 95, upperLevelEnergy: 2.33 }, 8 );
    assert.equal( below.log.length, 0, 'no stimulated emission below threshold' );
    assert.equal( below.coherent, 0, 'no coherent photons below threshold' );
    assert.ok( below.spontaneous > 0, 'spontaneous emission continues below threshold' );
    assert.deepEqual( errors, [] );
  }
  finally {
    await context.close();
    await browser.close();
  }
} );
