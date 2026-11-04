#!/usr/bin/env node
// Post-build step: inline the class drawer into ONE built sim HTML (docs/drawer.md).
//
// Usage: node tools/inject-drawer.mjs <built.html> <sim id> [--out <file>] [--adapter-dir <dir>]
//                                     [--lessons <file>] [--status-file <file>]
// Default: rewrites <built.html> in place. The PhET sources are never touched. Re-running is safe
// (the previous drawer block is replaced). Exit 0 = written, 1 = invalid adapter files, 2 = usage.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isMain } from './lib/cli.mjs';
import { injectDrawer, extractDrawerData } from '../drawer/inject.mjs';

/**
 * @param {string[]} argv
 * @returns {{ html: string, id: string, out: string|null, adapterDir: string|null, lessonsFile: string|null, statusFile: string|null }}
 */
export function parseInjectArgs( argv ) {
  const o = { html: null, id: null, out: null, adapterDir: null, lessonsFile: null, statusFile: null };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--out' ) ) { o.out = val(); }
    else if ( a.startsWith( '--adapter-dir' ) ) { o.adapterDir = val(); }
    else if ( a.startsWith( '--lessons' ) ) { o.lessonsFile = val(); }
    else if ( a.startsWith( '--status-file' ) ) { o.statusFile = val(); }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else if ( !o.html ) { o.html = a; }
    else if ( !o.id ) { o.id = a; }
    else { throw new Error( `unexpected argument ${a}` ); }
  }
  if ( !o.html || !o.id ) { throw new Error( 'usage: inject-drawer.mjs <built.html> <sim id> [--out file] [--adapter-dir dir] [--lessons file] [--status-file file]' ); }
  return o;
}

/** @param {string[]} argv @returns {number} */
export function main( argv ) {
  let o;
  try { o = parseInjectArgs( argv ); }
  catch ( e ) { console.error( e.message ); return 2; }
  const abs = p => ( p ? path.resolve( p ) : undefined );
  let out;
  try {
    out = injectDrawer( readFileSync( o.html, 'utf8' ), {
      id: o.id, adapterDir: abs( o.adapterDir ), lessonsFile: abs( o.lessonsFile ), statusFile: abs( o.statusFile )
    } );
  }
  catch ( e ) { console.error( e.message ); return 1; }
  const target = o.out || o.html;
  writeFileSync( target, out );
  const d = extractDrawerData( out );
  console.log( JSON.stringify( { tool: 'inject-drawer', file: target, simId: d.simId, schemaVersion: d.drawer.schemaVersion, status: d.status.state, hash: d.hash } ) );
  return 0;
}

if ( isMain( import.meta.url ) ) { process.exitCode = main( process.argv.slice( 2 ) ); }
