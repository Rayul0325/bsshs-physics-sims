// V9 on every screen: tools/compare-layout.mjs compares the home screen plus each sim screen (the same
// navigation in both builds), not only the first one shown. Backward-compatible CLI; --first-screen keeps
// the old single-screen capture. Real builds: bending-light (selectedScreenProperty) and wave-interference
// (screenIndexProperty + showHomeScreenProperty, home screen outside sim.screens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, OUT, themedBuild, injectTo } from './helpers.mjs';
import { parseCompareArgs } from '../../tools/compare-layout.mjs';

const run = promisify( execFile );
const BL = themedBuild( 'bending-light' );
const WI = themedBuild( 'wave-interference' );
const MOTHA = themedBuild( 'models-of-the-hydrogen-atom' );

/** Runs compare-layout, returning { code, json }. @param {string[]} args */
async function compare( args ) {
  try {
    const { stdout } = await run( process.execPath, [ 'tools/compare-layout.mjs', ...args ], { cwd: ROOT, maxBuffer: 64 << 20, timeout: 600000 } );
    return { code: 0, json: JSON.parse( stdout ) };
  }
  catch ( e ) {
    if ( typeof e.code !== 'number' ) { throw e; }
    return { code: e.code, json: JSON.parse( e.stdout ), out: e.stdout };
  }
}

test( 'CLI: --all-screens is the default; --first-screen keeps the old single capture; old flags still parse', () => {
  assert.equal( parseCompareArgs( [ 'a.html', 'b.html' ] ).allScreens, true );
  assert.equal( parseCompareArgs( [ 'a.html', 'b.html' ] ).pauseClock, false );
  assert.equal( parseCompareArgs( [ 'a.html', 'b.html', '--pause-clock' ] ).pauseClock, true );
  assert.equal( parseCompareArgs( [ 'a.html', 'b.html', '--all-screens' ] ).allScreens, true );
  assert.equal( parseCompareArgs( [ 'a.html', 'b.html', '--first-screen' ] ).allScreens, false );
  const o = parseCompareArgs( [ 'a.html', 'b.html', '--width', '390', '--exclude-button', '--settle=500', '--max-diff-pixels', '3', '--tolerance', '2', '--diff', 'x.png' ] );
  assert.deepEqual( [ o.width, o.excludeButton, o.settle, o.maxDiffPixels, o.tolerance, o.diff ], [ 390, true, 500, 3, 2, 'x.png' ] );
  assert.throws( () => parseCompareArgs( [ 'a.html' ] ) );
} );

for ( const [ id, src, expected ] of [
  [ 'bending-light', BL, [ '홈 화면', '안내', '프리즘', '도구 추가' ] ],
  [ 'wave-interference', WI, [ '홈 화면', '파동', '간섭', '슬릿', '회절' ] ]
] ) {
  test( `V9 all screens: ${id} with the closed drawer equals the plain build on every screen`, { skip: src ? false : `themed ${id} build missing`, timeout: 600000 }, async () => {
    const a = injectTo( src, `v9-${id}.html`, { id, repoRoot: ROOT } );
    const r = await compare( [ a, src, '--width', '1280', '--exclude-button' ] );
    assert.deepEqual( r.json.screens.map( s => s.name ), expected );
    assert.ok( r.json.screens.every( s => s.diffPixels === 0 && s.excluded ), JSON.stringify( r.json.screens ) );
    assert.equal( new Set( r.json.screens.map( s => s.shotSha1 ) ).size, expected.length, 'each screen really rendered' );
    assert.equal( r.code, 0, JSON.stringify( r.json ) );
    assert.equal( r.json.diffPixels, 0 );
  } );
}

test( 'V9 all screens mutation: a drawer that paints only on non-home screens FAILS, the first screen alone passes', { skip: BL ? false : 'themed bending-light build missing', timeout: 600000 }, async () => {
  const good = injectTo( BL, 'v9-bending-light.html', { id: 'bending-light', repoRoot: ROOT } );
  // A 30 px square that appears whenever a sim screen (not the home screen) is selected.
  const bad = path.join( OUT, 'v9-bending-light-bad.html' );
  const html = readFileSync( good, 'utf8' );
  const at = html.lastIndexOf( '</body>' );
  writeFileSync( bad, html.slice( 0, at ) + `<script>
    setInterval( () => {
      const on = window.bsshsDrawer && bsshsDrawer.mounted && !bsshsDrawer.helpers.isHomeScreen();
      let d = document.getElementById( 'v9-bad' );
      if ( on && !d ) { d = document.createElement( 'div' ); d.id = 'v9-bad'; d.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;background:currentColor;z-index:2147483647'; document.body.appendChild( d ); }
      if ( !on && d ) { d.remove(); }
    }, 50 );
  </script>` + html.slice( at ) );
  const first = await compare( [ bad, BL, '--width', '1280', '--exclude-button', '--first-screen' ] );
  assert.equal( first.code, 0, 'the old single capture (home screen) misses it' );
  const all = await compare( [ bad, BL, '--width', '1280', '--exclude-button' ] );
  assert.equal( all.code, 1, JSON.stringify( all.json ) );
  assert.equal( all.json.screens[ 0 ].diffPixels, 0 );
  assert.ok( all.json.screens.slice( 1 ).every( s => s.diffPixels > 0 ) );
} );

test( 'V9 --pause-clock: a screen with a running animation (hydrogen atom 에너지 준위) compares equal, and every screen still renders', { skip: MOTHA ? false : 'themed models-of-the-hydrogen-atom build missing', timeout: 600000 }, async () => {
  const a = injectTo( MOTHA, 'v9-models-of-the-hydrogen-atom.html', { id: 'models-of-the-hydrogen-atom', repoRoot: ROOT } );
  const r = await compare( [ a, MOTHA, '--width', '1280', '--exclude-button', '--pause-clock' ] );
  assert.deepEqual( r.json.screens.map( s => s.name ), [ '홈 화면', '스펙트럼', '에너지 준위' ] );
  assert.deepEqual( r.json.pauseClock, { a: true, b: true } );
  assert.equal( new Set( r.json.screens.map( s => s.shotSha1 ) ).size, 3, 'each screen really rendered while paused' );
  assert.equal( r.code, 0, JSON.stringify( r.json.screens ) );
} );
