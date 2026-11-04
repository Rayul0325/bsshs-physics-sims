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
  shadow: []
};

/** PhET role -> token group that the role's value (a token key) is looked up in. */
export const PHET_ROLE_GROUPS = {
  navigationBarText: 'color',
  homeScreenBackground: 'color',
  pushButtonBase: 'color',
  panelFill: 'color',
  panelStroke: 'color',
  panelCornerRadius: 'radius',
  checkbox: 'color',
  sliderThumb: 'color',
  sliderThumbHighlight: 'color',
  wordmarkOnWhite: 'color',
  wordmarkOnBlack: 'color',
  splashText: 'color'
};

// Values PhET's scenery Color parser understands: #rgb, #rrggbb, rgb()/rgba(). (Not oklch.)
const PHET_COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\(\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const LENGTH_RE = /^-?\d+(\.\d+)?(px|em|rem)$/;

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
    if ( group === 'color' ) { out[ role ] = tokens.color[ tokens.phet[ role ] ]; }
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
