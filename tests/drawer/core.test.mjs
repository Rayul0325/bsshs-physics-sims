// Pure drawer logic (drawer/core.js): storage keys, CSV with BOM, class-unit columns, linear fit,
// formula substitution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../drawer/core.js';

const C = globalThis.BsshsDrawerCore;
const M = [
  { key: 'photonEnergy', name: '광자 에너지', unit: 'eV', classUnit: { unit: 'J', factor: 1.602176634e-19 } },
  { key: 'wavelength', name: '파장', unit: 'nm', classUnit: { unit: 'm', factor: 1e-9 } },
  { key: 'coilTurns', name: '감은 수', unit: '' },
  { key: 'temperatureC', name: '온도', unit: '°C', classUnit: { unit: 'K', factor: 1, offset: 273.15 } }
];

test( 'storage key is bsshs:log:<id>:v<version> and parses back', () => {
  assert.equal( C.storageKey( 'generator', 3 ), 'bsshs:log:generator:v3' );
  assert.deepEqual( C.parseStorageKey( 'bsshs:log:bsshs-compton:v12' ), { simId: 'bsshs-compton', version: 12 } );
  assert.equal( C.parseStorageKey( 'other:key' ), null );
} );

test( 'columns: one per item, plus one in the class unit when a conversion exists', () => {
  const cols = C.columnsFor( M );
  assert.deepEqual( cols.map( c => c.label ), [ '광자 에너지 (eV)', '광자 에너지 (J)', '파장 (nm)', '파장 (m)', '감은 수', '온도 (°C)', '온도 (K)' ] );
  assert.equal( C.classValue( 2, M[ 0 ].classUnit ), 2 * 1.602176634e-19 );
  assert.equal( C.classValue( 25, M[ 3 ].classUnit ), 298.15 );
  assert.equal( C.classValue( null, M[ 0 ].classUnit ), null );
} );

test( 'CSV starts with the UTF-8 BOM, has Korean headers, escapes cells and converts class units', () => {
  const csv = C.toCsv( { measurements: M, rows: [
    { time: '2026-11-04T01:02:03Z', screen: '광전 "효과", 1', values: { photonEnergy: 2, wavelength: 620, coilTurns: null, temperatureC: 0 } }
  ] } );
  assert.equal( csv.charCodeAt( 0 ), 0xFEFF );
  const bytes = Buffer.from( csv, 'utf8' );
  assert.deepEqual( [ ...bytes.subarray( 0, 3 ) ], [ 0xEF, 0xBB, 0xBF ] );
  const lines = csv.slice( 1 ).split( '\r\n' );
  assert.equal( lines[ 0 ], '시각,화면,광자 에너지 (eV),광자 에너지 (J),파장 (nm),파장 (m),감은 수,온도 (°C),온도 (K)' );
  const cells = lines[ 1 ];
  assert.match( cells, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},"광전 ""효과"", 1",2,3\.204353268e-19,620,6\.2e-7,,0,273\.15$/ );
} );

test( 'sanitizeValues keeps declared keys only and maps non-finite to null', () => {
  assert.deepEqual( C.sanitizeValues( M.slice( 0, 2 ), { photonEnergy: NaN, wavelength: 500, extra: 1 } ), { photonEnergy: null, wavelength: 500 } );
  assert.deepEqual( C.sanitizeValues( M.slice( 0, 1 ), null ), { photonEnergy: null } );
} );

test( 'linearFit recovers slope and intercept; refuses fewer than two distinct x', () => {
  const f = C.linearFit( [ { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 4, y: 9 } ] );
  assert.ok( Math.abs( f.slope - 2 ) < 1e-12 && Math.abs( f.intercept - 1 ) < 1e-12 );
  assert.ok( Math.abs( f.r2 - 1 ) < 1e-12 );
  assert.equal( C.linearFit( [ { x: 1, y: 1 } ] ), null );
  assert.equal( C.linearFit( [ { x: 1, y: 1 }, { x: 1, y: 2 } ] ), null );
} );

test( 'substitution: only when every non-constant variable is a measurement item; class units used', () => {
  const formula = { variables: [
    { key: 'photonEnergy', symbol: 'E', name: '광자 에너지', unit: 'J' },
    { key: 'planckConstant', symbol: 'h', name: '플랑크 상수', unit: 'J·s', constant: 6.62607015e-34 },
    { key: 'wavelength', symbol: 'λ', name: '파장', unit: 'm' }
  ] };
  const s = C.substitution( formula, M, { photonEnergy: 2, wavelength: 620 } );
  assert.deepEqual( s.map( x => [ x.symbol, x.unit, x.constant ] ), [ [ 'E', 'J', false ], [ 'h', 'J·s', true ], [ 'λ', 'm', false ] ] );
  assert.equal( s[ 2 ].value, 620e-9 );
  assert.equal( C.substitution( { variables: [ ...formula.variables, { key: 'frequency', symbol: 'f', name: '진동수', unit: 'Hz' } ] }, M, {} ), null );
  assert.equal( C.substitution( { variables: [ { key: 'c', symbol: 'c', name: '빛', unit: 'm/s', constant: 3 } ] }, M, {} ), null, 'constants only' );
} );

test( 'cleanName strips PhET bidi marks; formatNumber is short', () => {
  assert.equal( C.cleanName( '\u202A발전기\u202C' ), '발전기' );
  assert.equal( C.formatNumber( 1234.5678 ), '1235' );
  assert.equal( C.formatNumber( 6.62607015e-34 ), '6.626×10\u207B\u00B3\u2074' );
  assert.equal( C.formatNumber( null ), '–' );
  assert.ok( C.niceTicks( 0, 10, 5 ).includes( 0 ) && C.niceTicks( 0, 10, 5 ).includes( 10 ) );
  assert.deepEqual( C.niceTicks( 0, 10 ), [], 'the tick count is required (it comes from the tokens)' );
} );

test( 'on screen: exponents as Unicode superscripts; CSV: machine-readable numbers, no superscripts', () => {
  assert.equal( C.formatNumber( 6.667e-4 ), '6.667×10\u207B\u2074' ); // 6.667×10⁻⁴
  assert.equal( C.formatNumber( 7.5e14 ), '7.5×10\u00B9\u2074' ); // 7.5×10¹⁴
  assert.equal( C.formatNumber( -1.2e-12 ), '-1.2×10\u207B\u00B9\u00B2' );
  assert.doesNotMatch( C.formatNumber( 6.667e-4 ), /\^/ );
  const csv = C.toCsv( { measurements: [ { key: 'a', name: '값', unit: 'm' }, { key: 'b', name: '값2', unit: '' } ],
    rows: [ { time: 0, screen: 's', values: { a: 6.667e-4, b: 6.667e-9 } } ] } );
  const cells = csv.slice( 1 ).split( '\r\n' )[ 1 ].split( ',' ).slice( 2 );
  assert.deepEqual( cells, [ '0.0006667', '6.667e-9' ] );
  for ( const c of cells ) { assert.ok( Number.isFinite( Number( c ) ), c ); }
  assert.doesNotMatch( csv, /[\u2070-\u209F\u00B2\u00B3\u00B9×]/ );
} );

test( 'V3 checkExpect: default relative 1%, per-case relTol, absolute tolerance for an expected 0', () => {
  assert.equal( C.DEFAULT_REL_TOL, 0.01 );
  const r = C.checkExpect( {
    a: { value: 100 },                 // 0.9% off: passes at the 1% default
    b: { value: 100 },                 // 1.1% off: fails
    c: { value: 2, relTol: 0.0001 },   // tight per-case tolerance
    z: { value: 0 },                   // absolute
    w: { value: 0 },
    n: { value: 1 }                    // missing value fails
  }, { a: 100.9, b: 101.1, c: 2.001, z: 1e-12, w: 1e-3, n: null } );
  assert.deepEqual( r.map( x => [ x.key, x.ok, x.mode ] ), [
    [ 'a', true, 'relative' ], [ 'b', false, 'relative' ], [ 'c', false, 'relative' ],
    [ 'z', true, 'absolute' ], [ 'w', false, 'absolute' ], [ 'n', false, 'relative' ] ] );
  assert.equal( r.find( x => x.key === 'z' ).tol, C.DEFAULT_ABS_TOL );
  assert.equal( C.checkExpect( { w: { value: 0 } }, { w: 1e-3 }, { absTol: 0.01 } )[ 0 ].ok, true );
  assert.equal( C.checkExpect( { b: { value: 100 } }, { b: 101.1 }, { relTol: 0.02 } )[ 0 ].ok, true );
} );
