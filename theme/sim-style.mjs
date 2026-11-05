// Per-sim style files: theme/sim-styles/<id>.json.
//
//   { "colors":      [ { "repo", "file", "find", "occurrence", "to", "note"? } ],   // build: color literal -> token
//     "canvasNodes": [ "<constructor name>" ],                                      // V11: painted outside the scene graph
//     "exceptions":  [ { "kind", "reason", "approvedBy", "screen"?, "dialog"?, "node"?, "color"? } ] }   // V11
//
// `colors` drives the build (patches/sim-color.mjs) and is the only part of the file that enters a sim's
// build hash. `canvasNodes` and `exceptions` are read by tools/check-style.mjs only. No color value is
// written here: `find` is a regex source and `to` a token path, and an exception names a color as `r,g,b`.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { THEME_DIR, resolveColorToken } from './index.mjs';
import { MODEL_PATH_RE } from './patches/sim-color.mjs';

export const SIM_STYLES_DIR = path.join( THEME_DIR, 'sim-styles' );
/** What an exception may be about (V11 finding kinds). */
export const EXCEPTION_KINDS = Object.freeze( [ 'fill', 'stroke', 'gradient', 'image', 'pixels', 'contrast', 'canvas' ] );

/**
 * @param {string} simId
 * @param {string} [dir]
 * @returns {any|null} parsed style, or null when the sim has no style file
 */
export function loadSimStyle( simId, dir = SIM_STYLES_DIR ) {
  const file = path.join( dir, `${simId}.json` );
  if ( !existsSync( file ) ) { return null; }
  try { return JSON.parse( readFileSync( file, 'utf8' ) ); }
  catch ( e ) { throw new Error( `invalid ${file}: ${e.message}` ); }
}

/**
 * Structural problems of a style file (empty = fine). Approval of exceptions is judged by `exceptionProblems`.
 * @param {any} style
 * @param {any} tokens
 * @param {string} [simId]
 * @returns {string[]}
 */
export function validateSimStyle( style, tokens, simId = '' ) {
  const out = [];
  const at = s => `${simId ? `${simId}: ` : ''}${s}`;
  if ( !style || typeof style !== 'object' || Array.isArray( style ) ) { return [ at( 'style must be an object' ) ]; }
  for ( const k of Object.keys( style ) ) { if ( ![ 'colors', 'canvasNodes', 'exceptions', 'notes' ].includes( k ) ) { out.push( at( `unknown key ${k}` ) ); } }
  for ( const [ i, c ] of ( style.colors || [] ).entries() ) {
    const w = at( `colors[${i}]` );
    for ( const k of [ 'repo', 'file', 'find', 'to' ] ) { if ( typeof c[ k ] !== 'string' || !c[ k ] ) { out.push( `${w}.${k} must be a string` ); } }
    if ( !Number.isInteger( c.occurrence ) || c.occurrence < 1 ) { out.push( `${w}.occurrence must be a positive integer` ); }
    if ( typeof c.file === 'string' && MODEL_PATH_RE.test( c.file ) ) { out.push( `${w}: ${c.file} is a model path` ); }
    if ( typeof c.find === 'string' ) { try { new RegExp( c.find, 'dg' ); } catch ( e ) { out.push( `${w}.find is not a regex: ${e.message}` ); } }
    if ( typeof c.to === 'string' ) { try { resolveColorToken( tokens, c.to ); } catch ( e ) { out.push( `${w}.to: ${e.message}` ); } }
  }
  if ( style.canvasNodes !== undefined && !( Array.isArray( style.canvasNodes ) && style.canvasNodes.every( s => typeof s === 'string' && s ) ) ) {
    out.push( at( 'canvasNodes must be an array of constructor names' ) );
  }
  for ( const [ i, e ] of ( style.exceptions || [] ).entries() ) {
    const w = at( `exceptions[${i}]` );
    if ( !EXCEPTION_KINDS.includes( e.kind ) ) { out.push( `${w}.kind must be one of ${EXCEPTION_KINDS.join( ', ' )}` ); }
    if ( e.screen !== undefined && !Number.isInteger( e.screen ) ) { out.push( `${w}.screen must be an integer (-1 = home screen)` ); }
    if ( e.color !== undefined && !/^\d{1,3},\d{1,3},\d{1,3}$/.test( e.color ) ) { out.push( `${w}.color must look like 12,34,56` ); }
    if ( e.dialog !== undefined && ![ 'keyboardHelp', 'preferences' ].includes( e.dialog ) ) { out.push( `${w}.dialog must be keyboardHelp or preferences` ); }
  }
  return out;
}

/**
 * Exception rules of V11: every exception carries a reason and an approver, and a sim may keep at most
 * `max` of them (spec: 20). Returns the problems; any problem fails the sim.
 * @param {any} style
 * @param {number} max - tokens.sim.check.maxExceptions
 * @returns {string[]}
 */
export function exceptionProblems( style, max ) {
  const list = ( style && style.exceptions ) || [];
  const out = [];
  if ( list.length > max ) { out.push( `${list.length} exceptions, more than ${max} allowed` ); }
  list.forEach( ( e, i ) => {
    if ( typeof e.approvedBy !== 'string' || !e.approvedBy.trim() ) { out.push( `exceptions[${i}] (${e.kind}) has no approvedBy` ); }
    if ( typeof e.reason !== 'string' || !e.reason.trim() ) { out.push( `exceptions[${i}] (${e.kind}) has no reason` ); }
  } );
  return out;
}

/**
 * What of a style enters the build hash: the color edits with `to` resolved to the token's current value, so
 * changing a token re-builds exactly the sims that use it.
 * @param {any} style
 * @param {any} tokens
 * @returns {object[]|null}
 */
export function styleHashInput( style, tokens ) {
  if ( !style ) { return null; }
  return ( style.colors || [] ).map( c => ( { repo: c.repo, file: c.file, find: c.find, occurrence: c.occurrence, to: c.to, value: resolveColorToken( tokens, c.to ) } ) );
}

/**
 * True when a finding is covered by an exception: same kind and every field the exception names is equal.
 * `node` may be the full registered name (`faradaysLaw.MagnetNode`) or the class name alone (`MagnetNode`).
 * @param {{ kind: string, screen?: number, dialog?: string, node?: string, color?: string }} finding
 * @param {{ kind: string, screen?: number, dialog?: string, node?: string, color?: string }} exception
 * @returns {boolean}
 */
export function exceptionCovers( finding, exception ) {
  if ( finding.kind !== exception.kind ) { return false; }
  if ( exception.node !== undefined && finding.node !== exception.node && String( finding.node ).split( '.' ).pop() !== exception.node ) { return false; }
  return [ 'screen', 'dialog', 'color' ].every( k => exception[ k ] === undefined || exception[ k ] === finding[ k ] );
}
