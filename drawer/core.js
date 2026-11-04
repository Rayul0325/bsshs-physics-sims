// Pure drawer logic shared by the browser runtime (inlined into the built sim) and the node tests.
// Classic script: no import/export, no DOM. It only assigns globalThis.BsshsDrawerCore, so the same
// file works as an inline <script> and as a side-effect module import in node.
// No design values here (they come from theme/tokens.json through CSS variables).
( function( root ) {
  'use strict';

  const BOM = '\uFEFF';
  const STORAGE_PREFIX = 'bsshs:log:';

  /**
   * localStorage key of one sim's log for one measurement-definition version.
   * @param {string} simId
   * @param {number} version - drawer.json schemaVersion
   * @returns {string}
   */
  function storageKey( simId, version ) {
    return `${STORAGE_PREFIX}${simId}:v${version}`;
  }

  /**
   * @param {string} key
   * @returns {{ simId: string, version: number }|null}
   */
  function parseStorageKey( key ) {
    const m = /^bsshs:log:(.+):v(\d+)$/.exec( String( key ) );
    return m ? { simId: m[ 1 ], version: Number( m[ 2 ] ) } : null;
  }

  /** Strips the bidi embedding marks PhET wraps around translated strings. @param {string} s */
  function cleanName( s ) {
    return String( s == null ? '' : s ).replace( /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '' ).trim();
  }

  /**
   * Value in the class unit: value × factor + offset.
   * @param {number|null} value
   * @param {{ unit: string, factor: number, offset?: number }|undefined} classUnit
   * @returns {number|null}
   */
  function classValue( value, classUnit ) {
    if ( value === null || value === undefined || !Number.isFinite( value ) || !classUnit ) { return null; }
    return value * classUnit.factor + ( classUnit.offset || 0 );
  }

  /** @param {string} name @param {string} unit */
  const label = ( name, unit ) => ( unit ? `${name} (${unit})` : name );

  /**
   * Table / CSV / graph columns for a measurement list: one column per item in the sim unit, plus one
   * in the class unit when the item has a conversion.
   * @param {{ key: string, name: string, unit: string, classUnit?: object }[]} measurements
   * @returns {{ id: string, key: string, name: string, unit: string, label: string, isClass: boolean }[]}
   */
  function columnsFor( measurements ) {
    const out = [];
    for ( const m of measurements ) {
      out.push( { id: m.key, key: m.key, name: m.name, unit: m.unit || '', label: label( m.name, m.unit ), isClass: false } );
      if ( m.classUnit ) {
        out.push( { id: `${m.key}@class`, key: m.key, name: m.name, unit: m.classUnit.unit, label: label( m.name, m.classUnit.unit ), isClass: true } );
      }
    }
    return out;
  }

  /**
   * Cell value of a column for a row.
   * @param {{ values: Record<string, number|null> }} row
   * @param {{ key: string, isClass: boolean }} col
   * @param {{ key: string, classUnit?: object }[]} measurements
   * @returns {number|null}
   */
  function cellValue( row, col, measurements ) {
    const v = row.values ? row.values[ col.key ] : null;
    if ( v === null || v === undefined || !Number.isFinite( v ) ) { return null; }
    if ( !col.isClass ) { return v; }
    const m = measurements.find( x => x.key === col.key );
    return classValue( v, m && m.classUnit );
  }

  /** @param {number} n */
  const pad = n => String( n ).padStart( 2, '0' );

  /**
   * Local time as YYYY-MM-DD HH:MM:SS.
   * @param {string|number|Date} t
   * @returns {string}
   */
  function formatTime( t ) {
    const d = new Date( t );
    if ( Number.isNaN( d.getTime() ) ) { return ''; }
    return `${d.getFullYear()}-${pad( d.getMonth() + 1 )}-${pad( d.getDate() )} ${pad( d.getHours() )}:${pad( d.getMinutes() )}:${pad( d.getSeconds() )}`;
  }

  /** @param {string} s */
  function csvCell( s ) {
    const t = String( s );
    return /[",\r\n]/.test( t ) ? `"${t.replace( /"/g, '""' )}"` : t;
  }

  /**
   * CSV text of a log, with a UTF-8 BOM so Excel opens Korean headers correctly. CRLF line ends.
   * @param {{ measurements: object[], rows: { time: string, screen: string, values: object }[] }} log
   * @returns {string}
   */
  function toCsv( log ) {
    const cols = columnsFor( log.measurements );
    const lines = [ [ '시각', '화면', ...cols.map( c => c.label ) ].map( csvCell ).join( ',' ) ];
    for ( const r of log.rows ) {
      const cells = [ formatTime( r.time ), r.screen || '' ];
      for ( const c of cols ) {
        const v = cellValue( r, c, log.measurements );
        cells.push( v === null ? '' : String( v ) );
      }
      lines.push( cells.map( csvCell ).join( ',' ) );
    }
    return BOM + lines.join( '\r\n' ) + '\r\n';
  }

  /**
   * Keeps only the declared keys; non-finite numbers become null.
   * @param {{ key: string }[]} measurements
   * @param {Record<string, unknown>|null|undefined} raw
   * @returns {Record<string, number|null>}
   */
  function sanitizeValues( measurements, raw ) {
    const out = {};
    for ( const m of measurements ) {
      const v = raw ? raw[ m.key ] : null;
      out[ m.key ] = typeof v === 'number' && Number.isFinite( v ) ? v : null;
    }
    return out;
  }

  /**
   * Least-squares line through the points.
   * @param {{ x: number, y: number }[]} points
   * @returns {{ slope: number, intercept: number, r2: number|null, n: number }|null} null if under 2 distinct x
   */
  function linearFit( points ) {
    const p = points.filter( q => Number.isFinite( q.x ) && Number.isFinite( q.y ) );
    const n = p.length;
    if ( n < 2 ) { return null; }
    let sx = 0, sy = 0;
    for ( const q of p ) { sx += q.x; sy += q.y; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    for ( const q of p ) {
      sxx += ( q.x - mx ) * ( q.x - mx );
      sxy += ( q.x - mx ) * ( q.y - my );
      syy += ( q.y - my ) * ( q.y - my );
    }
    if ( sxx === 0 ) { return null; }
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const r2 = syy === 0 ? null : ( sxy * sxy ) / ( sxx * syy );
    return { slope, intercept, r2, n };
  }

  const SUPERSCRIPT = { '-': '\u207B', 0: '\u2070', 1: '\u00B9', 2: '\u00B2', 3: '\u00B3', 4: '\u2074', 5: '\u2075', 6: '\u2076', 7: '\u2077', 8: '\u2078', 9: '\u2079' };
  /** @param {number} n - integer exponent @returns {string} e.g. -4 -> superscript minus, four */
  const superscript = n => String( n ).split( '' ).map( c => SUPERSCRIPT[ c ] ).join( '' );

  /**
   * Short display form of a number for people (4 significant digits; very large/small numbers as
   * mantissa×10 with a Unicode superscript exponent, e.g. 6.667×10⁻⁴). On screen only: the CSV uses
   * String(value), which stays machine-readable (0.0006667, 6.667e-7).
   * @param {number|null} v
   * @returns {string}
   */
  function formatNumber( v ) {
    if ( v === null || v === undefined || !Number.isFinite( v ) ) { return '–'; }
    if ( v === 0 ) { return '0'; }
    const a = Math.abs( v );
    if ( a >= 1e5 || a < 1e-3 ) {
      const [ mant, exp ] = v.toExponential( 3 ).split( 'e' );
      return `${String( Number( mant ) )}×10${superscript( Number( exp ) )}`;
    }
    return String( Number( v.toPrecision( 4 ) ) );
  }

  /** V3 default tolerances (changeable per case with relTol, per run with the runner flags). */
  const DEFAULT_REL_TOL = 0.01;
  const DEFAULT_ABS_TOL = 1e-9;

  /**
   * Compares adapter values with a cases.json `expect` block.
   * Non-zero expected value: |actual − value| ≤ relTol·|value| (relTol: the case's, else 1%).
   * Expected value 0: |actual| ≤ absTol (default 1e-9), since a relative tolerance of 0 is meaningless.
   * @param {Record<string, { value: number, relTol?: number }>} expect
   * @param {Record<string, number|null>} values
   * @param {{ relTol?: number, absTol?: number }} [defaults]
   * @returns {{ key: string, expected: number, actual: number|null, mode: 'relative'|'absolute', tol: number, error: number|null, ok: boolean }[]}
   */
  function checkExpect( expect, values, defaults ) {
    const d = defaults || {};
    const relDefault = d.relTol === undefined ? DEFAULT_REL_TOL : d.relTol;
    const absTol = d.absTol === undefined ? DEFAULT_ABS_TOL : d.absTol;
    return Object.keys( expect ).map( key => {
      const want = expect[ key ];
      const actual = values && typeof values[ key ] === 'number' && Number.isFinite( values[ key ] ) ? values[ key ] : null;
      const zero = want.value === 0;
      const tol = zero ? absTol : ( want.relTol === undefined ? relDefault : want.relTol );
      const error = actual === null ? null : ( zero ? Math.abs( actual ) : Math.abs( actual - want.value ) / Math.abs( want.value ) );
      return { key, expected: want.value, actual, mode: zero ? 'absolute' : 'relative', tol, error, ok: error !== null && error <= tol };
    } );
  }

  /**
   * When every variable of a lessons formula is a constant or a measurement item, the substituted
   * values (in the formula's own unit: the class unit when the item has one). Otherwise null.
   * @param {{ variables: { key: string, symbol: string, name: string, unit: string, constant?: number }[] }} formula
   * @param {{ key: string, unit: string, classUnit?: object }[]} measurements
   * @param {Record<string, number|null>} values - sim-unit values from the adapter
   * @returns {{ symbol: string, name: string, value: number|null, unit: string, constant: boolean }[]|null}
   */
  function substitution( formula, measurements, values ) {
    const byKey = new Map( measurements.map( m => [ m.key, m ] ) );
    const vars = formula.variables || [];
    if ( !vars.length || !vars.some( v => !( 'constant' in v ) ) ) { return null; }
    const out = [];
    for ( const v of vars ) {
      if ( 'constant' in v ) {
        out.push( { symbol: v.symbol, name: v.name, value: v.constant, unit: v.unit, constant: true } );
        continue;
      }
      const m = byKey.get( v.key );
      if ( !m ) { return null; }
      const raw = values ? values[ v.key ] : null;
      const useClass = m.classUnit && ( v.unit === m.classUnit.unit || v.unit !== m.unit );
      const value = useClass ? classValue( raw, m.classUnit ) : ( Number.isFinite( raw ) ? raw : null );
      out.push( { symbol: v.symbol, name: v.name, value, unit: useClass ? m.classUnit.unit : m.unit, constant: false } );
    }
    return out;
  }

  /**
   * Points of one series for a graph, optionally restricted to one screen.
   * @param {object[]} rows
   * @param {{ key: string, isClass: boolean }} xCol
   * @param {{ key: string, isClass: boolean }} yCol
   * @param {object[]} measurements
   * @param {string|null} [screen]
   * @returns {{ x: number, y: number }[]}
   */
  function seriesPoints( rows, xCol, yCol, measurements, screen ) {
    const out = [];
    for ( const r of rows ) {
      if ( screen && r.screen !== screen ) { continue; }
      const x = cellValue( r, xCol, measurements );
      const y = cellValue( r, yCol, measurements );
      if ( x !== null && y !== null ) { out.push( { x, y } ); }
    }
    return out;
  }

  /**
   * "Nice" axis ticks covering [min, max].
   * @param {number} min
   * @param {number} max
   * @param {number} count - tick count (theme/tokens.json drawer.graph.tickCount)
   * @returns {number[]}
   */
  // @canvas:begin
  function niceTicks( min, max, count ) {
    if ( !Number.isFinite( min ) || !Number.isFinite( max ) || !( count > 0 ) ) { return []; }
    if ( min === max ) { const d = Math.abs( min ) || 1; min -= d / 2; max += d / 2; }
    const raw = ( max - min ) / count;
    const mag = Math.pow( 10, Math.floor( Math.log10( raw ) ) ); // math: decimal magnitude
    const step = [ 1, 2, 5, 10 ].map( k => k * mag ).find( s => s >= raw ) || 10 * mag; // math: 1-2-5 decade series
    const out = [];
    for ( let v = Math.ceil( min / step ) * step; v <= max + step * 1e-9; v += step ) { out.push( Number( v.toPrecision( 12 ) ) ); } // math: float clean-up
    return out;
  }
  // @canvas:end

  /**
   * Unit of a fitted slope dy/dx. A reciprocal x unit ("/s") multiplies instead of nesting a slash,
   * and a compound x unit is parenthesized.
   * @param {string} uy
   * @param {string} ux
   * @returns {string}
   */
  function slopeUnit( uy, ux ) {
    uy = uy || '';
    ux = ux || '';
    if ( !ux ) { return uy; }
    if ( ux.startsWith( '/' ) ) { const inv = ux.slice( 1 ); return uy ? `${uy}·${inv}` : inv; }
    const den = /[/·*]/.test( ux ) ? `(${ux})` : ux;
    return uy ? `${uy}/${den}` : `1/${den}`;
  }

  root.BsshsDrawerCore = {
    BOM, STORAGE_PREFIX, storageKey, parseStorageKey, cleanName, classValue, columnsFor, cellValue,
    formatTime, toCsv, sanitizeValues, linearFit, formatNumber, substitution, seriesPoints, niceTicks,
    checkExpect, DEFAULT_REL_TOL, DEFAULT_ABS_TOL, slopeUnit
  };
} )( typeof globalThis !== 'undefined' ? globalThis : window );
