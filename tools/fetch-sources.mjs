#!/usr/bin/env node
// Fetches the pinned PhET sources for the sims in data/sims.json into the shared cache.
//
// Usage: node tools/fetch-sources.mjs [--update] [--jobs N] [sim-id ...]
//   --update   re-fetch remotes even when the cache already has everything
//   --jobs N   parallel sims (default 8)
// Idempotent and resumable: mirrors and manifests already present are reused.
import { loadSims, selectSims } from './lib/sims.mjs';
import { resolveSim } from './lib/manifest.mjs';
import { runInSlots, parseSlotCount } from './lib/slots.mjs';
import { cacheDir } from './lib/paths.mjs';
import { isMain } from './lib/cli.mjs';

/**
 * @param {string[]} argv
 * @returns {{ update: boolean, jobs: number, ids: string[] }}
 */
export function parseArgs( argv ) {
  const out = { update: false, jobs: 8, ids: [] };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    if ( a === '--update' ) { out.update = true; }
    else if ( a === '--jobs' ) { out.jobs = parseSlotCount( argv[ ++i ], 8 ); }
    else if ( a.startsWith( '--jobs=' ) ) { out.jobs = parseSlotCount( a.slice( 7 ), 8 ); }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else { out.ids.push( a ); }
  }
  return out;
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function main( argv ) {
  const opts = parseArgs( argv );
  const sims = selectSims( await loadSims(), opts.ids );
  console.log( `cache: ${cacheDir()} — resolving ${sims.length} sims with ${opts.jobs} jobs` );
  const results = await runInSlots( sims, opts.jobs, sim => resolveSim( sim, { update: opts.update, log: s => console.log( s ) } ) );
  const failed = results.map( ( r, i ) => [ sims[ i ].id, r ] ).filter( ( [ , r ] ) => r instanceof Error );
  for ( const [ id, e ] of failed ) { console.error( `FAILED ${id}: ${e.message}` ); }
  console.log( `fetched ${sims.length - failed.length}/${sims.length}` );
  return failed.length ? 1 : 0;
}

if ( isMain( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).then( code => { process.exitCode = code; }, e => { console.error( e ); process.exitCode = 2; } );
}
