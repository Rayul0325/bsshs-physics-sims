// In-page probes of the style tools. Every export here is serialised into the browser by Playwright, so each
// is SELF-CONTAINED (no outer references, no Node APIs) and takes one argument. The Node-side halves live in
// style-core.mjs; the pure ones here (classifyColors) are also unit-tested directly.
//
// Class names are mangled in the built sims (`Ta`, `Sh`), so nodes are named through the PhET namespaces
// (`phet.scenery.Path`, `phet.faradaysLaw.MagnetNode`): the constructor -> "ns.Name" table is rebuilt in each probe.

/** Builds nothing visible; returns "ns.Name" for a constructor. Inlined into the probes below via toString. */
const NAMES_SRC = `
const names = new Map();
for ( const ns of Object.keys( window.phet ) ) {
  const o = window.phet[ ns ];
  if ( !o || typeof o !== 'object' ) { continue; }
  for ( const k of Object.keys( o ) ) { let v; try { v = o[ k ]; } catch { continue; } if ( typeof v === 'function' && !names.has( v ) ) { names.set( v, ns + '.' + k ); } }
}
`;

/**
 * Bounds snapshot for V12: every node with own geometry (shape without stroke, text or image box) in global
 * coordinates, keyed by its child-index path. Containers carry no geometry of their own and are left out, so a
 * stroke change cannot ripple up through every ancestor.
 * @returns {{ nodes: { path: string, name: string, visible: boolean, b: number[] }[], total: number }}
 */
export function collectBounds() {
  // NAMES
  const sim = window.phet.joist.sim;
  const root = ( sim.display || window.phet.joist.display ).rootNode;
  const out = [];
  let total = 0;
  const round = v => Math.round( v * 1000 ) / 1000;
  const textOf = n => {
    for ( const k of [ 'renderedText', '_renderedText', 'text', '_text', 'string' ] ) {
      try { if ( typeof n[ k ] === 'string' ) { return n[ k ]; } } catch { /* getter may throw */ }
    }
    return null;
  };
  const geometry = n => {
    let local = null;
    const finite = b => b && Number.isFinite( b.minX ) && Number.isFinite( b.maxX ) && b.width >= 0 && b.height >= 0;
    const hasText = textOf( n ) !== null;
    const hasImage = !!( n._image || n._mipmapData );
    // getShape() is the shape without stroke and costs nothing; getSelfShape() gives the same bounds but takes
    // seconds on a wave-interference screen.
    if ( !hasText && !hasImage && typeof n.getShape === 'function' ) {
      try { const s = n.getShape(); if ( s && finite( s.bounds ) ) { local = s.bounds; } } catch { /* no shape */ }
    }
    if ( !local ) { try { if ( finite( n.selfBounds ) ) { local = n.selfBounds; } } catch { /* ignore */ } }
    if ( !local ) { return null; }
    try { const g = n.localToGlobalBounds( local ); return finite( g ) ? [ round( g.minX ), round( g.minY ), round( g.width ), round( g.height ) ] : null; } catch { return null; }
  };
  const rec = ( n, p, vis ) => {
    if ( !n ) { return; }
    total++;
    let visible = vis;
    try { if ( n.visible === false || ( n.opacity !== undefined && n.opacity <= 0 ) ) { visible = false; } } catch { /* ignore */ }
    const b = geometry( n );
    if ( b && ( b[ 2 ] > 0 || b[ 3 ] > 0 ) ) { out.push( { path: p, name: names.get( n.constructor ) || 'anonymous', visible, b } ); }
    ( n._children || n.children || [] ).forEach( ( c, i ) => rec( c, `${p}.${i}`, visible ) );
  };
  rec( root, 'r', true );
  return { nodes: out, total };
}

/**
 * Scene-graph snapshot for V11: what paints, with which paint. Only nodes that can be seen (effectively
 * visible, non-empty global bounds inside the viewport) count, so a dialog's nodes appear once it is open.
 * Returns paints (fill/stroke), texts, images (with byte and pixel hashes) and nodes painted outside the
 * scene graph (canvas/WebGL).
 * @param {{ viewW: number, viewH: number }} arg
 * @returns {Promise<{ paints: object[], texts: object[], images: object[], canvases: object[], count: number }>}
 */
export async function sceneSnapshot( { viewW, viewH } ) {
  // NAMES
  const sim = window.phet.joist.sim;
  const root = ( sim.display || window.phet.joist.display ).rootNode;
  const ctx2d = document.createElement( 'canvas' ).getContext( '2d', { willReadFrequently: true } );
  // A color string the canvas keeps unchanged when it rejects the next assignment (CSS strings it cannot parse).
  const sentinel = `#${[ 1, 2, 3 ].map( n => n.toString( 16 ).padStart( 2, '0' ) ).join( '' )}`;
  const parseCss = str => {
    ctx2d.fillStyle = sentinel;
    ctx2d.fillStyle = str;
    const v = ctx2d.fillStyle;
    if ( v === sentinel && String( str ).trim().toLowerCase() !== sentinel ) { return null; }
    if ( v.startsWith( '#' ) ) { return [ parseInt( v.slice( 1, 3 ), 16 ), parseInt( v.slice( 3, 5 ), 16 ), parseInt( v.slice( 5, 7 ), 16 ), 1 ]; }
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec( v );
    return m ? [ Number( m[ 1 ] ), Number( m[ 2 ] ), Number( m[ 3 ] ), m[ 4 ] === undefined ? 1 : Number( m[ 4 ] ) ] : null;
  };
  const unwrap = p => {
    for ( let i = 0; i < 4 && p && typeof p === 'object' && typeof p.link === 'function' && 'value' in p; i++ ) { p = p.value; }
    return p;
  };
  const describePaint = raw => {
    const p = unwrap( raw );
    if ( p === null || p === undefined ) { return null; }
    if ( typeof p === 'string' ) { const c = parseCss( p ); return c ? { type: 'color', rgba: c } : { type: 'unparsed', text: p.slice( 0, 40 ) }; }
    const nm = names.get( p.constructor ) || '';
    if ( /Gradient$/.test( nm ) || Array.isArray( p.stops ) || typeof p.addColorStop === 'function' ) { return { type: 'gradient', rgba: null }; }
    if ( /Pattern$/.test( nm ) ) { return { type: 'pattern', rgba: null }; }
    if ( typeof p.r === 'number' && typeof p.g === 'number' && typeof p.b === 'number' ) { return { type: 'color', rgba: [ p.r, p.g, p.b, typeof p.a === 'number' ? p.a : 1 ] }; }
    return { type: 'unparsed', text: nm || typeof p };
  };
  const textOf = n => {
    for ( const k of [ 'renderedText', '_renderedText', 'text', '_text', 'string' ] ) {
      try { if ( typeof n[ k ] === 'string' ) { return n[ k ]; } } catch { /* getter may throw */ }
    }
    return null;
  };
  const gb = n => {
    try { const b = n.globalBounds; return b && Number.isFinite( b.minX ) && b.width > 0 && b.height > 0 ? [ b.minX, b.minY, b.width, b.height ] : null; } catch { return null; }
  };
  const inView = b => b[ 0 ] < viewW && b[ 1 ] < viewH && b[ 0 ] + b[ 2 ] > 0 && b[ 1 ] + b[ 3 ] > 0;
  const hex = bytes => Array.from( new Uint8Array( bytes ), x => x.toString( 16 ).padStart( 2, '0' ) ).join( '' );
  const sha = async bytes => hex( await crypto.subtle.digest( 'SHA-256', bytes ) );
  const paints = [];
  const texts = [];
  const canvases = [];
  const imageNodes = [];
  let count = 0;
  const stack = [ [ root, true ] ];
  const seen = new Set();
  while ( stack.length ) {
    const [ n, vis ] = stack.pop();
    if ( !n || seen.has( n ) ) { continue; }
    seen.add( n );
    let visible = vis;
    try { if ( n.visible === false || ( n.opacity !== undefined && n.opacity <= 0 ) ) { visible = false; } } catch { /* ignore */ }
    if ( !visible ) { continue; }
    count++;
    const kids = n._children || n.children || [];
    const name = names.get( n.constructor ) || 'anonymous';
    const b = gb( n );
    if ( b && inView( b ) ) {
      const fill = describePaint( n._fill );
      let lineWidth = 0;
      try { lineWidth = typeof n.lineWidth === 'number' ? n.lineWidth : ( n._lineWidth || 0 ); } catch { lineWidth = 0; }
      const stroke = lineWidth > 0 ? describePaint( n._stroke ) : null;
      const t = kids.length ? null : textOf( n );
      if ( fill && !( fill.rgba && fill.rgba[ 3 ] === 0 ) ) { paints.push( { role: 'fill', node: name, bounds: b, ...fill } ); }
      if ( stroke && !( stroke.rgba && stroke.rgba[ 3 ] === 0 ) ) { paints.push( { role: 'stroke', node: name, bounds: b, lineWidth, ...stroke } ); }
      if ( t && t.trim() ) { texts.push( { text: t, node: name, bounds: b, fill: fill && fill.rgba ? fill.rgba : null } ); }
      if ( typeof n.paintCanvas === 'function' || typeof n.paintWebGL === 'function' || /WebGLNode$/.test( name ) ) { canvases.push( { node: name, bounds: b } ); }
      const img = n._image && typeof n._image.src === 'string' ? n._image :
                  n._mipmapData && n._mipmapData[ 0 ] && ( n._mipmapData[ 0 ].img || n._mipmapData[ 0 ].canvas ) || null;
      if ( img ) { imageNodes.push( { node: name, bounds: b, img } ); }
    }
    for ( const c of kids ) { stack.push( [ c, visible ] ); }
  }
  const images = [];
  const cache = new Map();
  for ( const it of imageNodes ) {
    const el = it.img;
    const key = typeof el.src === 'string' && el.src ? el.src : null;
    let info = key ? cache.get( key ) : null;
    if ( !info ) {
      info = { w: el.naturalWidth || el.width, h: el.naturalHeight || el.height, bytesSha: null, pixelSha: null };
      try {
        const m = key && /^data:[^;,]+;base64,(.*)$/s.exec( key );
        if ( m ) { const bin = atob( m[ 1 ] ); const u = new Uint8Array( bin.length ); for ( let i = 0; i < bin.length; i++ ) { u[ i ] = bin.charCodeAt( i ); } info.bytesSha = await sha( u ); }
        if ( info.w > 0 && info.h > 0 && ( el.complete !== false ) ) {
          const c = document.createElement( 'canvas' );
          c.width = info.w; c.height = info.h;
          const x = c.getContext( '2d', { willReadFrequently: true } );
          x.drawImage( el, 0, 0 );
          info.pixelSha = await sha( x.getImageData( 0, 0, info.w, info.h ).data );
        }
      } catch { /* tainted or not decoded: leave the hashes null */ }
      if ( key ) { cache.set( key, info ); }
    }
    images.push( { node: it.node, bounds: it.bounds, ...info } );
  }
  return { paints, texts, images, canvases, count };
}

/**
 * Hashes the pixels of PNG files, with the same canvas read as sceneSnapshot uses for images.
 * @param {{ name: string, b64: string }[]} list
 * @returns {Promise<{ name: string, pixelSha: string|null }[]>}
 */
export async function hashPngs( list ) {
  const hex = bytes => Array.from( new Uint8Array( bytes ), x => x.toString( 16 ).padStart( 2, '0' ) ).join( '' );
  const out = [];
  for ( const it of list ) {
    try {
      const img = new Image();
      img.src = `data:image/png;base64,${it.b64}`;
      await img.decode();
      const c = document.createElement( 'canvas' );
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext( '2d', { willReadFrequently: true } );
      x.drawImage( img, 0, 0 );
      out.push( { name: it.name, pixelSha: hex( await crypto.subtle.digest( 'SHA-256', x.getImageData( 0, 0, c.width, c.height ).data ) ) } );
    }
    catch { out.push( { name: it.name, pixelSha: null } ); }
  }
  return out;
}

/**
 * Which of the distinct colors are inside the palette: equal to a palette color, or lying on the straight
 * line between two palette colors (anti-aliased edges and soft shades are blends), all within `tol` per channel.
 * Pure and self-contained so the page and the unit tests run the same code.
 * @param {{ colors: number[][], palette: number[][], tol: number }} arg - colors/palette as [r, g, b]
 * @returns {boolean[]} one flag per color: true = inside the palette
 */
export function classifyColors( { colors, palette, tol } ) {
  const inside = [];
  for ( const c of colors ) {
    let ok = palette.some( p => Math.abs( p[ 0 ] - c[ 0 ] ) <= tol && Math.abs( p[ 1 ] - c[ 1 ] ) <= tol && Math.abs( p[ 2 ] - c[ 2 ] ) <= tol );
    for ( let i = 0; !ok && i < palette.length; i++ ) {
      for ( let j = i + 1; !ok && j < palette.length; j++ ) {
        const a = palette[ i ];
        const b = palette[ j ];
        const d = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ];
        const len2 = d[ 0 ] * d[ 0 ] + d[ 1 ] * d[ 1 ] + d[ 2 ] * d[ 2 ];
        if ( len2 === 0 ) { continue; }
        let t = ( ( c[ 0 ] - a[ 0 ] ) * d[ 0 ] + ( c[ 1 ] - a[ 1 ] ) * d[ 1 ] + ( c[ 2 ] - a[ 2 ] ) * d[ 2 ] ) / len2;
        t = Math.max( 0, Math.min( 1, t ) );
        if ( Math.abs( a[ 0 ] + t * d[ 0 ] - c[ 0 ] ) <= tol && Math.abs( a[ 1 ] + t * d[ 1 ] - c[ 1 ] ) <= tol && Math.abs( a[ 2 ] + t * d[ 2 ] - c[ 2 ] ) <= tol ) { ok = true; }
      }
    }
    inside.push( ok );
  }
  return inside;
}

/**
 * Reads one screenshot: its distinct colors with pixel counts, and for each text the color of the pixels behind
 * it (the commonest color within the text's box that is not the text's own). The palette test itself runs in
 * Node (classifyColors).
 * @param {{ png: string, dpr: number, texts: { key: string, bounds: number[], fill: number[] }[] }} arg
 * @returns {Promise<{ total: number, colors: number[][], backgrounds: Record<string, number[]|null> }>} colors: [r, g, b, count]
 */
export async function analyzeShot( { png, dpr, texts } ) {
  const img = new Image();
  img.src = `data:image/png;base64,${png}`;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement( 'canvas' );
  c.width = w; c.height = h;
  const x = c.getContext( '2d', { willReadFrequently: true } );
  x.drawImage( img, 0, 0 );
  const d = x.getImageData( 0, 0, w, h ).data;
  const counts = new Map();
  for ( let i = 0; i < d.length; i += 4 ) {
    const k = ( d[ i ] << 16 ) | ( d[ i + 1 ] << 8 ) | d[ i + 2 ];
    counts.set( k, ( counts.get( k ) || 0 ) + 1 );
  }
  const colors = [ ...counts ].map( ( [ k, n ] ) => [ k >> 16, ( k >> 8 ) & 255, k & 255, n ] );
  const backgrounds = {};
  for ( const t of texts ) {
    const x0 = Math.max( 0, Math.floor( t.bounds[ 0 ] * dpr ) - 2 );
    const y0 = Math.max( 0, Math.floor( t.bounds[ 1 ] * dpr ) - 2 );
    const x1 = Math.min( w, Math.ceil( ( t.bounds[ 0 ] + t.bounds[ 2 ] ) * dpr ) + 2 );
    const y1 = Math.min( h, Math.ceil( ( t.bounds[ 1 ] + t.bounds[ 3 ] ) * dpr ) + 2 );
    const hist = new Map();
    let n = 0;
    for ( let yy = y0; yy < y1; yy++ ) {
      for ( let xx = x0; xx < x1; xx++ ) {
        const i = ( yy * w + xx ) * 4;
        // pixels near the text color are the glyphs themselves (or their anti-aliasing)
        if ( Math.abs( d[ i ] - t.fill[ 0 ] ) + Math.abs( d[ i + 1 ] - t.fill[ 1 ] ) + Math.abs( d[ i + 2 ] - t.fill[ 2 ] ) < 96 ) { continue; }
        const k = ( d[ i ] << 16 ) | ( d[ i + 1 ] << 8 ) | d[ i + 2 ];
        hist.set( k, ( hist.get( k ) || 0 ) + 1 );
        n++;
      }
    }
    if ( n < 8 ) { backgrounds[ t.key ] = null; continue; }
    let best = null;
    for ( const [ k, v ] of hist ) { if ( !best || v > best[ 1 ] ) { best = [ k, v ]; } }
    backgrounds[ t.key ] = [ best[ 0 ] >> 16, ( best[ 0 ] >> 8 ) & 255, best[ 0 ] & 255 ];
  }
  return { total: w * h, colors, backgrounds };
}

/**
 * Visible navigation-bar buttons that open the dialogs V11 also covers.
 * @returns {{ dialog: 'keyboardHelp'|'preferences', bounds: number[] }[]}
 */
export function findDialogButtons() {
  // NAMES
  const sim = window.phet.joist.sim;
  const nav = sim.navigationBar;
  const out = [];
  if ( !nav ) { return out; }
  const stack = [ [ nav, true ] ];
  const seen = new Set();
  while ( stack.length ) {
    const [ n, vis ] = stack.pop();
    if ( !n || seen.has( n ) ) { continue; }
    seen.add( n );
    let visible = vis;
    try { if ( n.visible === false ) { visible = false; } } catch { /* ignore */ }
    if ( !visible ) { continue; }
    const nm = names.get( n.constructor ) || '';
    const dialog = /\.KeyboardHelpButton$/.test( nm ) ? 'keyboardHelp' : /\.NavigationBarPreferencesButton$/.test( nm ) ? 'preferences' : null;
    if ( dialog ) {
      const b = n.globalBounds;
      if ( b && b.width > 0 && b.height > 0 ) { out.push( { dialog, bounds: [ b.minX, b.minY, b.width, b.height ] } ); }
    }
    for ( const c of ( n._children || [] ) ) { stack.push( [ c, visible ] ); }
  }
  return out;
}

/**
 * Joist turns the display's input off while the sim is paused (display.interactive follows activeProperty).
 * The probes stop the clock for repeatability, so a dialog can only be opened after input is switched back on.
 * The model still does not step: activeProperty stays false.
 */
export function enableInput() {
  const sim = window.phet.joist.sim;
  ( sim.display || window.phet.joist.display ).interactive = true;
}

/**
 * Closes every open dialog through the popup stack (Escape needs keyboard focus inside the dialog and does
 * not close it from a script).
 * @returns {number} how many were closed
 */
export function closeModals() {
  const st = window.phet.joist.sim.modalNodeStack;
  let n = 0;
  for ( let i = 0; i < 8; i++ ) {
    const a = st.array || st._array || st;
    const top = a.length ? a[ a.length - 1 ] : ( st.get && st.length ? st.get( st.length - 1 ) : null );
    if ( !top || typeof top.hide !== 'function' ) { break; }
    top.hide();
    n++;
  }
  return n;
}

/**
 * A probe as an expression Playwright can evaluate: the function source with the namespace-name table spliced
 * in at its `// NAMES` marker, called with a JSON argument. Use as `page.evaluate( probe( sceneSnapshot, arg ) )`.
 * @param {Function} fn
 * @param {any} [arg]
 * @returns {string}
 */
export function probe( fn, arg ) {
  return `(${fn.toString().replace( '// NAMES', NAMES_SRC )})(${JSON.stringify( arg === undefined ? null : arg )})`;
}
