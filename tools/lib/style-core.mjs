// Pure halves of the style tools (V11 check-style, V12 compare-bounds, style-review): palette matching,
// contrast, turning probe output into findings, applying exceptions, and diffing node bounds. No browser,
// no file reads except loadStyleDone, so every rule is unit-tested in tests/tools/style-core.test.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { simPalette, parseTokenColor } from '../../theme/index.mjs';
import { exceptionProblems, exceptionCovers } from '../../theme/sim-style.mjs';
import { classifyColors } from './style-page.mjs';

export { exceptionCovers };

/** WCAG relative luminance of [r, g, b] (0-255). @param {number[]} c */
export function luminance( c ) {
  const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ( ( s + 0.055 ) / 1.055 ) ** 2.4; };
  return 0.2126 * f( c[ 0 ] ) + 0.7152 * f( c[ 1 ] ) + 0.0722 * f( c[ 2 ] );
}

/** WCAG contrast ratio of two opaque [r, g, b] colors. @param {number[]} a @param {number[]} b @returns {number} */
export function contrastRatio( a, b ) {
  const la = luminance( a );
  const lb = luminance( b );
  return ( Math.max( la, lb ) + 0.05 ) / ( Math.min( la, lb ) + 0.05 );
}

/** [r, g, b, a] painted over an opaque [r, g, b]. @param {number[]} fg @param {number[]} bg @returns {number[]} */
export function compositeOver( fg, bg ) {
  const a = fg[ 3 ] === undefined ? 1 : fg[ 3 ];
  return [ 0, 1, 2 ].map( i => Math.round( fg[ i ] * a + bg[ i ] * ( 1 - a ) ) );
}

/**
 * Token path of the palette color equal to `rgba` within `tol`. An opaque palette color matches regardless of the
 * paint's alpha; a translucent one (a border at 8%) matches only a paint with that alpha, so an opaque black can
 * never hide behind a translucent black token.
 * @param {number[]} rgba - [r, g, b, a]
 * @param {ReturnType<typeof simPalette>} palette
 * @param {number} tol
 * @returns {string|null}
 */
export function matchPalette( rgba, palette, tol ) {
  const a = rgba[ 3 ] === undefined ? 1 : rgba[ 3 ];
  const hit = palette.find( p => Math.abs( p.rgba.r - rgba[ 0 ] ) <= tol && Math.abs( p.rgba.g - rgba[ 1 ] ) <= tol &&
                                 Math.abs( p.rgba.b - rgba[ 2 ] ) <= tol && ( p.rgba.a === 1 || Math.abs( p.rgba.a - a ) <= 0.02 ) );
  return hit ? hit.path : null;
}

/**
 * The opaque colors screenshots are judged against: every opaque palette color, plus each translucent one
 * painted over the canvas, surface and dark canvas (the places a hairline border lands).
 * @param {any} tokens
 * @returns {number[][]} [r, g, b] list
 */
export function pixelPalette( tokens ) {
  const pal = simPalette( tokens );
  const bases = [ tokens.sim.canvas, tokens.sim.surface, tokens.sim.canvasDark ].map( v => { const c = parseTokenColor( v ); return [ c.r, c.g, c.b ]; } );
  const out = [];
  for ( const p of pal ) {
    if ( p.rgba.a === 1 ) { out.push( [ p.rgba.r, p.rgba.g, p.rgba.b ] ); }
    else { for ( const b of bases ) { out.push( compositeOver( [ p.rgba.r, p.rgba.g, p.rgba.b, p.rgba.a ], b ) ); } }
  }
  const seen = new Set();
  return out.filter( c => { const k = c.join( ',' ); return seen.has( k ) ? false : ( seen.add( k ), true ); } );
}

/** @param {number[]} c @returns {string} `r,g,b` (what an exception's `color` field holds) */
export const colorKey = c => `${Math.round( c[ 0 ] )},${Math.round( c[ 1 ] )},${Math.round( c[ 2 ] )}`;

/**
 * Share of a screenshot's pixels outside the palette.
 * @param {{ total: number, colors: number[][] }} shot - from analyzeShot (colors: [r, g, b, count])
 * @param {number[][]} palette
 * @param {number} tol
 * @returns {{ share: number, outside: number, total: number, top: { color: string, count: number }[] }}
 */
export function outsideShare( shot, palette, tol ) {
  const inside = classifyColors( { colors: shot.colors.map( c => c.slice( 0, 3 ) ), palette, tol } );
  let outside = 0;
  const outList = [];
  shot.colors.forEach( ( c, i ) => { if ( !inside[ i ] ) { outside += c[ 3 ]; outList.push( { color: colorKey( c ), count: c[ 3 ] } ); } } );
  outList.sort( ( a, b ) => b.count - a.count );
  return { share: shot.total ? outside / shot.total : 0, outside, total: shot.total, top: outList.slice( 0, 5 ) };
}

/**
 * One view of a sim (a screen, or a dialog opened on a screen) turned into findings.
 * @param {{ screen: number, dialog?: string }} view
 * @param {{ scene: any, shot: any, originals?: Map<string,string> }} raw - scene: sceneSnapshot output; shot: analyzeShot output
 * @param {any} tokens
 * @param {{ declaredCanvas: string[], knownTexts?: Set<string> }} opts
 * @returns {{ findings: object[], stats: object }}
 */
export function findingsOfView( view, raw, tokens, opts ) {
  const tol = tokens.sim.check.paletteTolerance;
  const palette = simPalette( tokens );
  const findings = [];
  const add = f => findings.push( { screen: view.screen, ...( view.dialog ? { dialog: view.dialog } : {} ), ...f } );
  for ( const p of raw.scene.paints ) {
    if ( p.type === 'gradient' || p.type === 'pattern' ) { add( { kind: 'gradient', node: p.node, detail: `${p.role} is a ${p.type}` } ); continue; }
    if ( p.type === 'unparsed' ) { add( { kind: p.role, node: p.node, color: 'unparsed', detail: `${p.role} paint not understood: ${p.text}` } ); continue; }
    if ( !matchPalette( p.rgba, palette, tol ) ) { add( { kind: p.role, node: p.node, color: colorKey( p.rgba ), detail: `${p.role} outside the palette` } ); }
  }
  const declared = new Set( opts.declaredCanvas );
  for ( const c of raw.scene.canvases ) {
    if ( !declared.has( c.node ) && !declared.has( c.node.split( '.' ).pop() ) ) { add( { kind: 'canvas', node: c.node, detail: 'painted outside the scene graph but not declared in canvasNodes' } ); }
  }
  for ( const im of raw.scene.images ) {
    const orig = ( im.bytesSha && raw.originals && raw.originals.get( `b:${im.bytesSha}` ) ) || ( im.pixelSha && raw.originals && raw.originals.get( `p:${im.pixelSha}` ) );
    if ( orig ) { add( { kind: 'image', node: orig, detail: 'image equals the original art' } ); }
  }
  const stats = { nodes: raw.scene.count, paints: raw.scene.paints.length, texts: raw.scene.texts.length, images: raw.scene.images.length, canvases: raw.scene.canvases.length };
  if ( raw.shot ) {
    const o = outsideShare( raw.shot, opts.pixelPalette, tol );
    stats.outsideShare = Math.round( o.share * 100000 ) / 100000;
    stats.outsideTop = o.top;
    if ( o.share > tokens.sim.check.outsideShareMax ) {
      add( { kind: 'pixels', node: 'screen', detail: `${( o.share * 100 ).toFixed( 2 )}% of the pixels are outside the palette (limit ${( tokens.sim.check.outsideShareMax * 100 ).toFixed( 2 )}%)`, share: o.share, top: o.top } );
    }
    let worst = null;
    for ( const t of raw.scene.texts ) {
      if ( !t.fill ) { continue; }
      if ( opts.knownTexts && opts.knownTexts.has( textKey( t ) ) ) { continue; }
      const bg = raw.shot.backgrounds[ textKey( t ) ];
      if ( !bg ) { continue; }
      const ratio = contrastRatio( compositeOver( t.fill, bg ), bg );
      if ( !worst || ratio < worst.ratio ) { worst = { ratio, text: t.text.trim().slice( 0, 40 ) }; }
      if ( ratio < tokens.sim.check.minContrast ) {
        add( { kind: 'contrast', node: t.text.trim().slice( 0, 40 ), color: colorKey( t.fill ), detail: `contrast ${ratio.toFixed( 2 )}:1 against ${colorKey( bg )} (needs ${tokens.sim.check.minContrast}:1)`, ratio } );
      }
    }
    stats.worstContrast = worst ? { ratio: Math.round( worst.ratio * 100 ) / 100, text: worst.text } : null;
  }
  return { findings, stats };
}

/** Identity of a painted thing within one screen: kind of paint, node, box and color. @param {any} p */
const paintKey = p => [ p.role || 'x', p.node, p.bounds.map( Math.round ).join( ',' ), p.rgba ? p.rgba.join( ',' ) : p.type || '' ].join( '|' );

/**
 * What a dialog adds on top of the screen it was opened on: the scene without everything the plain screen
 * already had (the nodes under the dialog's barrier are still in the scene graph).
 * @param {any} scene - sceneSnapshot of the dialog view
 * @param {any} base - sceneSnapshot of the plain screen
 * @returns {any}
 */
export function subtractScene( scene, base ) {
  const known = new Set( [ ...base.paints, ...base.images, ...base.canvases, ...base.texts ].map( paintKey ) );
  const keep = list => list.filter( x => !known.has( paintKey( x ) ) );
  return { ...scene, paints: keep( scene.paints ), images: keep( scene.images ), canvases: keep( scene.canvases ), texts: keep( scene.texts ) };
}

/** Key joining a text node's box to the background sampled for it. @param {{ text: string, bounds: number[] }} t */
export const textKey = t => `${t.text.trim().slice( 0, 60 )}@${Math.round( t.bounds[ 0 ] )},${Math.round( t.bounds[ 1 ] )}`;

/**
 * Groups equal findings (same kind, view, node, color) so a thousand identical fills read as one line.
 * @param {object[]} findings
 * @returns {object[]} findings with `count`
 */
export function groupFindings( findings ) {
  const map = new Map();
  for ( const f of findings ) {
    const key = [ f.kind, f.screen, f.dialog || '', f.node, f.color || '' ].join( '|' );
    if ( map.has( key ) ) { map.get( key ).count++; } else { map.set( key, { ...f, count: 1 } ); }
  }
  return [ ...map.values() ];
}

/**
 * Applies a sim's style file to grouped findings.
 * @param {object[]} grouped
 * @param {any} style - theme/sim-styles/<id>.json content or null
 * @param {any} tokens
 * @returns {{ open: object[], excepted: object[], unusedExceptions: object[], problems: string[] }}
 */
export function applyExceptions( grouped, style, tokens ) {
  const exceptions = ( style && style.exceptions ) || [];
  const problems = exceptionProblems( style, tokens.sim.check.maxExceptions );
  const open = [];
  const excepted = [];
  const used = new Set();
  for ( const f of grouped ) {
    const i = exceptions.findIndex( e => exceptionCovers( f, e ) );
    if ( i >= 0 ) { used.add( i ); excepted.push( { ...f, exception: i } ); } else { open.push( f ); }
  }
  // An exception without approval does not excuse anything: its findings stay open.
  const approved = new Set( exceptions.map( ( e, i ) => ( typeof e.approvedBy === 'string' && e.approvedBy.trim() ? i : -1 ) ).filter( i => i >= 0 ) );
  const stillOpen = excepted.filter( f => !approved.has( f.exception ) );
  return {
    open: [ ...open, ...stillOpen ],
    excepted: excepted.filter( f => approved.has( f.exception ) ),
    unusedExceptions: exceptions.map( ( e, i ) => ( { ...e, index: i } ) ).filter( e => !used.has( e.index ) ),
    problems
  };
}

/**
 * Reads data/style-done.json: an array of sim ids. `empty` is true only for a genuinely empty array, so a
 * missing or broken file can never pass as "nothing to check".
 * @param {string} file
 * @param {string[]} knownIds
 * @returns {{ ids: string[], empty: boolean, problems: string[] }}
 */
export function loadStyleDone( file, knownIds ) {
  if ( !existsSync( file ) ) { return { ids: [], empty: false, problems: [ `${file} does not exist` ] }; }
  let raw;
  try { raw = JSON.parse( readFileSync( file, 'utf8' ) ); } catch ( e ) { return { ids: [], empty: false, problems: [ `${file}: ${e.message}` ] }; }
  if ( !Array.isArray( raw ) || !raw.every( s => typeof s === 'string' ) ) { return { ids: [], empty: false, problems: [ `${file} must be an array of sim ids` ] }; }
  const problems = [];
  const seen = new Set();
  for ( const id of raw ) {
    if ( seen.has( id ) ) { problems.push( `${id} is listed twice` ); }
    seen.add( id );
    if ( knownIds && !knownIds.includes( id ) ) { problems.push( `${id} is not one of the ${knownIds.length} sims` ); }
  }
  return { ids: raw, empty: raw.length === 0 && problems.length === 0, problems };
}

// ---- V12 ----------------------------------------------------------------------------------------------------

/**
 * Compares two bounds snapshots of the same screen.
 * @param {{ path: string, name: string, visible: boolean, b: number[] }[]} base
 * @param {{ path: string, name: string, visible: boolean, b: number[] }[]} cur
 * @param {number} tol - pixels (tokens.sim.check.boundsTolerance)
 * @returns {{ changed: object[], missing: object[], added: object[], visibility: object[], compared: number }}
 */
export function diffBounds( base, cur, tol ) {
  const key = n => `${n.path}|${n.name}`;
  const curMap = new Map( cur.map( n => [ key( n ), n ] ) );
  const baseMap = new Map( base.map( n => [ key( n ), n ] ) );
  const changed = [];
  const missing = [];
  const visibility = [];
  let compared = 0;
  for ( const n of base ) {
    const m = curMap.get( key( n ) );
    if ( !m ) { if ( n.visible ) { missing.push( { path: n.path, name: n.name, b: n.b } ); } continue; }
    if ( n.visible !== m.visible ) { visibility.push( { path: n.path, name: n.name, base: n.visible, cur: m.visible } ); continue; }
    if ( !n.visible ) { continue; }
    compared++;
    const delta = n.b.map( ( v, i ) => Math.round( ( m.b[ i ] - v ) * 1000 ) / 1000 );
    if ( delta.some( d => Math.abs( d ) > tol ) ) { changed.push( { path: n.path, name: n.name, base: n.b, cur: m.b, delta } ); }
  }
  const added = cur.filter( n => n.visible && !baseMap.has( key( n ) ) ).map( n => ( { path: n.path, name: n.name, b: n.b } ) );
  return { changed, missing, added, visibility, compared };
}
