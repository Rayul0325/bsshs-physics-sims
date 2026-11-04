// Korean term corrections: data shape, no dead fixes against the pinned string tables, the build-time
// override, and (when themed builds exist) the built pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSims } from '../../tools/lib/sims.mjs';
import {
  TERM_FIXES_FILE, TITLES_FILE, REASONS, loadTermFixes, validateTermFixes, fixesForSim, applyFixesToValue,
  rewriteKoStrings, targetFiles, termFixRules, termFixesHash, titleFromTables
} from '../../theme/patches/terms.mjs';
import { transformFile } from '../../theme/patches/engine.mjs';
import { loadPinnedTables, readBuilt, koStringsOf, chipperKey, packedHas, isPlain } from './helpers.mjs';

const data = await loadTermFixes();
const sims = await loadSims();
const simIds = sims.map( s => s.id );
const pinned = await loadPinnedTables();
const skipNoCache = pinned ? false : 'source cache (~/.cache/bsshs-physics-sims) is not fetched';

test( 'term-fixes.json has the pinned shape and only the allowed reasons', () => {
  assert.deepEqual( validateTermFixes( data ), [] );
  assert.deepEqual( Object.keys( data ).sort(), [ 'global', 'perSim' ] );
  for ( const item of [ ...data.global, ...Object.values( data.perSim ).flat() ] ) {
    assert.deepEqual( Object.keys( item ).sort(), [ 'from', 'reason', 'to' ] );
    assert.ok( REASONS.includes( item.reason ), item.reason );
  }
  for ( const id of Object.keys( data.perSim ) ) { assert.ok( simIds.includes( id ), `perSim key ${id} is not one of the 63 sims` ); }
  assert.ok( data.global.length + Object.values( data.perSim ).flat().length > 0 );
} );

test( 'the validator rejects bad shapes', () => {
  assert.ok( validateTermFixes( [] ).length );
  assert.ok( validateTermFixes( { global: [], perSim: {}, extra: 1 } ).length );
  assert.ok( validateTermFixes( { global: [ { from: 'a', to: 'b' } ], perSim: {} } ).length, 'missing reason' );
  assert.ok( validateTermFixes( { global: [ { from: 'a', to: 'b', reason: 'x' } ], perSim: {} } ).length, 'bad reason' );
  assert.ok( validateTermFixes( { global: [ { from: 'a', to: 'a', reason: '표기' } ], perSim: {} } ).length, 'no-op fix' );
  assert.ok( validateTermFixes( { global: [], perSim: { 'Bad Id': [] } } ).length );
  assert.ok( validateTermFixes( { global: [ { from: 'a', to: 'b', reason: '표기', x: 1 } ], perSim: {} } ).length, 'extra field' );
  assert.deepEqual( validateTermFixes( { global: [], perSim: {} } ), [] );
} );

test( 'the class-terminology examples from the spec are recorded', () => {
  const all = [ ...data.global, ...Object.values( data.perSim ).flat() ].map( i => `${i.from}>${i.to}` );
  for ( const pair of [ '콘덴서>축전기', '푸우리에>푸리에', '죤 트라볼티지>존 트라볼티지' ] ) {
    assert.ok( all.some( p => p.startsWith( pair ) || p === pair ), `${pair} missing` );
  }
} );

test( 'titles.json lists all 63 sims with the corrected title', async () => {
  const titles = JSON.parse( await readFile( TITLES_FILE, 'utf8' ) );
  assert.deepEqual( Object.keys( titles ).sort(), [ ...simIds ].sort() );
  assert.equal( simIds.length, 63 );
  for ( const [ id, t ] of Object.entries( titles ) ) { assert.ok( typeof t === 'string' && t.trim() === t && t.length > 0, `${id}: ${JSON.stringify( t )}` ); }
  for ( const bad of [ '콘덴서', '푸우리에', '죤', '파라데이' ] ) {
    assert.ok( !Object.values( titles ).some( t => t.includes( bad ) ), `a title still contains ${bad}` );
  }
} );

test( 'titles.json equals the pinned title with the fixes applied', { skip: skipNoCache }, async () => {
  const titles = JSON.parse( await readFile( TITLES_FILE, 'utf8' ) );
  for ( const { id, tables } of pinned ) { assert.equal( titles[ id ], titleFromTables( id, tables, data ), id ); }
} );

test( 'no dead fixes: every from exists in the live Korean strings it targets', { skip: skipNoCache }, () => {
  const liveValues = id => pinned.find( p => p.id === id ).tables.flatMap( t => t.strings.filter( s => s.live ).map( s => s.value ) );
  for ( const [ id, list ] of Object.entries( data.perSim ) ) {
    const values = liveValues( id );
    for ( const f of list ) { assert.ok( values.some( v => v.includes( f.from ) ), `${id}: dead fix ${JSON.stringify( f.from )}` ); }
  }
  const everything = pinned.flatMap( p => liveValues( p.id ) );
  for ( const f of data.global ) { assert.ok( everything.some( v => v.includes( f.from ) ), `global: dead fix ${JSON.stringify( f.from )}` ); }
} );

test( 'a fix never re-creates another fix\'s original text, and corrected text is stable', { skip: skipNoCache }, () => {
  for ( const { id, tables } of pinned ) {
    const fixes = fixesForSim( data, id );
    for ( const t of tables ) for ( const s of t.strings ) {
      const once = applyFixesToValue( s.value, fixes );
      assert.equal( applyFixesToValue( once, fixes ), once, `${id} ${t.repo}/${s.key} is not stable under a second pass` );
    }
  }
} );

test( 'applyFixesToValue replaces every occurrence in order; perSim comes before global', () => {
  assert.equal( applyFixesToValue( '가가 나', [ { from: '가', to: '다' } ] ), '다다 나' );
  const d = { global: [ { from: 'x', to: 'y', reason: '표기' } ], perSim: { s: [ { from: 'xx', to: 'z', reason: '표기' } ] } };
  assert.deepEqual( fixesForSim( d, 's' ).map( f => f.from ), [ 'xx', 'x' ] );
  assert.deepEqual( fixesForSim( d, 'other' ).map( f => f.from ), [ 'x' ] );
  assert.equal( applyFixesToValue( 'xx', fixesForSim( d, 's' ) ), 'z' );
} );

test( 'rewriteKoStrings handles flat and nested layouts and leaves untouched files byte-identical', () => {
  const fixes = [ { from: '콘덴서', to: '축전기', reason: '수업 용어' } ];
  const flat = JSON.parse( rewriteKoStrings( Buffer.from( JSON.stringify( { a: { value: '콘덴서 실험' }, b: { value: '다른', visible: false } } ) ), fixes ) );
  assert.equal( flat.a.value, '축전기 실험' );
  assert.deepEqual( flat.b, { value: '다른', visible: false } );
  const nested = JSON.parse( rewriteKoStrings( Buffer.from( JSON.stringify( { screen: { cap: { value: '콘덴서' } } } ) ), fixes ) );
  assert.equal( nested.screen.cap.value, '축전기' );
  const same = Buffer.from( '{ "a": { "value": "x" } }' );
  assert.equal( rewriteKoStrings( same, fixes ), same );
  assert.equal( rewriteKoStrings( Buffer.from( 'not json' ), fixes ).toString(), 'not json' );
} );

test( 'termFixRules targets only babel files that contain a fix and is idempotent', { skip: skipNoCache }, async () => {
  const fl = pinned.find( p => p.id === 'fourier-making-waves' );
  const rules = await termFixRules( fl.id, fl.manifest, data );
  assert.equal( rules.length, 1 );
  const [ rule ] = rules;
  assert.equal( rule.repo, 'babel' );
  assert.equal( rule.kind, 'terms' );
  assert.ok( rule.files.includes( 'fourier-making-waves/fourier-making-waves-strings_ko.json' ), rule.files.join() );
  assert.ok( rule.files.length < 10, 'only files that actually change are listed' );
  const sample = Buffer.from( JSON.stringify( { 'fourier-making-waves.title': { value: '푸우리에: 파형만들기' } } ) );
  const one = transformFile( rule, sample, {}, rule.files[ 0 ] );
  assert.equal( JSON.parse( one.content ).title ?? JSON.parse( one.content )[ 'fourier-making-waves.title' ].value, '푸리에: 파형 만들기' );
  const two = transformFile( rule, one.content, {}, rule.files[ 0 ] );
  assert.deepEqual( two.content, one.content );
  const files = targetFiles( fl.tables, fixesForSim( data, fl.id ) );
  assert.deepEqual( files, rule.files );
} );

test( 'term fix data feeds the theme hash', () => {
  const other = { ...data, global: [ ...data.global, { from: 'a', to: 'b', reason: '표기' } ] };
  assert.notEqual( termFixesHash( data ), termFixesHash( other ) );
  assert.equal( termFixesHash( data ), termFixesHash( JSON.parse( JSON.stringify( data ) ) ) );
} );

// ---- built pages (run when `node tools/build-all.mjs --brand bsshs --theme` output exists) ----

test( 'built pages show every corrected term and no longer the original in the Korean strings', { skip: skipNoCache }, async t => {
  let checkedSims = 0;
  let strings = 0;
  const fixSeen = new Map(); // every recorded fix must show up in at least one built page (a sim may not bundle a given string)
  for ( const { id, tables } of pinned ) {
    const html = await readBuilt( id );
    if ( !html ) { continue; }
    checkedSims++;
    const ko = koStringsOf( html ); // null for newer chipper builds (packed blob)
    const fixes = fixesForSim( data, id );
    for ( const f of fixes ) {
      let applicable = 0; // live strings of this sim that carry the original text (a global fix may not apply to every sim)
      let seen = 0; // ... of which this build actually bundles
      for ( const tb of tables ) for ( const s of tb.strings ) {
        if ( !s.live || !s.value.includes( f.from ) ) { continue; }
        applicable++;
        const fixed = applyFixesToValue( s.value, fixes );
        if ( ko ) {
          const key = chipperKey( tb.repo, s.key );
          if ( !( key in ko ) ) { continue; } // this build does not bundle the string
          seen++;
          assert.equal( ko[ key ].trim(), fixed.trim(), `${id}: ${key}` ); // chipper trims surrounding whitespace
          // Fixes compose in order (perSim, then global), so an earlier fix may already have rewritten the
          // span this one targets; the exact composed value above is the binding check.
          if ( fixed.includes( f.to ) ) { assert.ok( ko[ key ].includes( f.to ), `${id}: ${key} lacks ${f.to}` ); }
          if ( !fixed.includes( f.from ) ) { assert.ok( !ko[ key ].includes( f.from ), `${id}: ${key} still has ${f.from}` ); }
        }
        else if ( isPlain( s.value.trim() ) && isPlain( fixed.trim() ) && /[가-힣]/.test( s.value ) ) {
          assert.ok( !packedHas( html, s.value.trim() ), `${id}: the original Korean string ${JSON.stringify( s.value )} is still in the page` );
          if ( packedHas( html, fixed.trim() ) ) { seen++; } // else this build does not bundle the string at all
        }
        else { seen++; } // markup-bearing strings are covered by the exact-key check on JSON-layout builds
      }
      if ( applicable ) { fixSeen.set( `${f.from}\0${f.to}`, ( fixSeen.get( `${f.from}\0${f.to}` ) || 0 ) + seen ); }
      strings += seen;
    }
  }
  if ( !checkedSims ) { t.skip( 'no themed builds in build/bsshs-theme yet' ); return; }
  assert.ok( strings > 0 );
  if ( checkedSims === simIds.length ) {
    for ( const f of [ ...data.global, ...Object.values( data.perSim ).flat() ] ) {
      assert.ok( fixSeen.get( `${f.from}\0${f.to}` ) > 0, `fix ${JSON.stringify( f.from )} -> ${JSON.stringify( f.to )} appears in no built page` );
    }
  }
} );

test( 'built pages carry no PhET menu-button name; the older families use the school name', { skip: skipNoCache }, async t => {
  let n = 0;
  for ( const { id } of pinned ) {
    const html = await readBuilt( id );
    if ( !html ) { continue; }
    n++;
    assert.ok( !html.includes( 'PhET Menu Button' ), `${id} still contains "PhET Menu Button"` );
  }
  for ( const id of [ 'charges-and-fields', 'under-pressure' ] ) {
    const html = await readBuilt( id );
    if ( html ) { assert.ok( html.includes( '부산과학고 메뉴 버튼' ), `${id} lacks the renamed menu button text` ); }
  }
  if ( !n ) { t.skip( 'no themed builds in build/bsshs-theme yet' ); }
} );
