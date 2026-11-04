// Unit tests for the verify orchestration rules (tools/lib/verify-core.mjs): report aggregation, the
// --only filter, the exclusion rule (spec 3.6), the patch allow-list (V10b) and the name-scan redaction (V10c).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOnly, makeResult, aggregate, summaryLine, exclusionsFromV3, buildCount,
  checkPatchAllowlist, parsePatchLine, isAllowed, parseNames, nameNeedles, scanForNames, groupTestEvents, pool
} from '../../tools/lib/verify-core.mjs';
import { ALL_RULES } from '../../theme/patches/index.mjs';

test( '--only selects ids in report order; V10 expands; unknown ids are refused', () => {
  assert.deepEqual( parseOnly( 'v9,V2' ), [ 'V2', 'V9' ] );
  assert.deepEqual( parseOnly( 'V10' ), [ 'V10a', 'V10b', 'V10c' ] );
  assert.equal( parseOnly( null ).length, 11 );
  assert.throws( () => parseOnly( 'V7' ), /unknown check V7/ );
} );

test( 'aggregation: a check passes only with exit 0, no failures, and every unit passed; a skipped check fails', () => {
  const ok = makeResult( 'V2', { passed: 136, total: 136 } );
  const partial = makeResult( 'V3', { passed: 13, total: 14, failures: [ { id: 'bsshs-laser', error: 'case x' } ] } );
  const empty = makeResult( 'V9', { passed: 0, total: 0 } );
  const badExit = makeResult( 'V1', { passed: 68, total: 68, exitCode: 2 } );
  assert.equal( ok.ok, true );
  assert.equal( partial.ok, false );
  assert.equal( empty.ok, false, 'nothing checked is not a pass' );
  assert.equal( badExit.ok, false );
  const report = aggregate( [ ok, partial ], { selected: [ 'V2', 'V3', 'V6' ], startedAt: 't', ms: 1 } );
  assert.equal( report.ok, false );
  assert.deepEqual( report.failed, [ 'V3', 'V6' ] );
  assert.equal( report.checks.find( c => c.id === 'V6' ).failures[ 0 ].error, 'check did not run' );
  assert.equal( aggregate( [ ok ], { selected: [ 'V2' ], startedAt: 't', ms: 1 } ).ok, true );
  assert.match( summaryLine( ok ), /^통과 +V2 +check-sim 136\/136$/ );
  assert.match( summaryLine( partial ), /^실패 +V3 .* 13\/14 — 실패 1건: bsshs-laser case x$/ );
} );

test( 'exclusion rule: only a NEW sim that fails V3 is excluded; V1 then counts below 68 and fails', () => {
  const newIds = [ 'bsshs-laser', 'bsshs-compton' ];
  const v3 = [ { id: 'bsshs-laser', ok: false }, { id: 'bsshs-compton', ok: true }, { id: 'generator', ok: false } ];
  const ex = exclusionsFromV3( v3, newIds );
  assert.deepEqual( ex.map( e => e.id ), [ 'bsshs-laser' ], 'a failing PhET sim is reported by V3, not excluded' );
  const expected = [ 'generator', 'bsshs-laser', 'bsshs-compton' ];
  const counted = buildCount( { expected, built: expected, published: [ 'generator', 'bsshs-compton' ], excluded: ex } );
  assert.equal( counted.passed, 2 );
  assert.equal( counted.total, 3 );
  assert.equal( makeResult( 'V1', counted ).ok, false, 'an excluded sim never passes V1 silently' );
  assert.match( counted.failures[ 0 ].reason, /공개 제외/ );
  const all = buildCount( { expected, built: expected, published: expected, excluded: [] } );
  assert.equal( makeResult( 'V1', all ).ok, true );
  const missing = buildCount( { expected, built: [ 'generator' ], published: expected, excluded: [] } );
  assert.equal( missing.passed, 1 );
  const extra = buildCount( { expected, built: expected, published: [ ...expected, 'stray' ], excluded: [] } );
  assert.equal( makeResult( 'V1', extra ).ok, false );
} );

test( 'allow-list: every real rule (theme, brand, telemetry) declares only allow-listed files', () => {
  const r = checkPatchAllowlist( { rules: ALL_RULES, records: [ { id: 'x', patches: [], overlays: [], trackedChangesAfterBuild: [] } ] } );
  assert.deepEqual( r.failures, [] );
  assert.ok( r.filesChecked >= ALL_RULES.length );
} );

test( 'allow-list: a rule or a recorded write outside the list fails, naming the sim and file', () => {
  const termsRule = { id: 'terms-ko-strings', kind: 'terms', repo: 'babel', files: [ 'generator/generator-strings_ko.json' ] };
  const strayRule = { id: 'theme-model', kind: 'theme', repo: 'faradays-law', files: [ 'js/model/Magnet.js' ] };
  assert.equal( checkPatchAllowlist( { rules: [ strayRule ], records: [] } ).failures.length, 1 );
  assert.equal( checkPatchAllowlist( { rules: [ { ...termsRule, kind: 'drawer' } ], records: [] } ).failures.length, 1 );
  const good = { id: 'generator', patches: [ 'terms-ko-strings: applied (generator/generator-strings_ko.json: replaced; joist/joist-strings_ko.json: no change)' ], overlays: [], trackedChangesAfterBuild: [] };
  assert.deepEqual( checkPatchAllowlist( { rules: [ termsRule ], records: [ good ] } ).failures, [] );
  const wroteCode = { ...good, patches: [ 'terms-ko-strings: applied (generator/js/Generator.js: edits 1)' ] };
  const res = checkPatchAllowlist( { rules: [ termsRule ], records: [ wroteCode ] } );
  assert.equal( res.passed, 0 );
  assert.match( res.failures[ 0 ].reason, /babel\/generator\/js\/Generator\.js, not allow-listed/ );
  const unknown = { ...good, patches: [ 'secret-rule: applied (a.js: replaced)' ] };
  assert.match( checkPatchAllowlist( { rules: [ termsRule ], records: [ unknown ] } ).failures[ 0 ].reason, /unknown patch rule/ );
  const dirty = { ...good, trackedChangesAfterBuild: [ 'sun/js/Panel.js' ] };
  assert.match( checkPatchAllowlist( { rules: [ termsRule ], records: [ dirty ] } ).failures[ 0 ].reason, /not clean/ );
  const overlay = { ...good, overlays: [ 'package.json phet.supportedBrands += adapted-from-phet (throwaway checkout, reverted after build)', 'sim js edited' ] };
  const o = checkPatchAllowlist( { rules: [ termsRule ], records: [ overlay ] } );
  assert.equal( o.failures.length, 1 );
  assert.match( o.failures[ 0 ].reason, /overlay not allow-listed: sim js edited/ );
} );

test( 'parsePatchLine lists only files the engine actually wrote', () => {
  assert.deepEqual( parsePatchLine( 'theme-slider-thumb: applied (js/SliderThumb.js: edits 1/1; js/Slider.js: edits 1/1; js/HSlider.js: no change)' ),
    { id: 'theme-slider-thumb', status: 'applied', written: [ 'js/SliderThumb.js', 'js/Slider.js' ] } );
  assert.deepEqual( parsePatchLine( 'brand-splash-module: skipped (no candidate file)' ), { id: 'brand-splash-module', status: 'skipped', written: [] } );
  assert.equal( parsePatchLine( 'garbage' ).id, null );
  assert.equal( isAllowed( 'terms', 'babel', 'joist/joist-strings_ko.json' ), true );
  assert.equal( isAllowed( 'terms', 'babel', 'joist/joist-strings_en.json' ), false );
  assert.equal( isAllowed( 'theme', 'sun', 'js/Panel.js' ), true );
  assert.equal( isAllowed( 'theme', 'sun', 'js/buttons/RoundButton.js' ), false );
} );

test( 'name scan: finds UTF-8 (NFC and NFD), \\u escapes and HTML entities; the result never contains a name', () => {
  const names = parseNames( '홍길동\n\n# comment\nx\n  Jane Roe  \n' );
  assert.deepEqual( names, [ '홍길동', 'Jane Roe' ] );
  const files = [
    { label: 'a.html', read: () => Buffer.from( '<p>홍길동</p>' ) },
    { label: 'b.js', read: () => Buffer.from( 'var s="\\ud64d\\uae38\\ub3d9"; var t="\\uD64D\\uAE38\\uB3D9";' ) },
    { label: 'c.html', read: () => Buffer.from( '<title>&#54861;&#44600;&#46041;</title> &#xd64d;&#xae38;&#xb3d9;' ) },
    { label: 'd.txt', read: () => Buffer.from( '홍길동'.normalize( 'NFD' ) ) },
    { label: 'e.txt', read: () => Buffer.from( 'jane roe; Jane Roe' ) },
    { label: 'clean.html', read: () => Buffer.from( '<p>부산과학고</p>' ) }
  ];
  const r = scanForNames( files, names );
  assert.deepEqual( r.hitFiles, [ { file: 'a.html', hits: 1 }, { file: 'b.js', hits: 2 }, { file: 'c.html', hits: 2 }, { file: 'd.txt', hits: 1 }, { file: 'e.txt', hits: 1 } ] );
  assert.equal( r.totalHits, 7 );
  assert.equal( r.scanned, 6 );
  const text = JSON.stringify( r );
  for ( const n of names ) {
    for ( const needle of nameNeedles( n ) ) { assert.ok( !text.includes( needle.toString( 'utf8' ) ), 'redacted' ); }
    assert.ok( !text.includes( n.slice( 0, 2 ) ) );
  }
  assert.deepEqual( scanForNames( [ files[ 5 ] ], names ).hitFiles, [] );
} );

test( 'test events split into V-groups; a skipped group member fails its V-item but not the whole run', () => {
  const root = '/r';
  const ev = ( name, file, extra = {} ) => ( { event: 'pass', name, file: `${root}/${file}`, skip: false, todo: false, ...extra } );
  const g = groupTestEvents( [
    ev( 'V4: rows survive a reload', 'tests/drawer/browser-fixture.test.mjs' ),
    ev( 'V5: all three states render', 'tests/drawer/browser-fixture.test.mjs' ),
    ev( 'physicsHash is stable', 'tests/drawer/hash.test.mjs' ),
    ev( 'footer', 'tests/site/site-browser.test.mjs', { skip: 'no site build' } ),
    ev( 'tokens', 'tests/theme/no-literals.test.mjs' ),
    ev( 'other', 'tests/tools/cli-args.test.mjs', { event: 'fail', error: 'boom' } )
  ], root );
  assert.deepEqual( [ g.V4.passed, g.V4.total ], [ 1, 1 ] );
  assert.deepEqual( [ g.V5.passed, g.V5.total ], [ 2, 2 ] );
  assert.deepEqual( [ g.V6.passed, g.V6.total ], [ 0, 1 ] );
  assert.match( g.V6.failures[ 0 ].error, /건너뜀/ );
  assert.deepEqual( [ g.V10a.passed, g.V10a.total ], [ 1, 1 ] );
  assert.deepEqual( [ g.TEST.passed, g.TEST.total, g.TEST.failures.length ], [ 5, 6, 1 ] );
} );

test( 'pool keeps order and never runs more than its size at once', async () => {
  let live = 0;
  let peak = 0;
  const out = await pool( [ 5, 1, 3, 2, 4 ], 2, async x => {
    live++; peak = Math.max( peak, live );
    await new Promise( r => setTimeout( r, x ) );
    live--;
    return x * 10;
  } );
  assert.deepEqual( out, [ 50, 10, 30, 20, 40 ] );
  assert.equal( peak, 2 );
} );

test( 'build-everything: matrices lose machine paths and keep a stable row order', async () => {
  const { normalizeMatrix } = await import( '../../tools/build-everything.mjs' );
  const m = { summary: { failed: [] }, sims: [
    { id: 'b', strictError: 'tsc: Cannot read /home/u/.cache/x/slots/slot-3/phet-io/a.json', logPath: 'logs/b.log' },
    { id: 'a', error: null, note: '/repo/root/build/a.html' }
  ] };
  const n = normalizeMatrix( m, { cache: '/home/u/.cache/x', repo: '/repo/root', order: [ 'a', 'b' ] } );
  assert.deepEqual( n.sims.map( r => r.id ), [ 'a', 'b' ] );
  assert.equal( n.sims[ 1 ].strictError, 'tsc: Cannot read $BSSHS_CACHE/slots/slot-3/phet-io/a.json' );
  assert.equal( n.sims[ 0 ].note, './build/a.html' );
  assert.equal( n.sims[ 0 ].error, null );
  assert.deepEqual( normalizeMatrix( n, { cache: '/home/u/.cache/x', repo: '/repo/root', order: [ 'a', 'b' ] } ), n, 'idempotent' );
  assert.equal( m.sims[ 0 ].id, 'b', 'input untouched' );
} );

test( 'build-everything: a no-op rerun keeps the previous generatedAt, a real change takes the new one', async () => {
  const { keepStableTimestamp } = await import( '../../tools/build-everything.mjs' );
  const prev = { generatedAt: 'old', sims: [ { id: 'a', builtAt: 't1' } ] };
  assert.equal( keepStableTimestamp( prev, { generatedAt: 'new', sims: [ { id: 'a', builtAt: 't1' } ] } ).generatedAt, 'old' );
  assert.equal( keepStableTimestamp( prev, { generatedAt: 'new', sims: [ { id: 'a', builtAt: 't2' } ] } ).generatedAt, 'new' );
  assert.equal( keepStableTimestamp( null, { generatedAt: 'new', sims: [] } ).generatedAt, 'new' );
} );
