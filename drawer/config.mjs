// Drawer layout values, every one of them read from theme/tokens.json (invariant 2: that file is the
// only place holding values). This module only reshapes them for drawer.css placeholders and the
// runtime; it holds no number of its own. Keys (documented in docs/theme.md, "서랍 키"):
//   size.touchTarget / size.hairline / size.strongBorder, breakpoint.sheet / breakpoint.large,
//   drawer.width / widthLarge / sheetHeight / sheetMinHeight / motion / zIndex / liveRefresh,
//   drawer.graph.* (graph canvas), font.sizes.largeScreenBody / graphMin (through their CSS variables).
import { loadTokens } from '../theme/index.mjs';

/** @param {string} path @param {unknown} v @param {RegExp} re */
function need( path, v, re ) {
  if ( typeof v !== 'string' || !re.test( v ) ) { throw new Error( `theme/tokens.json: ${path} must match ${re}, got ${JSON.stringify( v )}` ); }
  return v;
}
const PX = /^\d+(\.\d+)?px$/;
const LEN = /^\d+(\.\d+)?(px|vh|vw|rem|em)$/;
const MS = /^\d+ms$/;

/** Graph keys that are plain positive numbers (ratios of the graph font size, counts, PNG pixels). */
const GRAPH_NUMBERS = [ 'aspect', 'textPerWidth', 'titleScale', 'tickScale', 'labelScale', 'markerScale', 'padLeft', 'padRight',
  'padTop', 'padBottom', 'lineGap', 'inset', 'gap', 'axisLabelGap', 'legendRow', 'legendSwatch', 'rangePad', 'tickCount',
  'pngWidth', 'pngHeight', 'labelMaxLines' ];
/** Graph keys that are px lengths (passed on as numbers). */
const GRAPH_PX = [ 'fallbackWidth', 'lineWidth', 'gridLineWidth' ];

/**
 * drawer.graph, validated: every key present, numbers positive, px lengths as numbers, dash = [on, off].
 * @param {any} g
 * @returns {Record<string, number|number[]>}
 */
function graphValues( g ) {
  if ( !g || typeof g !== 'object' ) { throw new Error( 'theme/tokens.json: missing drawer.graph' ); }
  const out = {};
  for ( const k of GRAPH_NUMBERS ) {
    if ( typeof g[ k ] !== 'number' || !( g[ k ] > 0 ) ) { throw new Error( `theme/tokens.json: drawer.graph.${k} must be a positive number` ); }
    out[ k ] = g[ k ];
  }
  for ( const k of GRAPH_PX ) { out[ k ] = Number.parseFloat( need( `drawer.graph.${k}`, g[ k ], PX ) ); }
  if ( !Array.isArray( g.dash ) || g.dash.length !== 2 || !g.dash.every( x => typeof x === 'number' && x > 0 ) ) {
    throw new Error( 'theme/tokens.json: drawer.graph.dash must be [on, off] (positive ratios of the graph font size)' );
  }
  out.dash = [ ...g.dash ];
  const unknown = Object.keys( g ).filter( k => !( k in out ) );
  if ( unknown.length ) { throw new Error( `theme/tokens.json: unknown drawer.graph keys ${unknown.join( ', ' )}` ); }
  return out;
}

/**
 * Drawer layout derived from the tokens.
 * @param {any} [tokens]
 * @returns {{ sheetMaxWidthPx: number, wideMinWidthPx: number, touchTarget: string, hairline: string,
 *             strongBorder: string, sideWidth: string, sideWidthWide: string, sheetHeight: string, sheetMinHeight: string,
 *             motion: string, zIndex: string, liveRefreshMs: number, graph: Record<string, number|number[]> }}
 */
export function drawerLayout( tokens = loadTokens() ) {
  const t = tokens;
  for ( const g of [ 'size', 'breakpoint', 'drawer' ] ) {
    if ( !t[ g ] || typeof t[ g ] !== 'object' ) { throw new Error( `theme/tokens.json: missing group ${g}` ); }
  }
  need( 'font.sizes.largeScreenBody', t.font.sizes.largeScreenBody, PX );
  need( 'font.sizes.graphMin', t.font.sizes.graphMin, PX );
  return {
    sheetMaxWidthPx: Number.parseFloat( need( 'breakpoint.sheet', t.breakpoint.sheet, PX ) ),
    wideMinWidthPx: Number.parseFloat( need( 'breakpoint.large', t.breakpoint.large, PX ) ),
    touchTarget: need( 'size.touchTarget', t.size.touchTarget, PX ),
    hairline: need( 'size.hairline', t.size.hairline, PX ),
    strongBorder: need( 'size.strongBorder', t.size.strongBorder, PX ),
    sideWidth: `min(100%, ${need( 'drawer.width', t.drawer.width, LEN )})`,
    sideWidthWide: `min(100%, ${need( 'drawer.widthLarge', t.drawer.widthLarge, LEN )})`,
    sheetHeight: need( 'drawer.sheetHeight', t.drawer.sheetHeight, LEN ),
    sheetMinHeight: need( 'drawer.sheetMinHeight', t.drawer.sheetMinHeight, LEN ),
    motion: need( 'drawer.motion', t.drawer.motion, MS ),
    zIndex: need( 'drawer.zIndex', t.drawer.zIndex, /^\d+$/ ),
    liveRefreshMs: Number.parseInt( need( 'drawer.liveRefresh', t.drawer.liveRefresh, MS ), 10 ),
    graph: graphValues( t.drawer.graph )
  };
}

/** Layout from the repo's theme/tokens.json. (A fixed element's 100% is the viewport width.) */
export const DRAWER_LAYOUT = drawerLayout();
