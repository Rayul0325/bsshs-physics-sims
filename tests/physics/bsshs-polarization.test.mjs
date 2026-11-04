// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only
//
// V3 physics check for bsshs-polarization (original sim): injects the drawer (adapters/bsshs-polarization/) into the
// themed build and runs tools/run-cases.mjs on adapters/bsshs-polarization/cases.json. The expected values in
// cases.json come from Malus's law, Snell's law and the Fresnel equations, computed independently of the sim.
// Skips when the build is absent (node tools/build-new-sim.mjs bsshs-polarization).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from '../drawer/helpers.mjs';

const ID = 'bsshs-polarization';
const run = promisify( execFile );
const BUILD = themedBuild( ID );
const SKIP = BUILD ? false : `${ID} build missing (node tools/build-new-sim.mjs ${ID})`;

test( `${ID}: the required edge cases are in cases.json`, () => {
  const cases = JSON.parse( readFileSync( path.join( ROOT, 'adapters', ID, 'cases.json' ), 'utf8' ) );
  assert.ok( cases.length >= 4, 'at least 4 cases' );
  const has = ( pred, what ) => assert.ok( cases.some( pred ), what );
  // Crossed polarizers → 0.
  has( c => c.params.p1 === 0 && c.params.p2 === null && c.params.p3 === 90 && c.expect.transmittedIntensity?.value === 0, 'crossed polarizers' );
  // Unpolarized through 0°/45°/90° → I₀/8.
  has( c => c.params.light === 'unpolarized' && c.params.p1 === 0 && c.params.p2 === 45 && c.params.p3 === 90 &&
            c.expect.transmittedFraction?.value === 0.125, 'three polarizers give I₀/8' );
  // Unpolarized through one polarizer → I₀/2.
  has( c => c.params.light === 'unpolarized' && c.params.p2 === null && c.params.p3 === null && c.expect.transmittedFraction?.value === 0.5, 'I₀/2' );
  // Brewster: n₂ = 1.5 → 56.31°, R_p = 0, reflected ⟂ refracted.
  has( c => c.params.refractiveIndex2 === 1.5 && Math.abs( c.expect.brewsterAngle?.value - 56.31 ) < 1e-9, 'θ_B = 56.31°' );
  has( c => c.params.refractiveIndex2 === 1.5 && c.expect.reflectanceP?.value === 0 && c.expect.raysAngle?.value === 90, 'R_p = 0 and rays ⟂' );
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
    await page.evaluate( async p => { await bsshsDrawer.apply( p ); },
      { screen: 'polarizers', light: 'unpolarized', sourceIntensity: 100, p1: 0, p2: 45, p3: 90 } );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    let rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1 );
    assert.equal( rows[ 0 ].screen, '편광판' );
    assert.ok( Math.abs( rows[ 0 ].values.transmittedIntensity - 12.5 ) < 1e-9 );
    assert.equal( rows[ 0 ].values.polarizerCount, 3 );
    // The sim's own Reset All (model and view).
    await page.evaluate( () => { const s = phet.joist.sim.selectedScreenProperty.value; s.model.reset(); s.view.reset && s.view.reset(); } );
    await page.waitForTimeout( 300 );
    assert.equal( await page.evaluate( () => phet.joist.sim.selectedScreenProperty.value.model.polarizers[ 1 ].insertedProperty.value ), false, 'reset happened' );
    assert.equal( ( await page.evaluate( () => bsshsDrawer.rows() ) ).length, 1, 'Reset All keeps the log' );
    await page.reload();
    await drawerReady( page );
    rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1, 'the log survives a reload' );
    assert.ok( Math.abs( rows[ 0 ].values.transmittedIntensity - 12.5 ) < 1e-9 );
    assert.deepEqual( errors, [] );
  }
  finally {
    await context.close();
    await browser.close();
  }
} );
