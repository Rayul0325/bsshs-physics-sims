// Design-token access for every consumer (PhET patches, HTML injection, site, drawer).
// theme/tokens.json is the ONLY file holding design values; this module only reads, validates and
// re-shapes them. Never put a color, font name, size, radius, spacing or shadow literal here.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const THEME_DIR = path.dirname( fileURLToPath( import.meta.url ) );
export const TOKENS_JSON = path.join( THEME_DIR, 'tokens.json' );

/** Groups every tokens.json must have, and the keys each must contain (more keys are allowed). */
export const REQUIRED_KEYS = {
  color: [ 'bg', 'surface', 'surfaceAlt', 'text', 'textMuted', 'border', 'accent', 'accentText', 'focus',
           'success', 'warning', 'danger' ],
  font: [ 'sans', 'serif', 'mono', 'koreanFallback', 'sizes' ],
  tracking: [],
  radius: [],
  space: [],
  shadow: [],
  sim: [ 'canvas', 'canvasDark', 'surface', 'line', 'control', 'controlActive', 'text', 'textOnDark', 'physics', 'check' ]
};

/** Keys of `sim.physics` (physical meaning of a color survives the restyle, only the value moves). */
export const SIM_PHYSICS_KEYS = [ 'positive', 'negative', 'electron', 'proton', 'neutron', 'magnetN', 'magnetS', 'copper',
                                  'conductor', 'insulator', 'forceA', 'forceB', 'energy', 'light', 'water', 'glass' ];

/** Keys of `sim.check`: numeric thresholds of tools/check-style.mjs (V11) and tools/compare-bounds.mjs (V12). */
export const SIM_CHECK_KEYS = [ 'paletteTolerance', 'outsideShareMax', 'minContrast', 'boundsTolerance', 'maxExceptions' ];

/** PhET role -> token group that the role's value (a token key) is looked up in. */
export const PHET_ROLE_GROUPS = {
  navigationBarText: 'color',
  homeScreenBackground: 'color',
  pushButtonBase: 'color',
  panelFill: 'color',
  panelStroke: 'sim',
  panelCornerRadius: 'radius',
  checkbox: 'color',
  sliderThumb: 'color',
  sliderThumbHighlight: 'color',
  wordmarkOnWhite: 'color',
  wordmarkOnBlack: 'color',
  splashText: 'color',
  // roles of the flat component defaults (theme/patches/theme.mjs); the `sim` group is read through them so a
  // global rule never names a sim token directly
  buttonStroke: 'sim',
  resetAllButton: 'sim',
  zoomButton: 'sim',
  componentFill: 'color',
  componentStroke: 'sim',
  componentHighlight: 'color',
  componentText: 'color',
  componentAccent: 'color',
  componentMuted: 'color',
  selectedStroke: 'color'
};

// Values PhET's scenery Color parser understands: #rgb, #rrggbb, rgb()/rgba(). (Not oklch.)
const PHET_COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\(\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const LENGTH_RE = /^-?\d+(\.\d+)?(px|em|rem)$/;

/** Parses a token color (#rgb, #rrggbb, rgb(), rgba()) to 0-255 channels and alpha 0-1; null when it is not one. */
export function parseTokenColor( value ) {
  if ( typeof value !== 'string' || !PHET_COLOR_RE.test( value ) ) { return null; }
  const v = value.trim();
  if ( v.startsWith( '#' ) ) {
    const h = v.length === 4 ? [ ...v.slice( 1 ) ].map( c => c + c ).join( '' ) : v.slice( 1 );
    return { r: parseInt( h.slice( 0, 2 ), 16 ), g: parseInt( h.slice( 2, 4 ), 16 ), b: parseInt( h.slice( 4, 6 ), 16 ), a: 1 };
  }
  const n = v.slice( v.indexOf( '(' ) + 1, -1 ).split( ',' ).map( x => Number( x.trim() ) );
  return { r: n[ 0 ], g: n[ 1 ], b: n[ 2 ], a: n.length > 3 ? n[ 3 ] : 1 };
}

/**
 * Problems in the `sim` group: colors must be PhET-readable, `physics` and `check` must hold exactly the
 * documented keys, and pure black must not be a token (spec 3.1: no black borders or black canvas).
 * @param {any} sim
 * @returns {string[]}
 */
export function validateSimTokens( sim ) {
  const errors = [];
  if ( !sim || typeof sim !== 'object' ) { return [ 'sim must be an object' ]; }
  const color = ( key, v ) => {
    const c = parseTokenColor( v );
    if ( !c ) { errors.push( `sim.${key} must be #hex or rgb()/rgba(), got ${JSON.stringify( v )}` ); }
    else if ( c.r === 0 && c.g === 0 && c.b === 0 && c.a === 1 ) { errors.push( `sim.${key} must not be pure black` ); }
  };
  for ( const k of [ 'canvas', 'canvasDark', 'surface', 'line', 'control', 'controlActive', 'text', 'textOnDark' ] ) { color( k, sim[ k ] ); }
  if ( !sim.physics || typeof sim.physics !== 'object' ) { errors.push( 'sim.physics must be an object' ); }
  else {
    for ( const k of SIM_PHYSICS_KEYS ) { if ( !( k in sim.physics ) ) { errors.push( `missing sim.physics.${k}` ); } }
    for ( const [ k, v ] of Object.entries( sim.physics ) ) { color( `physics.${k}`, v ); }
  }
  if ( !sim.check || typeof sim.check !== 'object' ) { errors.push( 'sim.check must be an object' ); }
  else {
    for ( const k of SIM_CHECK_KEYS ) {
      if ( typeof sim.check[ k ] !== 'number' || !Number.isFinite( sim.check[ k ] ) || sim.check[ k ] < 0 ) { errors.push( `sim.check.${k} must be a non-negative number` ); }
    }
  }
  return errors;
}

/**
 * Validates a tokens object. Returns human-readable problems (empty = valid).
 * @param {any} t
 * @returns {string[]}
 */
export function validateTokens( t ) {
  const errors = [];
  if ( !t || typeof t !== 'object' ) { return [ 'tokens must be an object' ]; }
  for ( const [ group, keys ] of Object.entries( REQUIRED_KEYS ) ) {
    if ( !t[ group ] || typeof t[ group ] !== 'object' ) { errors.push( `missing group ${group}` ); continue; }
    for ( const k of keys ) { if ( !( k in t[ group ] ) ) { errors.push( `missing ${group}.${k}` ); } }
  }
  if ( errors.length ) { return errors; }
  for ( const [ k, v ] of Object.entries( t.color ) ) {
    if ( typeof v !== 'string' || !PHET_COLOR_RE.test( v ) ) { errors.push( `color.${k} must be #hex or rgb()/rgba(), got ${JSON.stringify( v )}` ); }
  }
  for ( const k of [ 'sans', 'serif', 'mono' ] ) {
    if ( typeof t.font[ k ] !== 'string' || !t.font[ k ] || /[,"']/.test( t.font[ k ] ) ) { errors.push( `font.${k} must be one family name` ); }
  }
  if ( !Array.isArray( t.font.koreanFallback ) || !t.font.koreanFallback.every( f => typeof f === 'string' && f && !/[,"']/.test( f ) ) ) {
    errors.push( 'font.koreanFallback must be an array of family names' );
  }
  for ( const [ group, re ] of [ [ 'tracking', LENGTH_RE ], [ 'radius', LENGTH_RE ], [ 'space', LENGTH_RE ] ] ) {
    for ( const [ k, v ] of Object.entries( t[ group ] ) ) {
      if ( typeof v !== 'string' || !re.test( v ) ) { errors.push( `${group}.${k} must be a CSS length, got ${JSON.stringify( v )}` ); }
    }
  }
  for ( const [ k, v ] of Object.entries( t.font.sizes ) ) {
    if ( typeof v !== 'string' || !LENGTH_RE.test( v ) ) { errors.push( `font.sizes.${k} must be a CSS length` ); }
  }
  for ( const [ k, v ] of Object.entries( t.shadow ) ) {
    if ( typeof v !== 'string' || !v.trim() ) { errors.push( `shadow.${k} must be a non-empty string` ); }
  }
  for ( const face of t.font.faces || [] ) {
    if ( !face || typeof face.family !== 'string' || typeof face.file !== 'string' || typeof face.license !== 'string' ) {
      errors.push( `font.faces entries need family, file and license: ${JSON.stringify( face )}` );
    }
  }
  errors.push( ...validateSimTokens( t.sim ) );
  if ( t.phet ) {
    for ( const [ role, group ] of Object.entries( PHET_ROLE_GROUPS ) ) {
      const key = t.phet[ role ];
      if ( typeof key !== 'string' || !( key in ( t[ group ] || {} ) ) ) { errors.push( `phet.${role} must name a ${group} token, got ${JSON.stringify( key )}` ); }
    }
  }
  return errors;
}

/**
 * Reads and validates theme/tokens.json (throws when invalid).
 * @param {string} [file]
 * @returns {any} tokens
 */
export function loadTokens( file = TOKENS_JSON ) {
  const t = JSON.parse( readFileSync( file, 'utf8' ) );
  const errors = validateTokens( t );
  if ( errors.length ) { throw new Error( `invalid ${file}:\n  ${errors.join( '\n  ' )}` ); }
  return t;
}

/**
 * Every color token the restyled sims may paint with, as `{ path, value, rgba }` (path like `sim.physics.copper`
 * or `color.accent`). The palette of the V11 check: the `sim` group plus the shared `color` group.
 * @param {any} tokens
 * @returns {{ path: string, value: string, rgba: { r: number, g: number, b: number, a: number } }[]}
 */
export function simPalette( tokens ) {
  const out = [];
  const add = ( path, value ) => { const rgba = parseTokenColor( value ); if ( rgba ) { out.push( { path, value, rgba } ); } };
  for ( const [ k, v ] of Object.entries( tokens.color ) ) { add( `color.${k}`, v ); }
  for ( const k of [ 'canvas', 'canvasDark', 'surface', 'line', 'control', 'controlActive', 'text', 'textOnDark' ] ) { add( `sim.${k}`, tokens.sim[ k ] ); }
  for ( const [ k, v ] of Object.entries( tokens.sim.physics ) ) { add( `sim.physics.${k}`, v ); }
  return out;
}

/**
 * Looks a dotted token path up (`sim.physics.copper`). Throws on a path that is not a color token.
 * @param {any} tokens
 * @param {string} tokenPath
 * @returns {string} the color value
 */
export function resolveColorToken( tokens, tokenPath ) {
  const hit = simPalette( tokens ).find( p => p.path === tokenPath );
  if ( !hit ) { throw new Error( `unknown color token ${JSON.stringify( tokenPath )} (use color.* or sim.* paths)` ); }
  return hit.value;
}

/**
 * Replaces `{{sim.physics.copper}}`-style placeholders of an SVG text with token colors. An unknown
 * placeholder throws, so a typo can never reach a built image.
 * @param {string} svg
 * @param {any} tokens
 * @returns {string}
 */
export function resolveSvgPlaceholders( svg, tokens ) {
  return String( svg ).replace( /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, ( _, p ) => resolveColorToken( tokens, p ) );
}

/** Token paths named by `{{…}}` placeholders in an SVG text. @param {string} svg @returns {string[]} */
export function svgPlaceholders( svg ) {
  return [ ...new Set( [ ...String( svg ).matchAll( /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g ) ].map( m => m[ 1 ] ) ) ];
}

/**
 * Stable hash of the tokens (used to key generated artifacts such as the wordmark images).
 * @param {any} tokens
 * @returns {string}
 */
export const tokensHash = tokens => createHash( 'sha256' ).update( JSON.stringify( tokens ) ).digest( 'hex' );

/** @param {string} s */
const kebab = s => String( s ).replace( /([a-z0-9])([A-Z])/g, '$1-$2' ).toLowerCase();

/** @param {string} name */
const quoteFamily = name => ( /^[A-Za-z][\w-]*$/.test( name ) ? name : `"${name}"` );

/**
 * CSS font-family list for a token family plus the Korean fallback and the generic family.
 * @param {any} tokens
 * @param {'sans'|'serif'|'mono'} [kind]
 * @param {{ generic?: boolean }} [opts] - generic: append the generic family (default true)
 * @returns {string}
 */
export function fontStack( tokens, kind = 'sans', opts = {} ) {
  const generic = { sans: tokens.font.genericSans, serif: tokens.font.genericSerif, mono: tokens.font.genericMono }[ kind ];
  const list = [ tokens.font[ kind ], ...tokens.font.koreanFallback ].map( quoteFamily );
  if ( opts.generic !== false && generic ) { list.push( generic ); }
  return list.join( ', ' );
}

/**
 * Flattens tokens into [name, value] pairs, e.g. ['color-surface-alt', <value of color.surfaceAlt>].
 * @param {any} tokens
 * @returns {Array<[string, string]>}
 */
export function flattenTokens( tokens ) {
  const out = [];
  for ( const [ k, v ] of Object.entries( tokens.color ) ) { out.push( [ `color-${kebab( k )}`, v ] ); }
  for ( const kind of [ 'sans', 'serif', 'mono' ] ) { out.push( [ `font-${kind}`, fontStack( tokens, kind ) ] ); }
  out.push( [ 'font-korean-fallback', tokens.font.koreanFallback.map( quoteFamily ).join( ', ' ) ] );
  for ( const [ k, v ] of Object.entries( tokens.font.sizes ) ) { out.push( [ `font-size-${kebab( k )}`, v ] ); }
  if ( tokens.font.wordmarkWeight ) { out.push( [ 'font-wordmark-weight', String( tokens.font.wordmarkWeight ) ] ); }
  for ( const group of [ 'tracking', 'radius', 'space', 'shadow' ] ) {
    for ( const [ k, v ] of Object.entries( tokens[ group ] ) ) { out.push( [ `${group}-${kebab( k )}`, v ] ); }
  }
  return out;
}

/**
 * CSS text declaring every token as a `--bsshs-*` custom property (for the site and the drawer).
 * @param {any} tokens
 * @param {{ selector?: string }} [opts]
 * @returns {string}
 */
export function toCssVariables( tokens, opts = {} ) {
  const selector = opts.selector || ':root';
  const lines = flattenTokens( tokens ).map( ( [ k, v ] ) => `  --bsshs-${k}: ${v};` );
  return `${selector} {\n${lines.join( '\n' )}\n}\n`;
}

/**
 * Resolves the PhET role mapping (tokens.phet) into concrete values.
 * @param {any} tokens
 * @returns {Record<string, string>}
 */
export function toPhetColors( tokens ) {
  const out = {};
  for ( const [ role, group ] of Object.entries( PHET_ROLE_GROUPS ) ) {
    if ( group === 'color' || group === 'sim' ) { out[ role ] = tokens[ group ][ tokens.phet[ role ] ]; }
  }
  return out;
}

/**
 * Everything the PhET source patches need, derived from the tokens.
 * @param {any} tokens
 * @returns {{ colors: Record<string,string>, fontFamily: string, panelCornerRadius: number, wordmarkWeight: string }}
 */
export function toPhetTheme( tokens ) {
  return {
    colors: toPhetColors( tokens ),
    // PhetFont appends ', sans-serif' itself, so the generic family is left off here.
    fontFamily: fontStack( tokens, 'sans', { generic: false } ),
    panelCornerRadius: Number.parseFloat( tokens.radius[ tokens.phet.panelCornerRadius ] ),
    wordmarkWeight: String( tokens.font.wordmarkWeight || 'bold' )
  };
}

/**
 * Font faces to embed in rebuilt sims (absolute file paths).
 * @param {any} tokens
 * @param {{ simsOnly?: boolean }} [opts]
 * @returns {{ family: string, file: string, weight: string, style: string, license: string }[]}
 */
export function fontFaces( tokens, opts = {} ) {
  return ( tokens.font.faces || [] )
    .filter( f => !opts.simsOnly || f.embedInSims )
    .map( f => ( { ...f, file: path.join( THEME_DIR, f.file ), license: path.join( THEME_DIR, f.license ) } ) );
}
