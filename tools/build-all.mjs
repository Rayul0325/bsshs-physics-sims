#!/usr/bin/env node
// Builds every sim in data/sims.json (adapted-from-phet, ko) with bounded parallelism.
// Each parallel job owns one sibling-checkout slot, because dependency SHAs differ per sim.
//
// Usage: node tools/build-all.mjs [--jobs N] [--node 24,20] [--no-brand-overlay]
//                                 [--no-type-check] [--force] [--brand bsshs] [--theme] [sim-id ...]
// --brand/--theme build a variant (see docs/theme.md) into its own output dir and matrix file.
// Resumable: a sim whose last record succeeded with the same dependency set and whose output
// file still exists is skipped (use --force to rebuild). Writes data/build-matrix.json.
//
// --include-new also builds every original sim in sims/<id> (never sims/_template) after the 63, as the
// bsshs-theme school edition, recorded in data/build-matrix.new-sims.json (docs/new-sims.md);
// --new-only builds just those. Without either flag the 63-sim path is exactly as before.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadSims, selectSims } from './lib/sims.mjs';
import { resolveSim } from './lib/manifest.mjs';
import { runInSlots, parseSlotCount } from './lib/slots.mjs';
import { readMatrix, writeMatrix, shouldSkip, chooseNewSimBase, validateMatrix } from './lib/matrix.mjs';
import { buildDir } from './lib/paths.mjs';
import { isMain } from './lib/cli.mjs';
import { buildSim, saveRecord, parseBuildArgs, outputRelPath, variantInputs, BRAND, LOCALE } from './build-sim.mjs';
import { buildVariant } from './lib/variant.mjs';
import { splitNewSimFlags, listNewSimIds } from './lib/new-sims.mjs';

const DEFAULT_JOBS = 10;

/**
 * Describes the dependency set chosen as the base for new original sims.
 * @param {import('./lib/manifest.mjs').SimManifest[]} manifests
 * @param {Map<string, any>} records
 * @returns {object|null}
 */
export function describeNewSimBase( manifests, records ) {
  const pick = chooseNewSimBase( manifests.map( m => ( {
    id: m.id,
    success: !!( records.get( m.id ) && records.get( m.id ).success ),
    libraryDate: m.libraryDate,
    releaseDate: m.releaseDate
  } ) ) );
  if ( !pick ) { return null; }
  const m = manifests.find( x => x.id === pick.id );
  const rec = records.get( m.id );
  return {
    id: m.id,
    branch: m.branch,
    version: m.version,
    simSha: m.simSha,
    chipperVersion: m.chipperVersion,
    nodeVersion: rec.nodeVersion,
    libraryDate: m.libraryDate,
    libraryDates: m.libraryDates,
    releaseDate: m.releaseDate,
    babelSha: m.babelSha,
    depsHash: m.depsHash,
    deps: m.deps,
    unavailable: m.unavailable,
    reason: 'Newest public common-library set among the successfully built pinned sims: for each sim, ' +
            'libraryDate = the OLDEST merge-base-with-main commit date across the core libraries ' +
            '(axon, dot, joist, kite, phet-core, scenery, scenery-phet, sun, tandem), so maintenance patches on ' +
            'side branches do not make an old set look new; the highest libraryDate wins, ties broken by the newer ' +
            'release date (dependencies.json timestamp), then by id. New original sims should check out exactly ' +
            'these SHAs (chipper/perennial-alias included) and build with the same Node major.'
  };
}

/**
 * Entry point: the 63 pinned sims, plus the original sims when --include-new / --new-only is given.
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main( argv ) {
  const { includeNew, newOnly, rest } = splitNewSimFlags( argv );
  if ( !includeNew ) { return buildPinnedSims( rest ); }
  const opts = parseBuildArgs( rest );
  const pinnedCode = newOnly ? 0 : await buildPinnedSims( rest );
  // The new-sim builder is loaded only on request; the default path never runs any of it.
  const { buildNewSims } = await import( './build-new-sim.mjs' );
  const ids = listNewSimIds();
  console.log( `\noriginal sims (sims/, _template excluded): ${ids.length ? ids.join( ', ' ) : 'none'}` );
  const { built, skipped, failed } = await buildNewSims( ids, { force: opts.force, jobs: parseSlotCount( opts.jobs ?? undefined, 2 ) } );
  console.log( `original sims: built ${built.filter( r => r.success ).length}, skipped ${skipped.length}, failed ${failed.length}${failed.length ? ` (${failed.join( ', ' )})` : ''}` );
  return pinnedCode || ( failed.length ? 1 : 0 );
}

/**
 * Builds the 63 pinned sims of data/sims.json (the original build-all behavior).
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function buildPinnedSims( argv ) {
  const opts = parseBuildArgs( argv );
  const jobs = parseSlotCount( opts.jobs ?? undefined, DEFAULT_JOBS );
  const all = await loadSims();
  const sims = selectSims( all, opts.ids );
  const t0 = Date.now();
  const variant = buildVariant( opts );
  const inputs = await variantInputs( opts ); // renders the wordmark once, before parallel builds

  console.log( `resolving ${sims.length} sims (fetching anything missing) …` );
  const resolved = await runInSlots( sims, 8, sim => resolveSim( sim ) );
  const fetchErrors = resolved.map( ( r, i ) => [ sims[ i ], r ] ).filter( ( [ , r ] ) => r instanceof Error );
  for ( const [ s, e ] of fetchErrors ) { console.error( `FETCH FAILED ${s.id}: ${e.message}` ); }

  const matrix = await readMatrix( variant.matrixFile );
  const prev = new Map( matrix.sims.map( r => [ r.id, r ] ) );
  const todo = [];
  let skipped = 0;
  sims.forEach( ( sim, i ) => {
    const m = resolved[ i ];
    const outputExists = existsSync( path.join( variant.outRoot, outputRelPath( sim.id ) ) );
    if ( !( m instanceof Error ) && shouldSkip( prev.get( sim.id ), { expectedDepsHash: m.depsHash, outputExists, force: opts.force,
                                                                    ...( inputs ? { expectedThemeHash: inputs.themeHash } : {} ) } ) ) {
      skipped++;
    }
    else { todo.push( sim ); }
  } );
  console.log( `building ${todo.length} sims in ${jobs} slots (${skipped} already built, skipped)${variant.name === 'baseline' ? '' : ` [variant ${variant.name} -> ${variant.outRoot}]`}` );

  await runInSlots( todo, jobs, async ( sim, slot ) => {
    const record = await buildSim( sim, { ...opts, slot } );
    await saveRecord( record, all, variant.matrixFile );
    return record;
  } );

  // Final matrix: rows for the whole table plus the newSimBase choice.
  const final = await readMatrix( variant.matrixFile );
  const records = new Map( final.sims.map( r => [ r.id, r ] ) );
  const manifests = resolved.filter( r => !( r instanceof Error ) );
  if ( sims.length === all.length ) {
    final.newSimBase = describeNewSimBase( manifests, records );
  }
  const rows = final.sims;
  final.brand = BRAND;
  final.locale = LOCALE;
  if ( variant.name !== 'baseline' ) {
    final.variant = variant.name;
    final.brandId = variant.brand;
    final.theme = variant.theme;
    final.outputRoot = path.relative( buildDir(), variant.outRoot );
  }
  final.generatedAt = new Date().toISOString();
  final.summary = {
    total: all.length,
    rows: rows.length,
    success: rows.filter( r => r.success ).length,
    successUnmodified: rows.filter( r => r.success && r.overlays.length === 0 ).length,
    successWithOverlay: rows.filter( r => r.success && r.overlays.length > 0 ).length,
    successWithBrandOverlay: rows.filter( r => r.success && r.overlays.some( o => o.startsWith( 'package.json' ) ) ).length,
    successWithChipperSkipTsc: rows.filter( r => r.success && r.overlays.some( o => o.startsWith( 'chipper-skip-tsc' ) ) ).length,
    failed: rows.filter( r => !r.success ).map( r => r.id ),
    // Wall time of the last run that actually built something (a no-op resume keeps the old value).
    lastBuildWallSeconds: todo.length ? Math.round( ( Date.now() - t0 ) / 1000 ) :
                          ( matrix.summary && ( matrix.summary.lastBuildWallSeconds ?? matrix.summary.lastRunWallSeconds ) ) ?? null,
    lastBuildSims: todo.length ? todo.length : ( matrix.summary && matrix.summary.lastBuildSims ) ?? null
  };
  // Key order: summary info first, rows last (easier to read).
  const { sims: finalRows, ...head } = final;
  await writeMatrix( { ...head, sims: finalRows }, variant.matrixFile );

  const problems = validateMatrix( { ...head, sims: finalRows }, all );
  console.log( `\nsuccess ${final.summary.success}/${all.length} ` +
               `(unmodified ${final.summary.successUnmodified}, with overlay ${final.summary.successWithOverlay}: ` +
               `brand ${final.summary.successWithBrandOverlay}, chipper-skip-tsc ${final.summary.successWithChipperSkipTsc}); ` +
               `wall ${Math.round( ( Date.now() - t0 ) / 1000 )}s (last full build ${final.summary.lastBuildWallSeconds}s for ${final.summary.lastBuildSims} sims)` );
  if ( final.summary.failed.length ) { console.log( `failed: ${final.summary.failed.join( ', ' )}` ); }
  if ( final.newSimBase ) { console.log( `newSimBase: ${final.newSimBase.id} ${final.newSimBase.version} (libraryDate ${final.newSimBase.libraryDate})` ); }
  if ( problems.length ) { console.log( `matrix validation problems:\n  ${problems.join( '\n  ' )}` ); }
  return problems.length || final.summary.failed.length || fetchErrors.length ? 1 : 0;
}

if ( isMain( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).then( code => { process.exitCode = code; }, e => { console.error( e.stack || e.message ); process.exitCode = 2; } );
}
