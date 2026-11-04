// The drawer on real themed PhET builds (generator with the example adapter; faradays-electromagnetic-lab
// for screen changes), V9 layout comparison with its mutation check, and check-sim on the injected build.
// Builds come from $BSSHS_BUILD_DIR or <repo>/build (node tools/build-sim.mjs <id> --brand bsshs --theme).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, FIX, OUT, themedBuild, injectTo, fileUrl, contextOptions, launch, drawerReady } from './helpers.mjs';
import { extractDrawerData, replaceDrawerData } from '../../drawer/inject.mjs';

const run = promisify( execFile );
const GEN = themedBuild( 'generator' );
const FEL = themedBuild( 'faradays-electromagnetic-lab' );
const SKIP_GEN = GEN ? false : 'themed generator build missing (node tools/build-sim.mjs generator --brand bsshs --theme)';
const SKIP_FEL = FEL ? false : 'themed faradays-electromagnetic-lab build missing';
let browser;
let genDrawer;

before( async () => {
  browser = await launch();
  if ( GEN ) {
    genDrawer = injectTo( GEN, 'generator-drawer.html', { id: 'generator', repoRoot: ROOT, adapterDir: path.join( ROOT, 'adapters/_example' ) } );
  }
} );
after( async () => { await browser?.close(); } );

/** Runs a node tool, returning { code, json }. @param {string[]} args */
async function tool( args ) {
  try {
    const { stdout } = await run( process.execPath, args, { cwd: ROOT, maxBuffer: 64 << 20, timeout: 240000 } );
    return { code: 0, out: stdout };
  }
  catch ( e ) {
    if ( typeof e.code !== 'number' ) { throw e; }
    return { code: e.code, out: e.stdout };
  }
}

test( 'real build: record, reload, Reset All, apply and exports with the example adapter', { skip: SKIP_GEN, timeout: 120000 }, async () => {
  const context = await browser.newContext( contextOptions( 1280 ) );
  const page = await context.newPage();
  const errors = [];
  page.on( 'pageerror', e => errors.push( String( e ) ) );
  try {
    await page.goto( fileUrl( genDrawer ) );
    await drawerReady( page );
    await page.evaluate( async () => { await bsshsDrawer.apply( { waterFlow: 0, coilTurns: 3 } ); } );
    await page.waitForTimeout( 300 );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    const rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( rows.length, 1 );
    assert.equal( rows[ 0 ].screen, '발전기' );
    assert.equal( rows[ 0 ].values.coilTurns, 3 );
    assert.equal( rows[ 0 ].values.angularSpeed, 0 );
    assert.equal( typeof rows[ 0 ].values.magneticFlux, 'number' );
    await page.evaluate( async () => { await bsshsDrawer.apply( { waterFlow: 60 } ); } );
    await page.waitForTimeout( 1500 );
    await page.evaluate( () => bsshsDrawer.record() );
    // The sim's own Reset All (model and view).
    await page.evaluate( () => { const s = phet.joist.sim.selectedScreenProperty.value; s.model.reset(); s.view.reset && s.view.reset(); } );
    assert.equal( await page.evaluate( () => phet.joist.sim.screens[ 0 ].model.generator.pickupCoil.coil.numberOfLoopsProperty.value ), 2, 'reset happened' );
    assert.equal( ( await page.evaluate( () => bsshsDrawer.rows() ) ).length, 2 );
    await page.reload();
    await drawerReady( page );
    const after = await page.evaluate( () => bsshsDrawer.rows() );
    assert.equal( after.length, 2 );
    assert.ok( after[ 1 ].values.angularSpeed > 0, 'water turned the wheel' );
    const csv = await page.evaluate( () => bsshsDrawer.exportCsv() );
    assert.match( csv, /^\uFEFF시각,화면,시간 \(s\),물 흐름 \(%\),회전 속력 \(rpm\),회전 속력 \(rad\/s\)/ );
    const png = await page.evaluate( async () => ( await bsshsDrawer.exportPng( 'speed-vs-flow' ) ).size );
    assert.ok( png > 1000 );
    assert.deepEqual( errors, [] );
    await page.evaluate( () => bsshsDrawer.open( 'lessons' ) );
    const text = await page.evaluate( () => document.getElementById( 'bsshs-drawer-host' ).shadowRoot.querySelector( '.panel' ).innerText );
    assert.match( text, /패러데이 법칙/ );
    assert.doesNotMatch( text, /\d{4}-\d{2}-\d{2}_[^\s]+?_[0-9a-f]{8}/ );
  }
  finally { await context.close(); }
} );

test( 'real build: a screen change appends to the same log with the Korean screen name', { skip: SKIP_FEL, timeout: 120000 }, async () => {
  const file = injectTo( FEL, 'fel-drawer.html', { id: 'faradays-electromagnetic-lab', repoRoot: ROOT, adapterDir: path.join( FIX, 'adapters/fel-screens' ) } );
  const context = await browser.newContext( contextOptions( 1280 ) );
  const page = await context.newPage();
  try {
    await page.goto( fileUrl( file ) );
    await drawerReady( page );
    await page.evaluate( () => { const s = phet.joist.sim; s.selectedScreenProperty.value = s.screens[ 1 ]; } );
    await page.waitForTimeout( 300 );
    await page.evaluate( () => bsshsDrawer.record() );
    await page.evaluate( () => { const s = phet.joist.sim; s.selectedScreenProperty.value = s.screens[ 3 ]; } );
    await page.waitForTimeout( 300 );
    await page.evaluate( () => bsshsDrawer.record() );
    const rows = await page.evaluate( () => bsshsDrawer.rows() );
    assert.deepEqual( rows.map( r => r.screen ), [ '막대자석', '전자석' ] );
    assert.deepEqual( rows.map( r => r.values.screenIndex ), [ 1, 3 ] );
    const keys = await page.evaluate( () => Object.keys( localStorage ).filter( k => k.startsWith( 'bsshs:log:' ) ) );
    assert.deepEqual( keys, [ 'bsshs:log:faradays-electromagnetic-lab:v1' ] );
  }
  finally { await context.close(); }
} );

for ( const width of [ 1280, 390 ] ) {
  test( `V9: closed drawer leaves the experiment screen pixel-identical at ${width} (button excluded)`, { skip: SKIP_GEN, timeout: 240000 }, async () => {
    const r = await tool( [ 'tools/compare-layout.mjs', genDrawer, GEN, '--width', String( width ), '--exclude-button' ] );
    const json = JSON.parse( r.out );
    assert.equal( r.code, 0, r.out );
    assert.equal( json.ok, true );
    assert.equal( json.diffPixels, 0 );
    assert.ok( json.excluded && json.excluded.width >= 44 );
  } );
}

test( 'V9 mutation: a closed drawer that covers a strip of the screen FAILS the comparator', { skip: SKIP_GEN, timeout: 240000 }, async () => {
  const html = readFileSync( genDrawer, 'utf8' );
  const data = extractDrawerData( html );
  data.css += '\n.panel { visibility: visible !important; transform: none !important; width: 24px !important; }\n';
  const bad = path.join( OUT, 'generator-drawer-strip.html' );
  writeFileSync( bad, replaceDrawerData( html, data ) );
  for ( const width of [ 1280, 390 ] ) {
    const r = await tool( [ 'tools/compare-layout.mjs', bad, GEN, '--width', String( width ), '--exclude-button' ] );
    assert.equal( r.code, 1, r.out );
    assert.ok( JSON.parse( r.out ).diffPixels > 0 );
  }
} );

test( 'V9 sanity: without --exclude-button the visible open button is a difference', { skip: SKIP_GEN, timeout: 240000 }, async () => {
  const r = await tool( [ 'tools/compare-layout.mjs', genDrawer, GEN, '--width', '1280' ] );
  assert.equal( r.code, 1, r.out );
} );

for ( const width of [ null, 390 ] ) {
  test( `check-sim still passes on the injected build${width ? ` at ${width}` : ''} with no external request`, { skip: SKIP_GEN, timeout: 240000 }, async () => {
    const r = await tool( [ 'tools/check-sim.mjs', genDrawer, '--quiet', ...( width ? [ '--width', String( width ) ] : [] ) ] );
    const json = JSON.parse( r.out );
    assert.equal( r.code, 0, JSON.stringify( Object.fromEntries( Object.entries( json.checks || {} ).filter( ( [ , v ] ) => !v.ok ) ) ) );
    assert.deepEqual( json.checks.network.external, [] );
  } );
}

test( 'V3 runner: the example generator cases pass on the real build (exit 0)', { skip: SKIP_GEN, timeout: 240000 }, async () => {
  const r = await tool( [ 'tools/run-cases.mjs', genDrawer, 'generator', '--adapter-dir', path.join( ROOT, 'adapters/_example' ) ] );
  assert.equal( r.code, 0, r.out );
  const out = r.out.trim().split( '\n' ).map( l => JSON.parse( l ) );
  assert.ok( out.filter( l => l.type === 'case' ).every( c => c.ok && c.settled && c.screen === '발전기' ) );
  assert.equal( out.at( -1 ).failed, 0 );
} );
