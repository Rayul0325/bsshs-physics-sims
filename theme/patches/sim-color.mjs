// Per-sim color rules: the pure engine behind theme/sim-styles/<id>.json.
//
// One entry says "in this file of this repo, the Nth match of this regex is a color literal; make it the
// token <path>". The regex is written as a SOURCE string so that no color value sits outside tokens.json.
// Guards, each pinned by a test (tests/theme/sim-color.test.mjs):
//   (a) model paths (`.../model/...`) are refused - physics code is never touched;
//   (b) the matched text must be a color literal by grammar, nothing else;
//   (c) the diff of an edit must change only that literal;
//   (d) `Color.X` becomes `new Color( ... )` so `.withAlpha( ... )` keeps working, and needs a value import of Color.
import { parseTokenColor, resolveColorToken } from '../index.mjs';

/** Paths where physics lives. The rule builder AND the V10b allow-list both refuse them. */
export const MODEL_PATH_RE = /(^|\/)model\//;

/** CSS named colors that count as color literals when written as a quoted string (transparent is refused below). */
const CSS_COLOR_NAMES = new Set( (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue ' +
  'chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey ' +
  'darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray ' +
  'darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen ' +
  'fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender ' +
  'lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey ' +
  'lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen ' +
  'linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
  'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange ' +
  'orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
  'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue ' +
  'slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
).split( ' ' ) );

const HEX = '#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})';
const FUNC = '(?:rgba?|hsla?)\\(\\s*[\\d.%\\s,/+-]+\\)';
const QUOTED_VALUE = new RegExp( `^(['"])(${HEX}|${FUNC})\\1$` );
const NEW_COLOR_NUMBERS = /^new Color\(\s*(\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?){2,3})\s*\)$/;
const NEW_COLOR_INT = /^new Color\(\s*0[xX][0-9a-fA-F]{6}\s*\)$/;
const NEW_COLOR_STRING = new RegExp( `^new Color\\(\\s*(['"])(${HEX}|${FUNC}|[a-z]+)\\1\\s*\\)$` );
const COLOR_CONSTANT = /^Color\.([A-Z][A-Z0-9_]*)$/;
const NAMED = /^(['"])([a-z]+)\1$/;

/**
 * A regex SOURCE matching any single color literal the grammar accepts (no capture groups). It is what the
 * color inventory counts occurrences with, and what a style entry can wrap in its own context, e.g.
 * `fill: (<this>)`, so that no color value has to be written in a style file.
 */
export const COLOR_SCAN_SOURCE = [
  '\\bColor\\.[A-Z][A-Z0-9_]*\\b',
  `'(?:${HEX}|${FUNC})'`,
  `"(?:${HEX}|${FUNC})"`,
  '\\bnew Color\\([^()]*\\)',
  `'(?:${[ ...CSS_COLOR_NAMES ].join( '|' )})'`,
  `"(?:${[ ...CSS_COLOR_NAMES ].join( '|' )})"`
].join( '|' );

/**
 * Classifies a text as a color literal by grammar. Anything dynamic (template strings, identifiers, calls)
 * is not a literal.
 * @param {string} text
 * @returns {null|{ kind: 'color-constant'|'quoted'|'new-color', quote: string|null, alpha: number, name: string|null }}
 */
export function classifyColorLiteral( text ) {
  let m = COLOR_CONSTANT.exec( text );
  if ( m ) { return m[ 1 ] === 'TRANSPARENT' ? null : { kind: 'color-constant', quote: null, alpha: 1, name: m[ 1 ] }; }
  m = QUOTED_VALUE.exec( text );
  if ( m ) { return { kind: 'quoted', quote: m[ 1 ], alpha: alphaOf( m[ 2 ] ), name: null }; }
  m = NAMED.exec( text );
  if ( m && CSS_COLOR_NAMES.has( m[ 2 ] ) ) { return { kind: 'quoted', quote: m[ 1 ], alpha: 1, name: m[ 2 ] }; }
  m = NEW_COLOR_NUMBERS.exec( text );
  if ( m ) { const n = m[ 1 ].split( ',' ).map( Number ); return { kind: 'new-color', quote: null, alpha: n.length > 3 ? n[ 3 ] : 1, name: null }; }
  if ( NEW_COLOR_INT.test( text ) ) { return { kind: 'new-color', quote: null, alpha: 1, name: null }; }
  m = NEW_COLOR_STRING.exec( text );
  if ( m && ( m[ 2 ].startsWith( '#' ) || /[(]/.test( m[ 2 ] ) || CSS_COLOR_NAMES.has( m[ 2 ] ) ) ) {
    return { kind: 'new-color', quote: null, alpha: alphaOf( m[ 2 ] ), name: null };
  }
  return null;
}

/** Alpha channel of a hex or rgba()/hsla() string (1 when it has none). @param {string} v */
function alphaOf( v ) {
  if ( v.startsWith( '#' ) ) {
    const h = v.slice( 1 );
    if ( h.length === 4 ) { return parseInt( h[ 3 ] + h[ 3 ], 16 ) / 255; }
    if ( h.length === 8 ) { return parseInt( h.slice( 6 ), 16 ) / 255; }
    return 1;
  }
  const args = v.slice( v.indexOf( '(' ) + 1, -1 ).split( /[,/]/ ).map( s => s.trim() );
  return args.length > 3 ? Number.parseFloat( args[ 3 ] ) / ( args[ 3 ].endsWith( '%' ) ? 100 : 1 ) : 1;
}

/**
 * True when the file has a VALUE binding named Color (ES import that is not type-only, or a RequireJS-style var).
 * A `new Color(...)` in a file without one would throw at runtime.
 * @param {string} text
 * @returns {boolean}
 */
export function hasColorValueImport( text ) {
  if ( /^\s*import\s+Color\s*(?:,|from)/m.test( text ) ) { return true; }
  for ( const m of text.matchAll( /^\s*import\s+(?!type\b)(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from/gm ) ) {
    if ( m[ 1 ].split( ',' ).some( s => s.trim() === 'Color' ) ) { return true; }
  }
  return /\bColor\s*=\s*require\s*\(/.test( text );
}

/**
 * The replacement text of one literal. Alpha is not color: a literal with alpha below 1 keeps it when the
 * token is opaque, so a translucent shade stays translucent.
 * @param {ReturnType<typeof classifyColorLiteral>} lit
 * @param {string} tokenValue
 * @returns {string}
 */
export function replacementFor( lit, tokenValue ) {
  let value = tokenValue;
  const c = parseTokenColor( tokenValue );
  if ( lit.alpha < 1 && c && c.a === 1 ) { value = `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round( lit.alpha * 1000 ) / 1000})`; }
  if ( lit.kind === 'quoted' ) { return `${lit.quote}${value}${lit.quote}`; }
  return `new Color( ${JSON.stringify( value )} )`;
}

/**
 * @typedef {object} ColorEdit
 * @property {string} find - regex SOURCE; group 1 (when present) is the literal, else the whole match
 * @property {number} occurrence - 1-based index among the matches of `find` in the pristine file
 * @property {string} to - token path (`sim.physics.copper`, `color.accent`)
 */

/**
 * Guard (c): `after` differs from `before` only inside [start, end).
 * @param {string} before
 * @param {string} after
 * @param {{ start: number, end: number, replacement: string }} edit
 */
export function assertOnlyLiteralChanged( before, after, { start, end, replacement } ) {
  if ( after.length - before.length !== replacement.length - ( end - start ) ) {
    throw new Error( `color edit changed the text length by ${after.length - before.length}, expected ${replacement.length - ( end - start )}` );
  }
  let p = 0;
  while ( p < before.length && p < after.length && before[ p ] === after[ p ] ) { p++; }
  let q = 0;
  while ( q < before.length - p && q < after.length - p && before[ before.length - 1 - q ] === after[ after.length - 1 - q ] ) { q++; }
  if ( p < start || before.length - q > end ) {
    throw new Error( `color edit touched text outside the literal (differs at ${p}..${before.length - q}, literal is ${start}..${end})` );
  }
  if ( !after.includes( replacement ) ) { throw new Error( 'color edit did not emit the replacement' ); }
}

/**
 * Applies every edit of one file to its pristine text.
 * @param {string} text
 * @param {ColorEdit[]} edits
 * @param {{ file: string, tokens: any }} ctx
 * @returns {string}
 */
export function applyColorEdits( text, edits, { file, tokens } ) {
  if ( MODEL_PATH_RE.test( file ) ) { throw new Error( `sim color edit refused: ${file} is a model path` ); }
  const spans = [];
  for ( const [ i, e ] of edits.entries() ) {
    const where = `${file} edit #${i + 1} (${e.to})`;
    let re;
    try { re = new RegExp( e.find, 'dg' ); } catch ( err ) { throw new Error( `${where}: bad regex: ${err.message}` ); }
    const matches = [ ...text.matchAll( re ) ];
    const m = matches[ e.occurrence - 1 ];
    if ( !m ) { throw new Error( `${where}: occurrence ${e.occurrence} not found (${matches.length} match${matches.length === 1 ? '' : 'es'})` ); }
    const [ start, end ] = m.indices[ 1 ] || m.indices[ 0 ];
    const literal = text.slice( start, end );
    const lit = classifyColorLiteral( literal );
    if ( !lit ) { throw new Error( `${where}: matched text ${JSON.stringify( literal.slice( 0, 60 ) )} is not a color literal` ); }
    if ( lit.kind === 'color-constant' && !hasColorValueImport( text ) ) {
      throw new Error( `${where}: ${literal} needs new Color(...) but the file has no value import of Color` );
    }
    spans.push( { start, end, replacement: replacementFor( lit, resolveColorToken( tokens, e.to ) ), where } );
  }
  spans.sort( ( a, b ) => a.start - b.start );
  for ( let i = 1; i < spans.length; i++ ) {
    if ( spans[ i ].start < spans[ i - 1 ].end ) { throw new Error( `${spans[ i ].where}: overlaps another edit` ); }
  }
  // Every edit is also applied alone and diffed, so a splice bug can never rewrite text around a literal.
  for ( const s of spans ) { assertOnlyLiteralChanged( text, text.slice( 0, s.start ) + s.replacement + text.slice( s.end ), s ); }
  let out = '';
  let at = 0;
  for ( const s of spans ) { out += text.slice( at, s.start ) + s.replacement; at = s.end; }
  return out + text.slice( at );
}

/**
 * Patch rules of one sim style: one rule per (repo, file), edits composed on the pristine file.
 * @param {string} simId
 * @param {{ colors?: ({ repo: string, file: string } & ColorEdit)[] }} style
 * @param {any} tokens
 * @returns {import('./engine.mjs').PatchRule[]}
 */
export function colorRulesFor( simId, style, tokens ) {
  const groups = new Map();
  for ( const c of style.colors || [] ) {
    if ( typeof c.repo !== 'string' || typeof c.file !== 'string' ) { throw new Error( `${simId}: every color entry needs repo and file` ); }
    if ( c.file.startsWith( '/' ) || c.file.split( '/' ).includes( '..' ) ) { throw new Error( `${simId}: ${c.file} is not a repo-relative path` ); }
    if ( MODEL_PATH_RE.test( c.file ) ) { throw new Error( `${simId}: ${c.repo}/${c.file} is a model path; physics files are never restyled (list the color as an exception instead)` ); }
    resolveColorToken( tokens, c.to );
    const key = `${c.repo}\0${c.file}`;
    if ( !groups.has( key ) ) { groups.set( key, { repo: c.repo, file: c.file, edits: [] } ); }
    groups.get( key ).edits.push( { find: c.find, occurrence: c.occurrence, to: c.to } );
  }
  return [ ...groups.values() ].map( ( g, i ) => ( {
    id: `simcolor-${simId}-${i + 1}`,
    kind: 'sim-color',
    repo: g.repo,
    files: [ g.file ],
    required: true,
    why: `${simId}: ${g.edits.length} color literal(s) of ${g.file} -> tokens`,
    content: ( env, old ) => applyColorEdits( old.toString( 'utf8' ), g.edits, { file: g.file, tokens } )
  } ) );
}
