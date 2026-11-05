#!/usr/bin/env node
// Dry run of every patch rule against the files of all pinned dependency sets, read straight from the
// cached git mirrors (no checkout, nothing written). Shows, per rule, how many sims it applies to and
// how many distinct file versions ("SHA families") it met; a required rule that would fail is an error.
//
// The per-sim rules (color literals from theme/sim-styles/<id>.json, pictures from theme/art/map.json) are
// dry-run the same way, each against the sim's own pinned files; a color edit that does not find its literal,
// a match that is not a color, a model path or a picture of another size shows up here as a FAILED row.
//
// Usage: node theme/patches/dry-run.mjs [--json out.json] [sim-id ...]
import { execFile } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadSims, selectSims } from '../../tools/lib/sims.mjs';
import { readManifest } from '../../tools/lib/manifest.mjs';
import { mirrorPath } from '../../tools/lib/paths.mjs';
import { isMain } from '../../tools/lib/cli.mjs';
import { loadTokens } from '../index.mjs';
import { ALL_RULES, patchContext, simRulesFor } from './index.mjs';
import { transformFile } from './engine.mjs';
import { splashSvg } from '../../brand/bsshs/wordmark.mjs';

/** @type {Map<string, Promise<Buffer|null>>} */
const blobCache = new Map();
/**
 * @param {string} repo
 * @param {string} sha
 * @param {string} file
 * @returns {Promise<Buffer|null>}
 */
function blob( repo, sha, file ) {
  const key = `${repo}@${sha}:${file}`;
  if ( !blobCache.has( key ) ) {
    blobCache.set( key, new Promise( resolve => {
      execFile( 'git', [ '-C', mirrorPath( repo ), 'show', `${sha}:${file}` ], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
        ( err, out ) => resolve( err ? null : out ) );
    } ) );
  }
  return blobCache.get( key );
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main( argv ) {
  let jsonOut = null;
  const ids = [];
  for ( let i = 0; i < argv.length; i++ ) {
    if ( argv[ i ] === '--json' ) { jsonOut = argv[ ++i ]; }
    else { ids.push( argv[ i ] ); }
  }
  const tokens = loadTokens();
  const dummyPng = Buffer.from( 'dry-run-png' );
  const ctx = patchContext( tokens, { brand: 'bsshs', theme: true }, { onWhite: dummyPng, onBlack: dummyPng, splashSvg: splashSvg( tokens ) } );
  const sims = selectSims( await loadSims(), ids );
  const report = Object.fromEntries( ALL_RULES.map( r => [ r.id, { kind: r.kind, required: r.required, applied: [], skipped: [], failed: [], families: new Set() } ] ) );
  /** Per-sim rules, aggregated by kind (their ids carry the sim id). */
  const perSim = {};

  await Promise.all( sims.map( async sim => {
    const m = await readManifest( sim.id );
    if ( !m ) { throw new Error( `no manifest for ${sim.id}; run npm run fetch-sources` ); }
    let simRules = [];
    try { simRules = ( await simRulesFor( sim.id, m.deps, tokens, { hashOnly: true } ) ).rules; }
    catch ( e ) {
      const row = perSim['sim style'] || ( perSim['sim style'] = { kind: 'sim-style', required: true, applied: [], skipped: [], failed: [], families: new Set() } );
      row.failed.push( `${sim.id} (${String( e.message ).split( '\n' ).slice( 0, 2 ).join( ' ' ).slice( 0, 200 )})` );
    }
    for ( const rule of [ ...ALL_RULES, ...simRules ] ) {
      const isSimRule = simRules.includes( rule );
      const row = isSimRule ? ( perSim[ rule.kind ] || ( perSim[ rule.kind ] = { kind: rule.kind, required: true, applied: [], skipped: [], failed: [], families: new Set() } ) ) : report[ rule.id ];
      const sha = rule.repo === 'babel' ? m.babelSha : m.deps[ rule.repo ];
      const contents = sha ? await Promise.all( rule.files.map( f => blob( rule.repo, sha, f ) ) ) : [];
      const existing = rule.files.map( ( f, i ) => [ f, contents[ i ] ] ).filter( ( [ , c ] ) => c );
      const targets = rule.match === 'all' ? existing : existing.slice( 0, 1 );
      if ( !targets.length ) { ( rule.required ? row.failed : row.skipped ).push( `${sim.id} (no file${isSimRule ? ` ${rule.repo}/${rule.files[ 0 ]}` : ''})` ); continue; }
      let changed = 0;
      const problems = [];
      for ( const [ f, c ] of targets ) {
        row.families.add( `${f}:${createHash( 'sha1' ).update( c ).digest( 'hex' ).slice( 0, 10 )}` );
        try {
          const r = transformFile( rule, c, ctx, f );
          if ( r.missing.length ) { problems.push( `${f} anchor #${r.missing.join( ',#' )}` ); }
          if ( r.changed ) { changed++; }
        }
        catch ( e ) { problems.push( `${f}: ${String( e.message ).slice( 0, 160 )}` ); }
      }
      if ( ( rule.required && problems.length ) || ( rule.required && !changed ) ) { row.failed.push( `${sim.id} (${problems.join( '; ' ) || 'no change'})` ); }
      else if ( changed ) { row.applied.push( sim.id ); }
      else { row.skipped.push( `${sim.id} (${problems.join( '; ' ) || 'no change'})` ); }
    }
  } ) );

  let bad = 0;
  console.log( `patch dry run over ${sims.length} pinned sims (files read from the git mirrors)\n` );
  for ( const [ id, row ] of Object.entries( report ) ) {
    bad += row.failed.length;
    console.log( `${row.failed.length ? 'FAIL' : 'ok  '} ${id.padEnd( 30 )} ${row.kind.padEnd( 9 )} ${row.required ? 'required' : 'optional'}  ` +
                 `applied ${String( row.applied.length ).padStart( 2 )}/${sims.length}  families ${row.families.size}` +
                 `${row.skipped.length ? `  skipped: ${row.skipped.join( ', ' )}` : ''}${row.failed.length ? `  FAILED: ${row.failed.join( ', ' )}` : ''}` );
  }
  for ( const [ name, row ] of Object.entries( perSim ) ) {
    bad += row.failed.length;
    console.log( `${row.failed.length ? 'FAIL' : 'ok  '} per-sim ${name.padEnd( 22 )} rules applied to ${row.applied.length} sims, ${row.skipped.length} skipped, ${row.failed.length} failed` +
                 `${row.failed.length ? `  FAILED: ${row.failed.join( ', ' )}` : ''}` );
  }
  if ( !Object.keys( perSim ).length ) { console.log( 'ok   per-sim rules: none (no theme/sim-styles files, no theme/art entries)' ); }
  if ( jsonOut ) {
    await mkdir( path.dirname( path.resolve( jsonOut ) ), { recursive: true } );
    await writeFile( jsonOut, JSON.stringify( Object.fromEntries( Object.entries( report ).map( ( [ k, v ] ) => [ k, { ...v, families: [ ...v.families ].sort() } ] ) ), null, 2 ) + '\n' );
  }
  return bad ? 1 : 0;
}

if ( isMain( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).then( code => { process.exitCode = code; }, e => { console.error( e.stack || e.message ); process.exitCode = 2; } );
}
