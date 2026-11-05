#!/usr/bin/env node
// V12: did the restyle move or resize anything? (docs/verify.md, spec 5 V12)
//
// Usage: node tools/compare-bounds.mjs --freeze [--force] [--sims-dir build/bsshs-theme] [--baseline-dir <dir>]
//        node tools/compare-bounds.mjs <sim id> [--current <html>] [--baseline <html>] [--width 1280] [--settle 800]
//        node tools/compare-bounds.mjs --all [--jobs 4] [--sims-dir build/bsshs-theme] [--baseline-dir <dir>]
// --freeze copies the 68 school builds as they are NOW into the baseline folder ($BSSHS_CACHE/layout-baseline/)
// and refuses to overwrite an existing baseline without --force. The comparison opens the baseline and the
// current build with the same repeatable timeline (seeded random, virtual clock, sim clock stopped after a fixed
// number of frames: all before the first capture), visits every screen in both, and compares the global bounds of
// every node that has geometry of its own (stroke excluded, so a thinner outline cannot shift every ancestor).
// Positions and sizes must match within tokens sim.check.boundsTolerance (0.5 px).
// --nondeterministic skips the repeatable timeline (diagnosis only: shows how flaky animated sims are without it).
// Prints one Korean summary line, then one JSON object (last line). Exit 0 = identical, 1 = differences, 2 = error.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, copyFile, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { isMain } from './lib/cli.mjs';
import { loadTokens } from '../theme/index.mjs';
import { REPO_ROOT, buildDir, cacheDir } from './lib/paths.mjs';
import { listNewSimIds } from './lib/new-sims.mjs';
import { openSim, visitScreens } from './lib/page-control.mjs';
import { probe, collectBounds } from './lib/style-page.mjs';
import { diffBounds } from './lib/style-core.mjs';
import { pool } from './lib/verify-core.mjs';

export const SCHEMA_VERSION = 1;
const SHOWN = 20;

/** @returns {string} default baseline folder */
export const baselineDir = () => path.join( cacheDir(), 'layout-baseline' );

/** @param {string} dir @param {string} id */
export const baselineFile = ( dir, id ) => path.join( dir, id, `${id}_ko.html` );

/** The 68 ids (63 pinned + original sims). @returns {string[]} */
export function allSimIds() {
  return [ ...JSON.parse( readFileSync( path.join( REPO_ROOT, 'data', 'sims.json' ), 'utf8' ) ).map( s => s.id ), ...listNewSimIds() ];
}

/** @param {string[]} argv */
export function parseBoundsArgs( argv ) {
  const o = { id: null, freeze: false, force: false, all: false, jobs: 4, simsDir: path.join( buildDir(), 'bsshs-theme' ), baselineDir: baselineDir(),
              current: null, baseline: null, width: 1280, height: null, settle: 800, deterministic: true };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a === '--freeze' ) { o.freeze = true; }
    else if ( a === '--force' ) { o.force = true; }
    else if ( a === '--all' ) { o.all = true; }
    else if ( a.startsWith( '--jobs' ) ) { o.jobs = Number( val() ); }
    else if ( a.startsWith( '--sims-dir' ) ) { o.simsDir = path.resolve( val() ); }
    else if ( a.startsWith( '--baseline-dir' ) ) { o.baselineDir = path.resolve( val() ); }
    else if ( a.startsWith( '--current' ) ) { o.current = path.resolve( val() ); }
    else if ( a.startsWith( '--baseline' ) ) { o.baseline = path.resolve( val() ); }
    else if ( a.startsWith( '--width' ) ) { o.width = Number( val() ); }
    else if ( a.startsWith( '--height' ) ) { o.height = Number( val() ); }
    else if ( a.startsWith( '--settle' ) ) { o.settle = Number( val() ); }
    else if ( a === '--nondeterministic' ) { o.deterministic = false; }
    else if ( a.startsWith( '-' ) ) { throw new Error( `unknown option ${a}` ); }
    else if ( !o.id ) { o.id = a; }
    else { throw new Error( `unexpected argument ${a}` ); }
  }
  if ( !o.freeze && !o.all && !o.id ) { throw new Error( 'usage: compare-bounds.mjs --freeze | --all | <sim id> [--current f] [--baseline f]' ); }
  if ( !( Number.isInteger( o.jobs ) && o.jobs >= 1 ) ) { throw new Error( '--jobs expects a positive integer' ); }
  return o;
}

/** @param {string} file @returns {Promise<string>} sha256 */
const sha256File = async file => createHash( 'sha256' ).update( await readFile( file ) ).digest( 'hex' );

/** @param {string[]} args @returns {Promise<string>} */
const git = args => new Promise( resolve => execFile( 'git', [ '-C', REPO_ROOT, ...args ], ( err, out ) => resolve( err ? '' : out.trim() ) ) );

/**
 * Copies the current school builds into the baseline folder, once. Everything is copied into a temporary
 * folder first, so an interrupted freeze leaves no half baseline behind.
 * @param {{ simsDir: string, baselineDir: string, force: boolean, ids?: string[] }} o
 * @returns {Promise<{ dir: string, count: number, manifest: string }>}
 */
export async function freezeBaseline( o ) {
  const ids = o.ids || allSimIds();
  const manifest = path.join( o.baselineDir, 'baseline.json' );
  if ( existsSync( manifest ) && !o.force ) {
    throw new Error( `a baseline already exists at ${o.baselineDir} (frozen ${JSON.parse( readFileSync( manifest, 'utf8' ) ).frozenAt}); pass --force to replace it` );
  }
  const missing = ids.filter( id => !existsSync( baselineFile( o.simsDir, id ) ) );
  if ( missing.length ) { throw new Error( `cannot freeze: no build for ${missing.length} sim(s): ${missing.slice( 0, 5 ).join( ', ' )}${missing.length > 5 ? ' …' : ''}` ); }
  const tmp = `${o.baselineDir}.tmp-${process.pid}`;
  await rm( tmp, { recursive: true, force: true } );
  const files = {};
  for ( const id of ids ) {
    const src = baselineFile( o.simsDir, id );
    const dest = baselineFile( tmp, id );
    await mkdir( path.dirname( dest ), { recursive: true } );
    await copyFile( src, dest );
    files[ id ] = { bytes: ( await stat( dest ) ).size, sha256: await sha256File( dest ) };
  }
  await writeFile( path.join( tmp, 'baseline.json' ), JSON.stringify( {
    tool: 'compare-bounds', schemaVersion: SCHEMA_VERSION, frozenAt: new Date().toISOString(),
    sourceCommit: await git( [ 'rev-parse', 'HEAD' ] ), workingTreeClean: ( await git( [ 'status', '--porcelain' ] ) ) === '',
    count: ids.length, files
  }, null, 2 ) + '\n' );
  await rm( o.baselineDir, { recursive: true, force: true } );
  await rename( tmp, o.baselineDir );
  return { dir: o.baselineDir, count: ids.length, manifest };
}

/**
 * Bounds of every screen of one built sim.
 * @param {import('playwright').Browser} browser
 * @param {string} file
 * @param {{ width: number, height: number|null, settle: number }} o
 * @returns {Promise<{ screens: { index: number, name: string, nodes: object[], total: number }[], errors: string[], frozen: boolean|null }>}
 */
export async function collectScreens( browser, file, o ) {
  const { context, page, errors, frozen } = await openSim( browser, file, { width: o.width, height: o.height, settle: o.settle, deterministic: o.deterministic !== false } );
  try {
    const screens = [];
    await visitScreens( page, { settle: o.settle }, async t => {
      const b = await page.evaluate( probe( collectBounds ) );
      screens.push( { index: t.index, name: t.name === 'null' ? '' : t.name, nodes: b.nodes, total: b.total } );
    } );
    return { screens, errors, frozen };
  }
  finally { await context.close(); }
}

/**
 * Compares one sim's baseline with its current build.
 * @param {import('playwright').Browser} browser
 * @param {{ id: string, baseline: string, current: string, width: number, height: number|null, settle: number }} o
 * @returns {Promise<object>} report
 */
export async function compareSim( browser, o ) {
  for ( const f of [ o.baseline, o.current ] ) { if ( !existsSync( f ) ) { throw new Error( `no such file: ${f}` ); } }
  const tol = loadTokens().sim.check.boundsTolerance;
  const A = await collectScreens( browser, o.baseline, o );
  const B = await collectScreens( browser, o.current, o );
  const problems = [];
  if ( A.screens.length !== B.screens.length ) { problems.push( `screen count differs: baseline ${A.screens.length}, current ${B.screens.length}` ); }
  const screens = A.screens.slice( 0, B.screens.length ).map( ( a, i ) => {
    const b = B.screens[ i ];
    const d = diffBounds( a.nodes, b.nodes, tol );
    const diffs = d.changed.length + d.missing.length + d.added.length + d.visibility.length;
    return {
      index: a.index, name: a.name, nodesCompared: d.compared, nodesBaseline: a.nodes.length, nodesCurrent: b.nodes.length,
      differing: diffs, changedCount: d.changed.length, missingCount: d.missing.length, addedCount: d.added.length, visibilityCount: d.visibility.length,
      changed: d.changed.slice( 0, SHOWN ), missing: d.missing.slice( 0, SHOWN ), added: d.added.slice( 0, SHOWN ), visibility: d.visibility.slice( 0, SHOWN ),
      ok: diffs === 0 && a.name === b.name
    };
  } );
  for ( const e of [ ...A.errors.map( x => `baseline page error: ${x}` ), ...B.errors.map( x => `current page error: ${x}` ) ] ) { problems.push( e ); }
  const compared = screens.reduce( ( n, s ) => n + s.nodesCompared, 0 );
  if ( !screens.length || compared === 0 ) { problems.push( 'no node bounds were compared (nothing checked is not a pass)' ); }
  const differing = screens.reduce( ( n, s ) => n + s.differing, 0 );
  return {
    tool: 'compare-bounds', schemaVersion: SCHEMA_VERSION, id: o.id, baseline: o.baseline, current: o.current, width: o.width, tolerance: tol,
    deterministic: { baseline: A.frozen, current: B.frozen }, screens, nodesCompared: compared, differing, problems,
    ok: differing === 0 && problems.length === 0 && screens.every( s => s.ok )
  };
}

/** @param {any} r @returns {string} */
export function summaryLine( r ) {
  if ( r.fatal ) { return `오류  ${r.id || ''} ${r.fatal}`; }
  return `${r.ok ? '통과' : '실패'}  ${r.id}  화면 ${r.screens.length}개, 노드 ${r.nodesCompared}개 비교, 다른 노드 ${r.differing}개${r.problems.length ? `, 문제 ${r.problems.length}건` : ''}`;
}

/** @param {string[]} argv @returns {Promise<number>} */
export async function main( argv ) {
  let o;
  try { o = parseBoundsArgs( argv ); }
  catch ( e ) { console.error( e.message ); return 2; }
  try {
    if ( o.freeze ) {
      const r = await freezeBaseline( o );
      console.log( `고정 완료  ${r.count}개를 ${r.dir}에 복사했습니다 (${r.manifest})` );
      console.log( JSON.stringify( { tool: 'compare-bounds', schemaVersion: SCHEMA_VERSION, frozen: true, ...r } ) );
      return 0;
    }
    const { chromium } = await import( 'playwright' );
    const browser = await chromium.launch( { channel: 'chrome', headless: true } );
    try {
      if ( o.all ) {
        const t0 = Date.now();
        const ids = allSimIds();
        const reports = await pool( ids, o.jobs, async id => {
          try { return await compareSim( browser, { id, baseline: baselineFile( o.baselineDir, id ), current: baselineFile( o.simsDir, id ), width: o.width, height: o.height, settle: o.settle, deterministic: o.deterministic } ); }
          catch ( e ) { return { tool: 'compare-bounds', id, ok: false, fatal: String( e.message || e ), screens: [], differing: 0, nodesCompared: 0, problems: [] }; }
        } );
        for ( const r of reports ) { console.log( summaryLine( r ) ); }
        const passed = reports.filter( r => r.ok ).length;
        console.log( `V12 ${passed}/${reports.length} 통과 · ${Math.round( ( Date.now() - t0 ) / 1000 )}초` );
        console.log( JSON.stringify( { tool: 'compare-bounds', schemaVersion: SCHEMA_VERSION, passed, total: reports.length, failed: reports.filter( r => !r.ok ).map( r => r.id ) } ) );
        return passed === reports.length ? 0 : 1;
      }
      const r = await compareSim( browser, {
        id: o.id, baseline: o.baseline || baselineFile( o.baselineDir, o.id ), current: o.current || baselineFile( o.simsDir, o.id ),
        width: o.width, height: o.height, settle: o.settle
      } );
      console.log( summaryLine( r ) );
      console.log( JSON.stringify( r ) );
      return r.ok ? 0 : 1;
    }
    finally { await browser.close(); }
  }
  catch ( e ) {
    console.log( JSON.stringify( { tool: 'compare-bounds', schemaVersion: SCHEMA_VERSION, id: o.id, ok: false, fatal: String( e.message || e ) } ) );
    return 2;
  }
}

if ( isMain( import.meta.url ) ) { main( process.argv.slice( 2 ) ).then( c => { process.exitCode = c; } ); }
