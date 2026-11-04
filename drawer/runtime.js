// Class drawer runtime, inlined into a built sim by drawer/inject.mjs (classic script, after core.js).
// Reads its data from <script type="application/json" id="bsshs-drawer-data"> and exposes
// window.bsshsDrawer (register + a small test API). The UI lives in an open shadow root on a
// zero-size fixed host, so with the drawer closed the sim's layout and pixels are untouched except
// for the open button. Pointer/key events inside the drawer never reach the sim.
// Every design value is a --bsshs-* CSS variable (theme/tokens.json); canvas colors are read from them.
( function() {
  'use strict';
  const C = window.BsshsDrawerCore;
  const dataEl = document.getElementById( 'bsshs-drawer-data' );
  if ( !C || !dataEl ) { return; }
  const DATA = JSON.parse( dataEl.textContent );
  const SIM = DATA.simId;
  const DEF = DATA.drawer;
  const M = DEF.measurements;
  const VERSION = DEF.schemaVersion;
  const KEY = C.storageKey( SIM, VERSION );
  const LAYOUT = DATA.layout;
  const G = LAYOUT.graph;
  const COLS = C.columnsFor( M );
  const TABS = [ [ 'log', '측정 기록' ], [ 'graphs', '그래프' ], [ 'lessons', '공식·용어' ] ];

  // ------------------------------------------------------------------ storage
  const mem = new Map();
  const persistent = ( () => {
    try { const k = 'bsshs:probe'; localStorage.setItem( k, '1' ); localStorage.removeItem( k ); return true; }
    catch ( e ) { return false; }
  } )();
  const store = {
    get: k => ( persistent ? localStorage.getItem( k ) : ( mem.has( k ) ? mem.get( k ) : null ) ),
    set: ( k, v ) => { if ( persistent ) { try { localStorage.setItem( k, v ); return; } catch ( e ) { /* quota: keep in memory */ } } mem.set( k, v ); },
    remove: k => { if ( persistent ) { localStorage.removeItem( k ); } mem.delete( k ); },
    keys: () => ( persistent ? Object.keys( localStorage ) : [ ...mem.keys() ] )
  };

  /** @param {string} key @returns {{ version: number, measurements: object[], rows: object[] }|null} */
  function readLog( key ) {
    try {
      const v = JSON.parse( store.get( key ) || 'null' );
      return v && Array.isArray( v.rows ) ? v : null;
    }
    catch ( e ) { return null; }
  }
  const log = readLog( KEY ) || { simId: SIM, version: VERSION, measurements: M, rows: [] };
  log.measurements = M;
  const saveLog = () => {
    if ( log.rows.length ) { store.set( KEY, JSON.stringify( { simId: SIM, version: VERSION, measurements: M, rows: log.rows } ) ); }
    else { store.remove( KEY ); }
  };

  /** Logs of this sim stored under another definition version (never mixed into the current table). */
  function legacyLogs() {
    const out = [];
    for ( const k of store.keys() ) {
      const p = C.parseStorageKey( k );
      if ( !p || p.simId !== SIM || p.version === VERSION ) { continue; }
      const l = readLog( k );
      if ( !l || !l.rows.length ) { store.remove( k ); continue; }
      out.push( { key: k, version: p.version, log: l } );
    }
    return out.sort( ( a, b ) => a.version - b.version );
  }

  // ------------------------------------------------------------------ sim helpers (for adapters)
  /** A string, or the value of a Property holding one. */
  const textOf = n => ( n && typeof n === 'object' && 'value' in n ? n.value : n );
  const helpers = {
    sim: () => ( window.phet && window.phet.joist && window.phet.joist.sim ) || null,
    /**
     * The selected screen (the home screen included) on every joist generation of the 68 builds:
     * selectedScreenProperty (newer), screenProperty (2019-2021), or screenIndexProperty +
     * showHomeScreenProperty (older; there the home screen is not in sim.screens).
     */
    screen() {
      const s = helpers.sim();
      if ( !s ) { return null; }
      if ( s.selectedScreenProperty ) { return s.selectedScreenProperty.value || null; }
      if ( s.screenProperty ) { return s.screenProperty.value || null; }
      if ( s.screenIndexProperty && s.screens ) {
        if ( s.homeScreen && s.showHomeScreenProperty && s.showHomeScreenProperty.value ) { return s.homeScreen; }
        return s.screens[ s.screenIndexProperty.value ] || null;
      }
      return null;
    },
    model() { const sc = helpers.screen(); return ( sc && ( sc.model || sc._model ) ) || null; },
    isHomeScreen() { const s = helpers.sim(); return !!( s && s.homeScreen && helpers.screen() === s.homeScreen ); },
    /** Korean name of the selected screen, bidi marks removed; a screen without a name of its own (single-screen sims) is called by the sim's name. */
    screenName() {
      const sc = helpers.screen();
      if ( !sc ) { return ''; }
      if ( helpers.isHomeScreen() ) { return '홈 화면'; }
      const own = C.cleanName( textOf( sc.nameProperty !== undefined ? sc.nameProperty : sc.name ) );
      if ( own ) { return own; }
      const s = helpers.sim();
      return C.cleanName( textOf( s.simNameProperty !== undefined ? s.simNameProperty : s.name ) );
    },
    cleanName: C.cleanName
  };

  // ------------------------------------------------------------------ state
  let adapter = null;
  let host = null;
  let shadow = null;
  let ui = null;
  let isOpen = false;
  let tab = 'log';
  let liveTimer = null;
  const free = { x: M[ 0 ] ? M[ 0 ].key : '', y: M[ 1 ] ? M[ 1 ].key : ( M[ 0 ] ? M[ 0 ].key : '' ), fit: true };

  function readNow() {
    if ( !adapter ) { return C.sanitizeValues( M, null ); }
    try { return C.sanitizeValues( M, adapter.read() ); }
    catch ( e ) { console.warn( 'bsshsDrawer: adapter.read() failed', e ); return C.sanitizeValues( M, null ); }
  }
  function screenNow() {
    try { return C.cleanName( adapter && adapter.screenName ? adapter.screenName() : helpers.screenName() ); }
    catch ( e ) { return ''; }
  }

  // ------------------------------------------------------------------ DOM helpers
  /**
   * @param {string} tag
   * @param {Record<string, any>|null} [attrs]
   * @param {...any} kids
   */
  function h( tag, attrs, ...kids ) {
    const el = document.createElement( tag );
    for ( const [ k, v ] of Object.entries( attrs || {} ) ) {
      if ( v === null || v === undefined || v === false ) { continue; }
      if ( k === 'class' ) { el.className = v; }
      else if ( k === 'text' ) { el.textContent = v; }
      else if ( k.startsWith( 'on' ) ) { el.addEventListener( k.slice( 2 ), v ); }
      else if ( k.startsWith( 'data-' ) || k.startsWith( 'aria-' ) || k === 'role' || k === 'type' || k === 'hidden' || k === 'value' || k === 'for' || k === 'id' ) { el.setAttribute( k, v === true ? '' : v ); }
      else { el[ k ] = v; }
    }
    for ( const kid of kids.flat() ) {
      if ( kid === null || kid === undefined || kid === false ) { continue; }
      el.appendChild( typeof kid === 'string' ? document.createTextNode( kid ) : kid );
    }
    return el;
  }
  const cssVar = name => ( host ? getComputedStyle( host ).getPropertyValue( name ).trim() : '' );
  const withUnit = ( v, unit ) => ( unit ? `${C.formatNumber( v )} ${unit}` : C.formatNumber( v ) );

  function download( name, blob ) {
    const a = h( 'a', { download: name, href: URL.createObjectURL( blob ) } );
    shadow.appendChild( a );
    a.click();
    setTimeout( () => { URL.revokeObjectURL( a.href ); a.remove(); }, 1000 );
  }
  const csvBlob = text => new Blob( [ text ], { type: 'text/csv;charset=utf-8' } );

  // ------------------------------------------------------------------ graphs
  function graphSpec( id ) {
    if ( id === 'free' ) {
      const x = COLS.find( c => c.id === free.x ) || COLS[ 0 ];
      const y = COLS.find( c => c.id === free.y ) || COLS[ 0 ];
      return { id: 'free', title: '자유 그래프', x, ys: [ y ], fit: free.fit };
    }
    const g = DEF.graphs.find( q => q.id === id );
    if ( !g ) { return null; }
    const col = key => COLS.find( c => c.id === key );
    return { id: g.id, title: g.title, x: col( g.x ), ys: ( Array.isArray( g.y ) ? g.y : [ g.y ] ).map( col ), fit: g.fit === 'linear' };
  }

  function computeSeries( spec, screen ) {
    return spec.ys.map( y => {
      const pts = C.seriesPoints( log.rows, spec.x, y, M, screen || null );
      return { col: y, points: pts, fit: spec.fit ? C.linearFit( pts ) : null };
    } );
  }

  const slopeUnit = C.slopeUnit;
  function fitLines( spec, series ) {
    return series.filter( s => s.fit ).map( s =>
      `${s.col.label}: 기울기 = ${withUnit( s.fit.slope, slopeUnit( s.col.unit, spec.x.unit ) )}, 절편 = ${withUnit( s.fit.intercept, s.col.unit )}` +
      ( s.fit.r2 === null ? '' : `, R² = ${s.fit.r2.toFixed( 4 )}` ) );
  }

  // @canvas:begin  (no numeric design constant here: sizes and ratios come from theme/tokens.json drawer.graph)
  /**
   * Graph text sizes in CSS px. The floor is font.sizes.graphMin, or font.sizes.largeScreenBody from
   * breakpoint.large up, so every canvas label stays readable on whiteboards.
   * @param {number} w - canvas CSS width
   */
  function graphFonts( w ) {
    const wide = window.matchMedia( `(min-width: ${LAYOUT.wideMinWidthPx}px)` ).matches;
    const floor = Number.parseFloat( cssVar( wide ? '--bsshs-font-size-large-screen-body' : '--bsshs-font-size-graph-min' ) ) || 0;
    const fs = Math.max( floor, w * G.textPerWidth );
    const at = scale => Math.max( floor, fs * scale );
    return { fs, title: at( G.titleScale ), tick: at( G.tickScale ), label: at( G.labelScale ) };
  }

  /**
   * Splits `text` into lines no wider than `width` at the current ctx.font (at spaces, or inside a word
   * that alone is too wide). With `maxLines`, the last kept line ends in an ellipsis when text is cut.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} width
   * @param {number} [maxLines]
   * @returns {string[]}
   */
  function wrapText( ctx, text, width, maxLines ) {
    const fits = s => ctx.measureText( s ).width <= width;
    const lines = [];
    let cur = '';
    for ( const word of String( text ).split( /(?<=\s)/ ) ) {
      if ( fits( ( cur + word ).trimEnd() ) ) { cur += word; continue; }
      if ( cur.trim() ) { lines.push( cur.trimEnd() ); }
      cur = '';
      if ( fits( word.trimEnd() ) ) { cur = word; continue; }
      for ( const ch of word ) {
        if ( cur && !fits( cur + ch ) ) { lines.push( cur ); cur = ''; }
        cur += ch;
      }
    }
    if ( cur.trim() ) { lines.push( cur.trimEnd() ); }
    if ( maxLines && lines.length > maxLines ) {
      lines.length = maxLines;
      let last = lines[ maxLines - 1 ];
      while ( last && !fits( `${last}…` ) ) { last = last.slice( 0, -1 ); }
      lines[ maxLines - 1 ] = `${last}…`;
    }
    return lines.length ? lines : [ '' ];
  }

  /** @param {{x0:number,y0:number,x1:number,y1:number}} a @param {{x0:number,y0:number,x1:number,y1:number}} b */
  const boxesMeet = ( a, b ) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  /**
   * Draws one graph into a canvas (CSS size w × h, device pixel ratio dpr). Every text is measured and laid
   * out so that nothing is clipped by the canvas or overlaps another text: the title, axis labels and fit
   * lines wrap (the y label to drawer.graph.labelMaxLines lines), the margins grow to hold them, and tick
   * labels that would collide are skipped. With `grow`, the canvas gets taller when the plot would get
   * smaller than half its usual height. Returns the CSS height used.
   * @param {HTMLCanvasElement} canvas
   * @param {object} spec
   * @param {object[]} series
   * @param {{ w: number, h: number, dpr: number, grow?: boolean }} size
   * @returns {number}
   */
  function drawGraph( canvas, spec, series, size ) {
    const { w, dpr } = size;
    const ctx = canvas.getContext( '2d' );
    const col = {
      bg: cssVar( '--bsshs-color-surface' ), text: cssVar( '--bsshs-color-text' ), muted: cssVar( '--bsshs-color-text-muted' ),
      grid: cssVar( '--bsshs-color-border' ), axis: cssVar( '--bsshs-color-border-strong' )
    };
    const palette = [ '--bsshs-color-accent', '--bsshs-color-warning', '--bsshs-color-success', '--bsshs-color-danger', '--bsshs-color-accent-soft-text' ].map( cssVar );
    const fam = cssVar( '--bsshs-font-sans' );
    const F = graphFonts( w );
    const fs = F.fs;
    const font = ( px, bold ) => `${bold ? 'bold ' : ''}${px}px ${fam}`;
    const lineH = px => px * G.lineGap;
    const gap = fs * G.gap;
    const inset = fs * G.inset;
    const maxW = w - inset * 2;

    // ---- measure first (measureText does not depend on the canvas size)
    ctx.font = font( F.title, true );
    const titleLines = wrapText( ctx, spec.title, maxW );
    const titleBottom = gap + titleLines.length * lineH( F.title );
    ctx.font = font( F.tick );
    const fitLines0 = fitLines( spec, series ).flatMap( t => wrapText( ctx, t, maxW ) );
    const row = lineH( F.tick );
    ctx.font = font( F.label );
    const xLines = wrapText( ctx, spec.x.label, maxW, G.labelMaxLines );
    const pad = {
      t: Math.max( fs * G.padTop, titleBottom + gap + F.tick ),
      r: fs * G.padRight,
      b: Math.max( fs * G.padBottom, fs * G.axisLabelGap + xLines.length * lineH( F.label ) + gap ) + fitLines0.length * row
    };
    const minPlot = w * G.aspect / 2;
    const ht = size.grow ? Math.max( size.h, pad.t + pad.b + minPlot ) : size.h;
    const ph = ht - pad.t - pad.b;
    const all = series.flatMap( s => s.points );

    canvas.width = Math.round( w * dpr );
    canvas.height = Math.round( ht * dpr );
    ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
    ctx.fillStyle = col.bg;
    ctx.fillRect( 0, 0, w, ht );
    ctx.fillStyle = col.text;
    ctx.font = font( F.title, true );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    titleLines.forEach( ( t, i ) => ctx.fillText( t, inset, gap + i * lineH( F.title ) ) );
    /** Boxes of the texts drawn so far (tick labels that would meet one of them are skipped). */
    const placed = [ { x0: inset, y0: gap, x1: w - inset, y1: titleBottom } ];

    if ( !all.length || ph <= 0 ) {
      ctx.fillStyle = col.muted;
      ctx.font = font( F.label );
      ctx.textAlign = 'center';
      const msg = wrapText( ctx, '기록을 남기면 여기에 그래프가 그려집니다.', maxW );
      const top = Math.max( titleBottom + gap, ( ht - msg.length * lineH( F.label ) ) / 2 );
      msg.forEach( ( t, i ) => ctx.fillText( t, w / 2, top + i * lineH( F.label ) ) );
      ctx.textAlign = 'left';
      return ht;
    }
    const range = vals => {
      let lo = Math.min( ...vals ), hi = Math.max( ...vals );
      if ( lo === hi ) { const d = Math.abs( lo ) || 1; lo -= d / 2; hi += d / 2; }
      const m = ( hi - lo ) * G.rangePad;
      return [ lo - m, hi + m ];
    };
    const [ x0, x1 ] = range( all.map( p => p.x ) );
    const [ y0, y1 ] = range( all.map( p => p.y ) );

    // y label (rotated, wrapped to the plot height) and y tick labels decide the left margin.
    ctx.font = font( F.label );
    const yText = series.length === 1 ? series[ 0 ].col.label : series.map( s => s.col.label ).join( ' · ' );
    const yLines = wrapText( ctx, yText, ph, G.labelMaxLines );
    const yBlock = gap + yLines.length * lineH( F.label );
    ctx.font = font( F.tick );
    const yTicks = C.niceTicks( y0, y1, G.tickCount ).map( t => ( { t, s: C.formatNumber( t ), wd: ctx.measureText( C.formatNumber( t ) ).width } ) );
    const tickW = Math.max( 0, ...yTicks.map( y => y.wd ) );
    pad.l = Math.max( fs * G.padLeft, yBlock + gap + tickW + gap );
    const pw = w - pad.l - pad.r;
    const X = v => pad.l + ( v - x0 ) / ( x1 - x0 ) * pw;
    const Y = v => pad.t + ph - ( v - y0 ) / ( y1 - y0 ) * ph;

    ctx.fillStyle = col.text;
    ctx.font = font( F.label );
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    yLines.forEach( ( t, i ) => {
      ctx.save();
      ctx.translate( gap + i * lineH( F.label ), pad.t + ph / 2 );
      ctx.rotate( -Math.PI / 2 );
      ctx.fillText( t, 0, 0 );
      ctx.restore();
    } );
    placed.push( { x0: gap, y0: pad.t, x1: yBlock, y1: pad.t + ph } );

    ctx.lineWidth = G.gridLineWidth;
    ctx.font = font( F.tick );
    ctx.fillStyle = col.muted;
    for ( const y of yTicks ) {
      ctx.strokeStyle = col.grid; ctx.beginPath(); ctx.moveTo( pad.l, Y( y.t ) ); ctx.lineTo( pad.l + pw, Y( y.t ) ); ctx.stroke();
      const box = { x0: pad.l - gap - y.wd, y0: Y( y.t ) - F.tick / 2, x1: pad.l - gap, y1: Y( y.t ) + F.tick / 2 };
      if ( placed.some( b => boxesMeet( b, box ) ) ) { continue; }
      placed.push( box );
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText( y.s, pad.l - gap, Y( y.t ) );
    }
    for ( const t of C.niceTicks( x0, x1, G.tickCount ) ) {
      ctx.strokeStyle = col.grid; ctx.beginPath(); ctx.moveTo( X( t ), pad.t ); ctx.lineTo( X( t ), pad.t + ph ); ctx.stroke();
      const s = C.formatNumber( t );
      const wd = ctx.measureText( s ).width;
      const box = { x0: X( t ) - wd / 2 - gap / 2, y0: pad.t + ph + gap, x1: X( t ) + wd / 2 + gap / 2, y1: pad.t + ph + gap + F.tick };
      if ( box.x0 < 0 || box.x1 > w || placed.some( b => boxesMeet( b, box ) ) ) { continue; }
      placed.push( box );
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText( s, X( t ), pad.t + ph + gap );
    }
    ctx.strokeStyle = col.axis;
    ctx.strokeRect( pad.l, pad.t, pw, ph );

    // x label under the tick labels, each line centred on the plot but kept inside the canvas.
    ctx.fillStyle = col.text;
    ctx.font = font( F.label );
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    xLines.forEach( ( t, i ) => {
      const half = ctx.measureText( t ).width / 2;
      const cx = Math.min( w - inset - half, Math.max( inset + half, pad.l + pw / 2 ) );
      ctx.fillText( t, cx, pad.t + ph + fs * G.axisLabelGap + i * lineH( F.label ) );
    } );

    ctx.save();
    ctx.beginPath(); ctx.rect( pad.l, pad.t, pw, ph ); ctx.clip();
    series.forEach( ( s, i ) => {
      const c = palette[ i % palette.length ];
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      for ( const p of s.points ) { ctx.beginPath(); ctx.arc( X( p.x ), Y( p.y ), fs * G.markerScale, 0, Math.PI * 2 ); ctx.fill(); }
      if ( s.fit ) {
        ctx.setLineDash( G.dash.map( d => d * fs ) ); ctx.lineWidth = G.lineWidth;
        ctx.beginPath(); ctx.moveTo( X( x0 ), Y( s.fit.slope * x0 + s.fit.intercept ) ); ctx.lineTo( X( x1 ), Y( s.fit.slope * x1 + s.fit.intercept ) ); ctx.stroke();
        ctx.setLineDash( [] ); ctx.lineWidth = G.gridLineWidth;
      }
    } );
    ctx.restore();
    if ( series.length > 1 ) {
      ctx.font = font( F.tick ); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const sw = fs * G.legendSwatch;
      const swX = pad.l + pw - sw - gap;
      series.forEach( ( s, i ) => {
        const yy = pad.t + inset + i * F.tick * G.legendRow;
        if ( yy + F.tick / 2 > pad.t + ph ) { return; }
        ctx.fillStyle = palette[ i % palette.length ];
        ctx.fillRect( swX, yy - sw / 2, sw, sw );
        ctx.fillStyle = col.text;
        ctx.fillText( wrapText( ctx, s.col.label, Math.max( 0, swX - gap * 2 - pad.l ), 1 )[ 0 ], swX - gap, yy );
      } );
    }
    ctx.font = font( F.tick ); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = col.text;
    fitLines0.forEach( ( t, i ) => ctx.fillText( t, inset, ht - ( fitLines0.length - i ) * row ) );
    return ht;
  }
  // @canvas:end

  // ------------------------------------------------------------------ UI
  function buildUi() {
    const st = DATA.status;
    const panelId = 'bsshs-drawer-panel';
    const openBtn = h( 'button', { class: 'open-btn', type: 'button', 'data-act': 'open', 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-label': '수업 서랍 열기', onclick: () => api.open() }, '수업 서랍' );
    const tabButtons = TABS.map( ( [ id, label ] ) => h( 'button', {
      type: 'button', role: 'tab', 'data-tab': id, 'aria-selected': 'false', onclick: () => api.open( id )
    }, label ) );
    const panels = {};

    // log tab
    const confirm = h( 'div', { class: 'confirm', hidden: true, role: 'alertdialog', 'aria-label': '새 실험 시작 확인' },
      h( 'p', { class: 'confirm-text' } ),
      h( 'div', { class: 'actions' },
        h( 'button', { type: 'button', class: 'danger', 'data-act': 'confirm-clear', onclick: () => { api.clear(); confirm.hidden = true; } }, '지우고 새로 시작' ),
        h( 'button', { type: 'button', 'data-act': 'cancel-clear', onclick: () => { confirm.hidden = true; } }, '취소' ) ) );
    const legacy = h( 'div', { class: 'legacy', hidden: true },
      h( 'p', { class: 'legacy-text' } ),
      h( 'div', { class: 'actions' },
        h( 'button', { type: 'button', class: 'primary', 'data-act': 'legacy-download', onclick: () => resolveLegacy( true ) }, '이전 기록 CSV 내려받기' ),
        h( 'button', { type: 'button', 'data-act': 'legacy-discard', onclick: () => resolveLegacy( false ) }, '받지 않고 지우기' ) ) );
    const live = h( 'dl', { class: 'live' } );
    const table = h( 'table', { class: 'log-table' }, h( 'thead' ), h( 'tbody' ) );
    panels.log = h( 'div', { class: 'tabpanel', role: 'tabpanel', 'data-panel': 'log' },
      h( 'div', { class: 'log-top' },
        h( 'button', { type: 'button', class: 'accent-outline', 'data-act': 'new-experiment', onclick: askClear }, '새 실험 시작' ),
        h( 'button', { type: 'button', class: 'primary', 'data-act': 'record', onclick: () => api.record() }, '기록' ),
        h( 'button', { type: 'button', 'data-act': 'csv', onclick: () => download( `${SIM}-측정기록.csv`, csvBlob( api.exportCsv() ) ) }, 'CSV 내려받기' ) ),
      confirm,
      legacy,
      persistent ? null : h( 'p', { class: 'notice' }, '이 브라우저에서는 기록을 저장할 수 없어, 새로 고치면 기록이 사라집니다. CSV로 받아 두세요.' ),
      adapter ? null : h( 'p', { class: 'notice no-adapter' }, '이 시뮬레이션은 아직 측정 항목이 연결되지 않았습니다.' ),
      h( 'h3', { class: 'section-title' }, '현재 값' ),
      live,
      h( 'h3', { class: 'section-title log-count' } ),
      h( 'div', { class: 'table-wrap' }, table ) );

    // graphs tab
    const graphSel = h( 'select', { 'data-ctl': 'graph', 'aria-label': '그래프 고르기', onchange: renderGraph },
      DEF.graphs.map( g => h( 'option', { value: g.id }, g.title ) ),
      h( 'option', { value: 'free' }, '자유 그래프 (x·y 고르기)' ) );
    const screenSel = h( 'select', { 'data-ctl': 'screen', 'aria-label': '화면 고르기', onchange: renderGraph } );
    const colOptions = sel => COLS.map( c => h( 'option', { value: c.id, selected: c.id === sel }, c.label ) );
    const freeBox = h( 'div', { class: 'controls free', hidden: true },
      h( 'select', { 'data-ctl': 'x', 'aria-label': '가로축(x)', onchange: e => { free.x = e.target.value; renderGraph(); } }, colOptions( free.x ) ),
      h( 'select', { 'data-ctl': 'y', 'aria-label': '세로축(y)', onchange: e => { free.y = e.target.value; renderGraph(); } }, colOptions( free.y ) ),
      h( 'label', { class: 'check' }, h( 'input', { type: 'checkbox', 'data-ctl': 'fit', checked: free.fit, onchange: e => { free.fit = e.target.checked; renderGraph(); } } ), '추세선(직선)' ) );
    const canvas = h( 'canvas', { role: 'img', 'aria-label': '그래프' } );
    panels.graphs = h( 'div', { class: 'tabpanel', role: 'tabpanel', 'data-panel': 'graphs', hidden: true },
      h( 'div', { class: 'controls' }, graphSel, screenSel ),
      freeBox,
      canvas,
      h( 'p', { class: 'fit-info' } ),
      h( 'div', { class: 'actions' }, h( 'button', { type: 'button', 'data-act': 'png', onclick: async () => download( `${SIM}-${graphSel.value}.png`, await api.exportPng( graphSel.value ) ) }, 'PNG 내려받기' ) ) );

    panels.lessons = h( 'div', { class: 'tabpanel', role: 'tabpanel', 'data-panel': 'lessons', hidden: true }, lessonsView() );

    const panel = h( 'section', { class: 'panel', id: panelId, role: 'dialog', 'aria-label': '수업 서랍', 'data-mode': 'side' },
      h( 'div', { class: 'head' },
        h( 'h2', { class: 'title' }, '수업 서랍' ),
        h( 'span', { class: 'status', 'data-state': st.state, title: '이 시뮬레이션의 내용 확인 상태' }, st.date ? `${st.label} · ${st.date}` : st.label ),
        h( 'button', { type: 'button', 'data-act': 'close', 'aria-label': '서랍 닫기', onclick: () => api.close() }, '닫기' ) ),
      h( 'div', { class: 'tabs', role: 'tablist', 'aria-label': '서랍 탭' }, tabButtons ),
      h( 'div', { class: 'body' }, panels.log, panels.graphs, panels.lessons ) );
    panel.addEventListener( 'keydown', e => { if ( e.key === 'Escape' ) { api.close(); openBtn.focus(); } } );

    shadow.appendChild( h( 'style', null, DATA.css ) );
    shadow.appendChild( h( 'div', { class: 'root' }, openBtn, panel ) );
    return { openBtn, panel, tabButtons, panels, confirm, legacy, live, table, graphSel, screenSel, freeBox, canvas };
  }

  function lessonsView() {
    const L = DATA.lessons;
    if ( !L ) { return h( 'p', { class: 'notice' }, '이 시뮬레이션의 수업 공식·용어는 아직 준비되지 않았습니다.' ); }
    const badges = x => ( x.emphasis || x.outOfScope ? h( 'div', { class: 'badges' },
      x.emphasis ? h( 'span', { class: 'badge emph' }, '수업 강조' ) : null,
      x.outOfScope ? h( 'span', { class: 'badge oos' }, '참고 · 시험 범위 아님' ) : null ) : null );
    const formulas = ( L.formulas || [] ).map( f => h( 'div', { class: 'card', 'data-formula': f.key },
      badges( f ),
      h( 'h3', null, f.name ),
      h( 'p', { class: 'expr' }, f.expr ),
      h( 'ul', { class: 'vars' }, ( f.variables || [] ).map( v => h( 'li', null,
        `${v.symbol}: ${v.name}${v.unit ? ` (${v.unit})` : ''}${'constant' in v ? ` = ${withUnit( v.constant, v.unit )}` : ''}` ) ) ),
      f.note ? h( 'p', { class: 'note' }, /^참고/.test( f.note ) ? f.note : `참고: ${f.note}` ) : null,
      C.substitution( f, M, {} ) ? h( 'div', { class: 'subst', 'data-subst': f.key } ) : null ) );
    const conv = ( L.classUnits || [] ).length ? [
      h( 'h3', { class: 'section-title' }, '시뮬레이션 단위와 수업 단위' ),
      h( 'ul', { class: 'vars' }, L.classUnits.map( u => h( 'li', null, `${u.phetUnit} → ${u.classUnit}: × ${C.formatNumber( u.factor )}` ) ) ) ] : [];
    return h( 'div', null,
      h( 'h3', { class: 'section-title' }, L.title ),
      h( 'h3', { class: 'section-title' }, '공식' ),
      formulas,
      conv,
      h( 'h3', { class: 'section-title' }, '용어' ),
      h( 'dl', { class: 'terms' }, ( L.terms || [] ).map( t => h( 'div', null,
        h( 'dt', null, t.term ), badges( t ), h( 'dd', null, t.definition ) ) ) ) );
  }

  function askClear() {
    ui.confirm.querySelector( '.confirm-text' ).textContent =
      `이 시뮬레이션의 측정 기록 ${log.rows.length}줄을 모두 지우고 새 실험을 시작할까요? 지운 기록은 되돌릴 수 없으니 필요하면 먼저 CSV로 받아 두세요.`;
    ui.confirm.hidden = false;
  }

  function renderLegacy() {
    const list = legacyLogs();
    ui.legacy.hidden = !list.length;
    if ( list.length ) {
      ui.legacy.querySelector( '.legacy-text' ).textContent =
        `측정 항목이 바뀌어서 이전 기록 ${list[ 0 ].log.rows.length}줄은 새 표와 섞지 않습니다. CSV로 내려받으면 이 브라우저에서는 지워집니다.`;
    }
  }
  function resolveLegacy( keep ) {
    const list = legacyLogs();
    if ( !list.length ) { return; }
    const first = list[ 0 ];
    if ( keep ) {
      download( `${SIM}-측정기록-v${first.version}.csv`, csvBlob( C.toCsv( { measurements: first.log.measurements || [], rows: first.log.rows } ) ) );
    }
    store.remove( first.key );
    renderLegacy();
  }

  function renderLive() {
    if ( !ui ) { return; }
    const values = readNow();
    ui.live.replaceChildren( ...M.flatMap( m => {
      const v = values[ m.key ];
      const cls = m.classUnit && v !== null ? ` · ${withUnit( C.classValue( v, m.classUnit ), m.classUnit.unit )}` : '';
      return [ h( 'dt', null, m.name ), h( 'dd', null, withUnit( v, m.unit ) + cls ) ];
    } ) );
    for ( const f of ( DATA.lessons && DATA.lessons.formulas ) || [] ) {
      const box = shadow.querySelector( `[data-subst="${f.key}"]` );
      const s = box && C.substitution( f, M, values );
      if ( s ) {
        box.replaceChildren( h( 'p', null, '현재 값 대입' ), ...s.map( x => h( 'p', null, `${x.symbol} = ${withUnit( x.value, x.unit )}${x.constant ? ' (상수)' : ''}` ) ) );
      }
    }
  }

  function renderTable() {
    if ( !ui ) { return; }
    const [ thead, tbody ] = ui.table.children;
    thead.replaceChildren( h( 'tr', null, h( 'th', null, '#' ), h( 'th', null, '시각' ), h( 'th', null, '화면' ), COLS.map( c => h( 'th', null, c.label ) ) ) );
    tbody.replaceChildren( ...log.rows.map( ( r, i ) => h( 'tr', null,
      h( 'td', null, String( i + 1 ) ), h( 'td', null, C.formatTime( r.time ).slice( 11 ) ), h( 'td', null, r.screen || '' ),
      COLS.map( c => h( 'td', null, C.formatNumber( C.cellValue( r, c, M ) ) ) ) ) ) );
    if ( !log.rows.length ) {
      tbody.appendChild( h( 'tr', null, h( 'td', { class: 'empty', colSpan: 3 + COLS.length }, '아직 기록이 없습니다. 「기록」을 누르면 지금 값이 한 줄로 남습니다.' ) ) );
    }
    shadow.querySelector( '.log-count' ).textContent = `기록 ${log.rows.length}줄`;
    const screens = [ ...new Set( log.rows.map( r => r.screen ).filter( Boolean ) ) ];
    const cur = ui.screenSel.value;
    ui.screenSel.replaceChildren( h( 'option', { value: '' }, '모든 화면' ), ...screens.map( s => h( 'option', { value: s, selected: s === cur }, s ) ) );
    ui.screenSel.hidden = screens.length < 2;
  }

  function renderGraph() {
    if ( !ui || !isOpen || tab !== 'graphs' ) { return; }
    const id = ui.graphSel.value;
    ui.freeBox.hidden = id !== 'free';
    const spec = graphSpec( id );
    const series = computeSeries( spec, ui.screenSel.value );
    // @canvas:begin
    const w = ui.canvas.clientWidth || G.fallbackWidth;
    const h = drawGraph( ui.canvas, spec, series, { w, h: Math.round( w * G.aspect ), dpr: window.devicePixelRatio || 1, grow: true } );
    ui.canvas.style.height = `${h}px`;
    // @canvas:end
    ui.canvas.setAttribute( 'aria-label', `${spec.title} 그래프` );
    const lines = fitLines( spec, series );
    shadow.querySelector( '.fit-info' ).textContent = lines.length ? lines.join( ' / ' ) :
      ( spec.fit ? '추세선은 서로 다른 x 값의 기록이 2줄 이상일 때 그려집니다.' : '' );
  }

  function showTab( id ) {
    tab = id;
    for ( const b of ui.tabButtons ) { b.setAttribute( 'aria-selected', String( b.dataset.tab === id ) ); }
    for ( const [ k, p ] of Object.entries( ui.panels ) ) { p.hidden = k !== id; }
    renderLive();
    renderGraph();
  }

  /**
   * Bottom of the selected screen's play area (its ScreenView layoutBounds) in viewport CSS px, or null.
   * Read only; the sim is never moved or re-laid out.
   */
  function simViewBottom() {
    try {
      const sc = helpers.screen();
      const v = sc && ( sc.view || sc._view );
      if ( !v || !v.layoutBounds || typeof v.localToGlobalBounds !== 'function' ) { return null; }
      const b = v.localToGlobalBounds( v.layoutBounds ).maxY;
      return Number.isFinite( b ) ? b : null;
    }
    catch ( e ) { return null; }
  }

  /**
   * Sheet mode: the sheet covers only the space below the play area (PhET letterboxes portrait phones), so
   * the experiment stays visible above it. drawer.css clamps this between drawer.sheetMinHeight and
   * drawer.sheetHeight; without a sim view the sheet keeps drawer.sheetHeight.
   */
  function fitSheet() {
    if ( !ui ) { return; }
    const bottom = api.layout().mode === 'sheet' ? simViewBottom() : null;
    if ( bottom === null ) { ui.panel.style.removeProperty( '--sheet-fit' ); return; }
    ui.panel.style.setProperty( '--sheet-fit', `${Math.max( 0, window.innerHeight - bottom )}px` );
  }

  function updateMode() {
    if ( ui ) { ui.panel.dataset.mode = api.layout().mode; }
    fitSheet();
    renderGraph();
  }

  function mount() {
    if ( host ) { return; }
    host = document.createElement( 'div' );
    host.id = 'bsshs-drawer-host';
    shadow = host.attachShadow( { mode: 'open' } );
    // Keep every pointer, touch, wheel, key and focus event that starts inside the drawer away from
    // the sim (scenery listens on window/document in the bubble phase).
    for ( const t of [ 'pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'pointerover', 'pointerout', 'gotpointercapture', 'lostpointercapture',
                       'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'click', 'dblclick', 'contextmenu',
                       'touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel', 'keydown', 'keyup', 'keypress', 'focusin', 'focusout', 'input', 'change' ] ) {
      host.addEventListener( t, e => e.stopPropagation() );
    }
    ui = buildUi();
    document.body.appendChild( host );
    renderTable();
    updateMode();
    const mq = window.matchMedia( `(max-width: ${LAYOUT.sheetMaxWidthPx}px)` );
    if ( mq.addEventListener ) { mq.addEventListener( 'change', updateMode ); }
    window.addEventListener( 'resize', () => { fitSheet(); if ( isOpen ) { renderGraph(); } } );
    api.mounted = true;
  }

  function simReady() {
    if ( !window.phet ) { return document.readyState !== 'loading'; }
    const sim = helpers.sim();
    if ( !sim ) { return false; }
    const cc = sim.isConstructionCompleteProperty || sim._isConstructionCompleteProperty;
    if ( cc && cc.value === false ) { return false; }
    return !document.querySelector( '[id*="splash"]' );
  }

  // ------------------------------------------------------------------ public API
  const api = {
    simId: SIM,
    version: VERSION,
    storageKey: KEY,
    helpers,
    mounted: false,
    adapterRegistered: false,
    /**
     * Called once by adapters/<id>/adapter.mjs.
     * @param {{ simId: string, screenName?: () => string, read: () => Record<string, number|null>, apply?: (p: object) => any }} a
     * @returns {boolean}
     */
    register( a ) {
      if ( !a || a.simId !== SIM || typeof a.read !== 'function' ) {
        console.error( `bsshsDrawer.register: expected { simId: '${SIM}', read() }`, a );
        return false;
      }
      adapter = a;
      api.adapterRegistered = true;
      if ( ui ) { const n = shadow.querySelector( '.no-adapter' ); if ( n ) { n.remove(); } renderLive(); }
      return true;
    },
    open( which ) {
      if ( !ui ) { return false; }
      if ( which ) { if ( !TABS.some( t => t[ 0 ] === which ) ) { throw new Error( `unknown tab ${which}` ); } }
      isOpen = true;
      fitSheet();
      ui.panel.classList.add( 'open' );
      ui.openBtn.setAttribute( 'aria-expanded', 'true' );
      renderLegacy();
      showTab( which || tab );
      clearInterval( liveTimer );
      liveTimer = setInterval( () => { fitSheet(); renderLive(); }, LAYOUT.liveRefreshMs );
      return true;
    },
    close() {
      if ( !ui ) { return; }
      isOpen = false;
      ui.panel.classList.remove( 'open' );
      ui.openBtn.setAttribute( 'aria-expanded', 'false' );
      ui.confirm.hidden = true;
      clearInterval( liveTimer );
    },
    isOpen: () => isOpen,
    /** Appends the current values as one row; returns a copy of the row (null without an adapter). */
    record() {
      if ( !adapter ) { return null; }
      const row = { time: new Date().toISOString(), screen: screenNow(), values: readNow() };
      log.rows.push( row );
      saveLog();
      renderTable();
      renderGraph();
      return JSON.parse( JSON.stringify( row ) );
    },
    rows: () => JSON.parse( JSON.stringify( log.rows ) ),
    /** Current adapter values (sim units, null when unknown), without recording them. */
    read: () => readNow(),
    /** Current screen name as it would be recorded. */
    screenName: () => screenNow(),
    /** Clears this sim's log (no confirmation; the UI asks first). */
    clear() {
      log.rows = [];
      saveLog();
      renderTable();
      renderGraph();
    },
    exportCsv: () => C.toCsv( { measurements: M, rows: log.rows } ),
    /** @param {string} graphId - a drawer.json graph id or 'free' @returns {Promise<Blob>} */
    exportPng( graphId ) {
      const spec = graphSpec( graphId );
      if ( !spec ) { return Promise.reject( new Error( `unknown graph ${graphId}` ) ); }
      const c = document.createElement( 'canvas' );
      // @canvas:begin
      drawGraph( c, spec, computeSeries( spec, ui && ui.screenSel.value ), { w: G.pngWidth, h: G.pngHeight, dpr: 1 } );
      // @canvas:end
      return new Promise( ( res, rej ) => c.toBlob( b => ( b ? res( b ) : rej( new Error( 'toBlob failed' ) ) ), 'image/png' ) );
    },
    /** Linear fits of a graph over all rows. @param {string} graphId */
    fits( graphId ) {
      const spec = graphSpec( graphId );
      return spec ? computeSeries( spec, null ).map( s => s.fit ) : null;
    },
    status: () => ( { ...DATA.status } ),
    hash: () => DATA.hash,
    legacy: () => legacyLogs().map( l => ( { version: l.version, rows: l.log.rows.length } ) ),
    layout: () => ( { mode: window.matchMedia( `(max-width: ${LAYOUT.sheetMaxWidthPx}px)` ).matches ? 'sheet' : 'side', open: isOpen } ),
    /** Viewport rect of the open button (what tools/compare-layout.mjs --exclude-button skips). */
    buttonRect() {
      if ( !ui ) { return null; }
      const r = ui.openBtn.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    /** For automated checks only: put the model into a known state through the adapter. */
    async apply( params ) {
      if ( !adapter || typeof adapter.apply !== 'function' ) { throw new Error( 'adapter has no apply()' ); }
      await adapter.apply( params || {} );
    }
  };
  window.bsshsDrawer = api;

  ( function waitForSim() {
    if ( simReady() ) { mount(); }
    else { setTimeout( waitForSim, 100 ); }
  } )();
} )();
