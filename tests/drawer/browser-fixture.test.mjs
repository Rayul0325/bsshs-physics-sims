// V4 / V5 / layout on the small fixture page (tests/fixtures/drawer/fake-sim.html) with the fake adapter.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FIX, ROOT, injectTo, fileUrl, contextOptions, launch, drawerReady, touchTargets, textSizes, drawerText } from './helpers.mjs';
import { physicsHash } from '../../drawer/hash.mjs';
import { loadTokens } from '../../theme/index.mjs';

const SRC = path.join( FIX, 'fake-sim.html' );
const OPTS = { id: 'fake-sim', repoRoot: ROOT, adapterDir: path.join( FIX, 'adapters/fake' ), lessonsFile: path.join( FIX, 'lessons/fake-sim.json' ) };
const HASH = physicsHash( 'fake-sim', OPTS );
const tokens = loadTokens();
let browser;
let page1;

before( async () => {
  browser = await launch();
  page1 = injectTo( SRC, 'fake-sim.html', OPTS );
} );
after( async () => { await browser?.close(); } );

/** @param {number} width @param {string} [file] */
async function open( width = 1280, file = page1 ) {
  const context = await browser.newContext( contextOptions( width ) );
  const page = await context.newPage();
  const errors = [];
  page.on( 'pageerror', e => errors.push( String( e ) ) );
  await page.goto( fileUrl( file ) );
  await drawerReady( page );
  return { context, page, errors };
}

const api = ( page, expr, arg ) => page.evaluate( expr, arg );

test( 'V4: recorded rows survive a reload', async () => {
  const { context, page, errors } = await open();
  try {
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    await page.click( '[data-act="record"]' );
    assert.equal( ( await api( page, () => bsshsDrawer.rows() ) ).length, 2 );
    await page.reload();
    await drawerReady( page );
    const rows = await api( page, () => bsshsDrawer.rows() );
    assert.equal( rows.length, 2 );
    assert.equal( rows[ 0 ].screen, '광전 효과' );
    assert.ok( Math.abs( rows[ 0 ].values.photonEnergy - 1239.84198 / 400 ) < 1e-9 );
    const keys = await api( page, () => Object.keys( localStorage ) );
    assert.deepEqual( keys.filter( k => k.startsWith( 'bsshs:log:' ) ), [ 'bsshs:log:fake-sim:v2' ] );
    await page.click( '[data-act="open"]' );
    const rowCount = await page.locator( '.log-table tbody tr' ).count();
    assert.equal( rowCount, 2 );
    assert.deepEqual( errors, [] );
  }
  finally { await context.close(); }
} );

test( 'V4: the sim Reset All does not clear the log', async () => {
  const { context, page } = await open();
  try {
    await api( page, () => { bsshsDrawer.record(); bsshsDrawer.record(); } );
    await page.click( '#reset-all' );
    assert.equal( ( await api( page, () => bsshsDrawer.rows() ) ).length, 2 );
    await page.reload();
    await drawerReady( page );
    assert.equal( ( await api( page, () => bsshsDrawer.rows() ) ).length, 2 );
  }
  finally { await context.close(); }
} );

test( 'V4: 「새 실험 시작」 is at the top in the accent color; confirm clears only this sim', async () => {
  const { context, page } = await open();
  try {
    await api( page, () => {
      localStorage.setItem( 'bsshs:log:other-sim:v1', JSON.stringify( { version: 1, measurements: [], rows: [ { time: 0, screen: 'x', values: {} } ] } ) );
      bsshsDrawer.record();
    } );
    await page.click( '[data-act="open"]' );
    const btn = page.locator( '[data-act="new-experiment"]' );
    assert.equal( ( await btn.textContent() ).trim(), '새 실험 시작' );
    const style = await btn.evaluate( e => { const s = getComputedStyle( e ); return { color: s.color, border: s.borderTopColor }; } );
    const accent = await page.evaluate( hex => { const d = document.createElement( 'div' ); d.style.color = hex; document.body.appendChild( d ); const c = getComputedStyle( d ).color; d.remove(); return c; }, tokens.color.accent );
    assert.ok( style.color === accent || style.border === accent, `accent ${accent} vs ${JSON.stringify( style )}` );
    // First control in the log tab.
    const first = await page.evaluate( () => document.getElementById( 'bsshs-drawer-host' ).shadowRoot.querySelector( '[data-panel="log"] button' ).dataset.act );
    assert.equal( first, 'new-experiment' );
    // Cancel keeps rows.
    await btn.click();
    await page.click( '[data-act="cancel-clear"]' );
    assert.equal( ( await api( page, () => bsshsDrawer.rows() ) ).length, 1 );
    await btn.click();
    assert.ok( await page.locator( '.confirm' ).isVisible() );
    await page.click( '[data-act="confirm-clear"]' );
    assert.equal( ( await api( page, () => bsshsDrawer.rows() ) ).length, 0 );
    assert.ok( await api( page, () => localStorage.getItem( 'bsshs:log:other-sim:v1' ) !== null ), 'other sims untouched' );
    await page.reload();
    await drawerReady( page );
    assert.equal( ( await api( page, () => bsshsDrawer.rows() ) ).length, 0 );
  }
  finally { await context.close(); }
} );

test( 'V4: after a screen change rows go to the same log with the right 화면', async () => {
  const { context, page } = await open();
  try {
    await api( page, () => bsshsDrawer.record() );
    await page.click( '#next-screen' );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    const rows = await api( page, () => bsshsDrawer.rows() );
    assert.deepEqual( rows.map( r => r.screen ), [ '광전 효과', '금속 비교' ] );
    assert.equal( rows[ 1 ].values.wavelength, 600 );
    const head = await page.locator( '.log-table thead' ).innerText();
    assert.match( head, /화면/ );
    assert.match( await page.locator( '.log-table tbody tr' ).nth( 1 ).innerText(), /금속 비교/ );
  }
  finally { await context.close(); }
} );

test( 'V4: CSV starts with the BOM and has Korean headers (API and download button)', async () => {
  const { context, page } = await open();
  try {
    await api( page, () => bsshsDrawer.record() );
    const csv = await api( page, () => bsshsDrawer.exportCsv() );
    assert.equal( csv.charCodeAt( 0 ), 0xFEFF );
    assert.match( csv, /^\uFEFF시각,화면,파장 \(nm\),파장 \(m\),진동수 \(Hz\),광자 에너지 \(eV\),광자 에너지 \(J\),정지 전압 \(V\)\r\n/ );
    await page.click( '[data-act="open"]' );
    const [ dl ] = await Promise.all( [ page.waitForEvent( 'download' ), page.click( '[data-act="csv"]' ) ] );
    const bytes = readFileSync( await dl.path() );
    assert.deepEqual( [ ...bytes.subarray( 0, 3 ) ], [ 0xEF, 0xBB, 0xBF ] );
    assert.match( bytes.toString( 'utf8' ), /시각,화면/ );
    assert.match( dl.suggestedFilename(), /fake-sim.*\.csv$/ );
  }
  finally { await context.close(); }
} );

test( 'V4: graphs — predefined (≥2) with a linear trend line, free graph, PNG export non-empty', async () => {
  const { context, page } = await open();
  try {
    await api( page, async () => {
      for ( const w of [ 300, 400, 500, 600 ] ) { window.fakeSim.screens[ 0 ].model.wavelength = w; bsshsDrawer.record(); }
    } );
    await api( page, () => bsshsDrawer.open( 'graphs' ) );
    const options = await page.locator( '[data-ctl="graph"] option' ).allTextContents();
    assert.ok( options.length >= 3, options.join( '|' ) ); // 3 predefined + free
    assert.ok( options.some( o => /자유/.test( o ) ) );
    await page.selectOption( '[data-ctl="graph"]', 'energy-and-voltage' );
    const info = await page.locator( '.fit-info' ).innerText();
    assert.match( info, /기울기/ );
    assert.match( info, /절편/ );
    // photonEnergy vs frequency is exactly linear with slope h/e.
    const fit = await api( page, () => bsshsDrawer.fits( 'energy-vs-frequency' ) );
    assert.ok( Math.abs( fit[ 0 ].slope - 6.62607015e-34 / 1.602176634e-19 ) / ( 6.62607015e-34 / 1.602176634e-19 ) < 1e-4, JSON.stringify( fit ) );
    await page.selectOption( '[data-ctl="graph"]', 'free' );
    await page.selectOption( '[data-ctl="x"]', 'wavelength@class' );
    await page.selectOption( '[data-ctl="y"]', 'stoppingVoltage' );
    for ( const id of [ 'energy-vs-frequency', 'energy-and-voltage', 'energy-vs-wavelength', 'free' ] ) {
      const png = await api( page, async gid => { const b = await bsshsDrawer.exportPng( gid ); const a = new Uint8Array( await b.arrayBuffer() ); return { size: b.size, type: b.type, sig: [ ...a.slice( 0, 4 ) ] }; }, id );
      assert.equal( png.type, 'image/png' );
      assert.ok( png.size > 1000, `${id}: ${png.size}` );
      assert.deepEqual( png.sig, [ 0x89, 0x50, 0x4E, 0x47 ] );
    }
    const [ dl ] = await Promise.all( [ page.waitForEvent( 'download' ), page.click( '[data-act="png"]' ) ] );
    assert.ok( readFileSync( await dl.path() ).length > 1000 );
  }
  finally { await context.close(); }
} );

test( 'V4: a definition-version bump offers the old log as CSV, then clears it (never mixed)', async () => {
  const { context, page } = await open();
  try {
    await api( page, () => localStorage.setItem( 'bsshs:log:fake-sim:v1', JSON.stringify( {
      version: 1,
      measurements: [ { key: 'oldThing', name: '옛 항목', unit: 'cm' } ],
      rows: [ { time: '2026-11-01T00:00:00Z', screen: '옛 화면', values: { oldThing: 7 } } ]
    } ) ) );
    await page.reload();
    await drawerReady( page );
    assert.equal( ( await api( page, () => bsshsDrawer.rows() ) ).length, 0, 'old rows are not in the new table' );
    assert.deepEqual( await api( page, () => bsshsDrawer.legacy() ), [ { version: 1, rows: 1 } ] );
    await page.click( '[data-act="open"]' );
    assert.ok( await page.locator( '.legacy' ).isVisible() );
    const [ dl ] = await Promise.all( [ page.waitForEvent( 'download' ), page.click( '[data-act="legacy-download"]' ) ] );
    const text = readFileSync( await dl.path(), 'utf8' );
    assert.equal( text.charCodeAt( 0 ), 0xFEFF );
    assert.match( text, /옛 항목 \(cm\)/ );
    assert.match( text, /옛 화면,7/ );
    assert.equal( await api( page, () => localStorage.getItem( 'bsshs:log:fake-sim:v1' ) ), null );
    assert.deepEqual( await api( page, () => bsshsDrawer.legacy() ), [] );
    assert.ok( !( await page.locator( '.legacy' ).isVisible() ) );
  }
  finally { await context.close(); }
} );

test( 'V5: all three states render; a hash mismatch shows 확인 중', async () => {
  const cases = [
    [ { status: '확인 완료', date: '2026-11-04', memo: '', approvedHash: HASH }, '선생님 확인 완료' ],
    [ { status: '확인 완료', date: '2026-11-04', memo: '', approvedHash: 'f'.repeat( 64 ) }, '선생님 확인 중' ],
    [ { status: '수정 중', date: '2026-11-04', memo: '' }, '수정 중' ],
    [ { status: '확인 중', date: '2026-11-04', memo: '' }, '선생님 확인 중' ]
  ];
  for ( const [ i, [ entry, label ] ] of cases.entries() ) {
    const file = injectTo( SRC, `fake-status-${i}.html`, { ...OPTS, status: { 'fake-sim': entry } } );
    const { context, page } = await open( 1280, file );
    try {
      await page.click( '[data-act="open"]' );
      assert.equal( ( await page.locator( '.status' ).innerText() ).trim().split( '\n' )[ 0 ].replace( /\s*·.*$/, '' ), label );
      assert.equal( ( await api( page, () => bsshsDrawer.status() ) ).label, label );
      // 수정 중 hides nothing.
      assert.ok( await page.locator( '[data-act="record"]' ).isVisible() );
      await page.click( '[role="tab"][data-tab="graphs"]' );
      assert.ok( await page.locator( 'canvas' ).isVisible() );
    }
    finally { await context.close(); }
  }
} );

test( 'lessons tab: formulas, terms, both marks, substitution, never the sources field', async () => {
  const { context, page } = await open();
  try {
    await api( page, () => bsshsDrawer.open( 'lessons' ) );
    const text = await drawerText( page );
    for ( const s of [ '광자의 에너지', 'E = hf', '광자', '일함수', '수업 강조', '참고 · 시험 범위 아님', '참고: 근사 때문에' ] ) {
      assert.ok( text.includes( s ), `missing ${s}` );
    }
    assert.ok( !text.includes( 'SECRET-SOURCE-MARKER' ) );
    assert.doesNotMatch( text, /\d{4}-\d{2}-\d{2}_[^\s]+?_[0-9a-f]{8}/ );
    assert.doesNotMatch( text, /sources|출처 기록/ );
    const html = await page.evaluate( () => document.documentElement.outerHTML + document.getElementById( 'bsshs-drawer-host' ).shadowRoot.innerHTML );
    assert.ok( !html.includes( 'SECRET-SOURCE-MARKER' ) );
    // E = hf: every variable is measured or a constant → substituted values shown.
    const sub = await page.locator( '[data-formula="photon_energy"] .subst' ).innerText();
    assert.match( sub, /E = .*J/ );
    assert.match( sub, /f = .*Hz/ );
    assert.equal( await page.locator( '[data-formula="work_function"] .subst' ).count(), 0 );
    assert.doesNotMatch( text, /PhET/ );
  }
  finally { await context.close(); }
} );

test( 'drawer-only readout: live values appear inside the drawer, nothing is added to the page', async () => {
  const { context, page } = await open();
  try {
    const bodyBefore = await page.evaluate( () => [ ...document.body.children ].map( e => e.id || e.tagName ).join( ',' ) );
    await page.click( '[data-act="open"]' );
    await page.waitForTimeout( 700 );
    const live = await page.locator( '.live' ).innerText();
    assert.match( live, /광자 에너지/ );
    assert.match( live, /3\.1/ ); // 1239.84 / 400 eV
    const bodyAfter = await page.evaluate( () => [ ...document.body.children ].map( e => e.id || e.tagName ).join( ',' ) );
    assert.equal( bodyAfter, bodyBefore );
  }
  finally { await context.close(); }
} );

test( 'pointer and key events inside the drawer never reach the sim', async () => {
  const { context, page } = await open();
  try {
    const before0 = await api( page, () => window.simPointerEvents );
    await page.click( '[data-act="open"]' );
    await page.click( '[data-act="record"]' );
    await page.click( '[role="tab"][data-tab="lessons"]' );
    await page.keyboard.press( 'Tab' );
    assert.equal( await api( page, () => window.simPointerEvents ), before0 );
  }
  finally { await context.close(); }
} );

test( 'layout: bottom sheet at 390, side drawer at 1280; closed = only the button', async () => {
  for ( const width of [ 390, 1280 ] ) {
    const { context, page } = await open( width );
    try {
      const closed = await page.evaluate( () => { const r = document.getElementById( 'bsshs-drawer-host' ).shadowRoot; return getComputedStyle( r.querySelector( '.panel' ) ).visibility; } );
      assert.equal( closed, 'hidden' );
      await page.click( '[data-act="open"]' );
      await page.waitForTimeout( 400 );
      const g = await page.evaluate( () => {
        const r = document.getElementById( 'bsshs-drawer-host' ).shadowRoot.querySelector( '.panel' ).getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, mode: bsshsDrawer.layout().mode };
      } );
      if ( width === 390 ) {
        assert.equal( g.mode, 'sheet' );
        assert.equal( Math.round( g.w ), g.iw );
        assert.equal( Math.round( g.y + g.h ), g.ih );
        assert.ok( g.h < g.ih, 'a sheet, not a full page' );
      }
      else {
        assert.equal( g.mode, 'side' );
        assert.equal( Math.round( g.x + g.w ), g.iw );
        assert.equal( Math.round( g.h ), g.ih );
        assert.ok( g.w < g.iw / 2 );
      }
      for ( const tab of [ 'log', 'graphs', 'lessons' ] ) {
        await api( page, t => bsshsDrawer.open( t ), tab );
        const small = ( await touchTargets( page ) ).filter( t => t.w < 44 || t.h < 44 );
        assert.deepEqual( small, [], `${width} ${tab}` );
      }
      const btn = await page.evaluate( () => bsshsDrawer.buttonRect() );
      assert.ok( btn.width >= 44 && btn.height >= 44 );
    }
    finally { await context.close(); }
  }
} );

test( 'layout: body text is ≥18px at 1600 wide', async () => {
  const { context, page } = await open( 1600, page1 );
  try {
    await api( page, () => { bsshsDrawer.record(); } );
    for ( const tab of [ 'log', 'graphs', 'lessons' ] ) {
      await api( page, t => bsshsDrawer.open( t ), tab );
      const small = ( await textSizes( page ) ).filter( t => t.size < 18 );
      assert.deepEqual( small, [], tab );
    }
  }
  finally { await context.close(); }
} );

test( 'numbers: superscript exponents in the table, current values and graph axes; CSV stays machine-readable', async () => {
  const { context, page } = await open();
  try {
    await api( page, () => { bsshsDrawer.record(); window.fakeSim.screens[ 0 ].model.wavelength = 500; bsshsDrawer.record(); } );
    await page.click( '[data-act="open"]' );
    await page.waitForTimeout( 700 );
    const live = await page.locator( '.live' ).innerText();
    const table = await page.locator( '.log-table' ).innerText();
    for ( const [ where, text ] of [ [ 'live', live ], [ 'table', table ] ] ) {
      assert.match( text, /×10¹⁴/, `${where}: Hz values like 7.495×10¹⁴` );
      assert.match( text, /×10⁻⁷/, `${where}: m values like 4×10⁻⁷` );
      assert.doesNotMatch( text, /\^|e[-+]\d/, `${where}: no caret or e-notation` );
    }
    // Graph axis tick labels go through the same formatter: frequency axis of energy-vs-frequency.
    const labels = await page.evaluate( () => {
      const seen = [];
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function( t, ...r ) { seen.push( String( t ) ); return orig.call( this, t, ...r ); };
      return bsshsDrawer.exportPng( 'energy-vs-frequency' ).then( () => { CanvasRenderingContext2D.prototype.fillText = orig; return seen; } );
    } );
    assert.ok( labels.some( t => /×10¹⁴/.test( t ) ), labels.join( ' | ' ) );
    assert.ok( !labels.some( t => /\^/.test( t ) ) );
    const csv = await api( page, () => bsshsDrawer.exportCsv() );
    const row = csv.slice( 1 ).split( '\r\n' )[ 1 ].split( ',' ).slice( 2 );
    for ( const c of row ) { assert.ok( c === '' || Number.isFinite( Number( c ) ), `csv cell ${c}` ); }
    assert.doesNotMatch( csv, /[⁰-₟²³¹×]/ );
  }
  finally { await context.close(); }
} );

test( 'graph text (ticks, axis labels, title, fit lines) is ≥18px at 1600 wide', async () => {
  const { context, page } = await open( 1600 );
  try {
    await api( page, () => { for ( const w of [ 300, 400, 500 ] ) { window.fakeSim.screens[ 0 ].model.wavelength = w; bsshsDrawer.record(); } } );
    const seen = await api( page, async () => {
      const out = [];
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function( t, ...r ) {
        if ( this.canvas.isConnected ) { out.push( { t: String( t ), px: parseFloat( /(\d+(?:\.\d+)?)px/.exec( this.font )[ 1 ] ) } ); }
        return orig.call( this, t, ...r );
      };
      bsshsDrawer.open( 'graphs' );
      await new Promise( r => setTimeout( r, 300 ) );
      CanvasRenderingContext2D.prototype.fillText = orig;
      return out;
    } );
    const ticks = seen.filter( s => /^-?[\d.]+(×10.*)?$/.test( s.t ) );
    assert.ok( ticks.length >= 4, JSON.stringify( seen ) );
    assert.deepEqual( seen.filter( s => s.px < 18 ), [] );
  }
  finally { await context.close(); }
} );
