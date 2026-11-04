#!/usr/bin/env node
// Spec 5 verification in one command (docs/verify.md). Runs V1–V10 against the current builds and the
// built site, writes build/verify/report.json and prints one Korean line per check. Exit 0 only when every
// selected check passes.
//
// Usage: node tools/verify.mjs [--only V2,V9] [--jobs 12] [--sims-dir build/bsshs-theme] [--site-dir dist]
//          [--report build/verify/report.json] [--names-file <file>] [--cases <id>=<cases.json>]
//
// Inputs: build/bsshs-theme/<id>/<id>_ko.html (68 school builds, no drawer), data/build-matrix.bsshs-theme.json
// and data/build-matrix.new-sims.json, and the site in dist/ (npm run build-everything makes all of them).
// Order: V10b and V3/V9 first (V3 decides exclusions, spec 3.6) → exclusion applied to the site → V1, V10c,
// V2 → the npm test run (V4, V5, V6, V10a). Browser jobs share one pool of --jobs processes.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './lib/paths.mjs';
import { isMain } from './lib/cli.mjs';
import { listNewSimIds } from './lib/new-sims.mjs';
import { readManifest } from './lib/manifest.mjs';
import {
  parseOnly, makeResult, aggregate, summaryLine, exclusionsFromV3, buildCount, checkPatchAllowlist,
  parseNames, scanForNames, groupTestEvents, pool
} from './lib/verify-core.mjs';

const NODE = process.execPath;
const TOOLS = path.join( REPO_ROOT, 'tools' );
const readJson = file => JSON.parse( readFileSync( file, 'utf8' ) );

/** @param {string[]} argv */
export function parseVerifyArgs( argv ) {
  const o = {
    only: null, jobs: Math.max( 2, Math.min( 12, os.availableParallelism() - 4 ) ),
    simsDir: path.join( REPO_ROOT, 'build', 'bsshs-theme' ), siteDir: path.join( REPO_ROOT, 'dist' ),
    report: path.join( REPO_ROOT, 'build', 'verify', 'report.json' ),
    namesFile: process.env.BSSHS_PRIVATE_NAMES || path.join( os.homedir(), '.config', 'bsshs-physics-sims', 'private-names.txt' ),
    cases: {}
  };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--only' ) ) { o.only = val(); }
    else if ( a.startsWith( '--jobs' ) ) { o.jobs = Number( val() ); }
    else if ( a.startsWith( '--sims-dir' ) ) { o.simsDir = path.resolve( val() ); }
    else if ( a.startsWith( '--site-dir' ) ) { o.siteDir = path.resolve( val() ); }
    else if ( a.startsWith( '--report' ) ) { o.report = path.resolve( val() ); }
    else if ( a.startsWith( '--names-file' ) ) { o.namesFile = path.resolve( val() ); }
    else if ( a.startsWith( '--cases' ) ) {
      const [ id, file ] = val().split( /=(.*)/s );
      if ( !id || !file ) { throw new Error( '--cases expects <id>=<cases.json>' ); }
      o.cases[ id ] = path.resolve( file );
    }
    else { throw new Error( `unknown argument ${a}` ); }
  }
  if ( !( Number.isInteger( o.jobs ) && o.jobs >= 1 ) ) { throw new Error( '--jobs expects a positive integer' ); }
  o.selected = parseOnly( o.only );
  return o;
}

/**
 * Runs one child process; never throws. Output is kept in memory (each tool prints one JSON report).
 * @param {string[]} args - arguments to node
 * @param {{ env?: object, timeoutMs?: number }} [opts]
 * @returns {Promise<{ code: number, stdout: string, stderr: string, ms: number }>}
 */
function runNode( args, opts = {} ) {
  return new Promise( resolve => {
    const t0 = Date.now();
    const child = spawn( NODE, args, { cwd: REPO_ROOT, env: { ...process.env, ...( opts.env || {} ) } } );
    let stdout = '';
    let stderr = '';
    child.stdout.on( 'data', d => { stdout += d; } );
    child.stderr.on( 'data', d => { stderr += d; } );
    const timer = setTimeout( () => { stderr += `\n[verify] timeout after ${opts.timeoutMs} ms`; child.kill( 'SIGKILL' ); }, opts.timeoutMs || 10 * 60 * 1000 );
    child.on( 'close', code => { clearTimeout( timer ); resolve( { code: code ?? 2, stdout, stderr, ms: Date.now() - t0 } ); } );
    child.on( 'error', e => { clearTimeout( timer ); resolve( { code: 2, stdout, stderr: String( e ), ms: Date.now() - t0 } ); } );
  } );
}

/** Last JSON object printed by a tool (check-sim pretty-prints when not --quiet; we pass --quiet). */
function lastJson( stdout ) {
  const lines = stdout.trim().split( '\n' ).filter( Boolean );
  for ( let i = lines.length - 1; i >= 0; i-- ) {
    try { return JSON.parse( lines[ i ] ); } catch { /* keep looking */ }
  }
  try { return JSON.parse( stdout ); } catch { return null; }
}

const firstLine = s => String( s || '' ).trim().split( '\n' ).filter( Boolean ).slice( -1 )[ 0 ]?.slice( 0, 240 ) || '';

/** @param {string} dir @returns {string[]} files under dir, recursive */
function walk( dir ) {
  if ( !existsSync( dir ) ) { return []; }
  const out = [];
  for ( const e of readdirSync( dir, { withFileTypes: true } ) ) {
    const p = path.join( dir, e.name );
    if ( e.isDirectory() ) { out.push( ...walk( p ) ); }
    else if ( e.isFile() ) { out.push( p ); }
  }
  return out;
}

/** Everything the checks share: ids, paths and the per-sim build records. */
function context( o ) {
  const phetIds = readJson( path.join( REPO_ROOT, 'data', 'sims.json' ) ).map( s => s.id );
  const newIds = listNewSimIds();
  const examIds = readJson( path.join( REPO_ROOT, 'data', 'exam-scope.json' ) ).ids;
  const themeMatrix = readJson( path.join( REPO_ROOT, 'data', 'build-matrix.bsshs-theme.json' ) );
  const newMatrix = existsSync( path.join( REPO_ROOT, 'data', 'build-matrix.new-sims.json' ) ) ?
                    readJson( path.join( REPO_ROOT, 'data', 'build-matrix.new-sims.json' ) ) : { sims: [] };
  const records = new Map( [ ...themeMatrix.sims, ...newMatrix.sims ].filter( r => phetIds.includes( r.id ) || newIds.includes( r.id ) ).map( r => [ r.id, r ] ) );
  const work = path.join( path.dirname( o.report ) );
  return {
    phetIds, newIds, examIds, allIds: [ ...phetIds, ...newIds ], records,
    built: id => path.join( o.simsDir, id, `${id}_ko.html` ),
    injected: id => path.join( work, 'injected', `${id}.html` ),
    published: id => path.join( o.siteDir, 'sims', `${id}.html` ),
    work
  };
}

// ---------------------------------------------------------------------------------------------------- V1

/** Expected theme hash of a bsshs-theme build made now (tokens + rules + term fixes), without rendering. */
async function expectedThemeHash() {
  const { loadTokens } = await import( '../theme/index.mjs' );
  const { variantHash } = await import( '../theme/patches/index.mjs' );
  const { loadTermFixes, termFixesHash } = await import( '../theme/patches/terms.mjs' );
  return `${variantHash( loadTokens(), { brand: 'bsshs', theme: true } )}+${termFixesHash( await loadTermFixes() ).slice( 0, 16 )}`;
}

/**
 * V1: per sim — a successful record, built with today's tokens/rules (and, for new sims, today's source),
 * the file the record describes (same size, single file, Korean, no drawer), and published on the site.
 */
async function checkV1( o, ctx, exclusions ) {
  const t0 = Date.now();
  const themeHash = await expectedThemeHash();
  const { sourceHash } = await import( './lib/new-sims.mjs' );
  const good = [];
  const failures = [];
  for ( const id of ctx.allIds ) {
    const r = ctx.records.get( id );
    const file = ctx.built( id );
    const why = [];
    if ( !r ) { why.push( '빌드 기록 없음' ); }
    else {
      if ( !r.success ) { why.push( `빌드 실패: ${String( r.error ).slice( 0, 120 )}` ); }
      if ( r.themeHash !== themeHash ) { why.push( '디자인 토큰·패치 규칙이 바뀐 뒤 다시 빌드하지 않음 (themeHash 다름)' ); }
      if ( ctx.newIds.includes( id ) && r.sourceHash !== sourceHash( path.join( REPO_ROOT, 'sims', id ) ) ) { why.push( 'sims/ 소스가 바뀐 뒤 다시 빌드하지 않음' ); }
    }
    if ( !existsSync( file ) ) { why.push( `결과 파일 없음 ${path.relative( REPO_ROOT, file )}` ); }
    else {
      const size = statSync( file ).size;
      if ( r && r.outputBytes !== size ) { why.push( `파일 크기 ${size} ≠ 기록 ${r.outputBytes} (빌드 뒤 바뀜)` ); }
      const html = readFileSync( file, 'utf8' );
      if ( !/^[^]{0,4096}?<html\b[^>]*\blang="ko"/.test( html ) ) { why.push( '첫 <html>이 lang="ko"가 아님' ); }
      if ( /<script\b[^>]*\bsrc\s*=\s*["'](?!data:)/i.test( html ) || /<link\b[^>]*\bhref\s*=\s*["'](?!data:|#)/i.test( html ) ) { why.push( '다른 파일을 불러오는 <script src>/<link href>가 있음 (단일 파일 아님)' ); }
      if ( html.includes( '<!-- bsshs-drawer:begin' ) ) { why.push( '서랍이 들어간 파일 (서랍 없는 빌드여야 함)' ); }
    }
    if ( why.length ) { failures.push( { id, reason: why.join( '; ' ) } ); }
    else { good.push( id ); }
  }
  const publishedIds = existsSync( path.join( o.siteDir, 'sims' ) ) ?
    readdirSync( path.join( o.siteDir, 'sims' ) ).filter( f => f.endsWith( '.html' ) ).map( f => f.slice( 0, -5 ) ) : [];
  const counted = buildCount( { expected: ctx.allIds, built: good, published: publishedIds, excluded: exclusions } );
  const seen = new Set( counted.failures.map( f => f.id ) );
  for ( const f of failures ) { if ( !seen.has( f.id ) ) { counted.failures.push( f ); } }
  return makeResult( 'V1', { ...counted, ms: Date.now() - t0,
    notes: [ `PhET ${ctx.phetIds.length} + 새 시뮬레이션 ${ctx.newIds.length} = ${ctx.allIds.length}개 기대, 사이트에 ${publishedIds.length}개`, `themeHash ${themeHash.slice( 0, 12 )}…` ] } );
}

// ---------------------------------------------------------------------------------------------------- V2

function v2Jobs( o, ctx ) {
  return ctx.allIds.flatMap( id => [ null, 390 ].map( width => ( { id, width } ) ) );
}

async function runV2Job( o, ctx, job ) {
  const file = ctx.published( job.id );
  if ( !existsSync( file ) ) { return { ...job, ok: false, error: '사이트에 파일 없음' }; }
  const args = [ path.join( TOOLS, 'check-sim.mjs' ), file, '--quiet', ...( job.width ? [ '--width', String( job.width ) ] : [] ) ];
  const r = await runNode( args, { timeoutMs: 3 * 60 * 1000 } );
  const rep = lastJson( r.stdout );
  const failed = rep && rep.checks ? Object.entries( rep.checks ).filter( ( [ , c ] ) => c && c.ok === false ).map( ( [ k ] ) => k ) : [];
  const ok = r.code === 0 && !!rep && rep.ok === true;
  return { ...job, ok, exitCode: r.code, ms: r.ms,
           error: ok ? null : ( rep && rep.fatal ) || ( failed.length ? `실패 항목: ${failed.join( ', ' )}${detailOf( rep, failed )}` : firstLine( r.stderr ) || `exit ${r.code}` ) };
}

function detailOf( rep, failed ) {
  const c = rep.checks;
  const bits = [];
  if ( failed.includes( 'errors' ) ) { bits.push( `오류 ${JSON.stringify( c.errors.uncaught ).slice( 0, 120 )}` ); }
  if ( failed.includes( 'network' ) ) { bits.push( `외부 요청 ${JSON.stringify( c.network.external ).slice( 0, 120 )}` ); }
  if ( failed.includes( 'phetName' ) ) { bits.push( `PhET 표기 ${JSON.stringify( c.phetName.hits ).slice( 0, 160 )}` ); }
  if ( failed.includes( 'about' ) ) { bits.push( `About 누락 ${JSON.stringify( c.about.missing ).slice( 0, 120 )} ${c.about.detail || ''}` ); }
  if ( failed.includes( 'ready' ) ) { bits.push( `준비 ${c.ready.detail || ''}` ); }
  return bits.length ? ` (${bits.join( '; ' )})` : '';
}

// ---------------------------------------------------------------------------------------------------- V3 / V9

/** Injects the drawer into a fresh copy of each exam build (same tool and data as the site). */
async function prepareInjected( ctx ) {
  mkdirSync( path.join( ctx.work, 'injected' ), { recursive: true } );
  const res = await pool( ctx.examIds, 8, async id => {
    if ( !existsSync( ctx.built( id ) ) ) { return { id, ok: false, error: '빌드 결과 없음' }; }
    const r = await runNode( [ path.join( TOOLS, 'inject-drawer.mjs' ), ctx.built( id ), id, '--out', ctx.injected( id ) ] );
    return { id, ok: r.code === 0, error: r.code === 0 ? null : `inject-drawer exit ${r.code}: ${firstLine( r.stderr )}` };
  } );
  return new Map( res.map( r => [ r.id, r ] ) );
}

async function runV3Job( o, ctx, prep, id ) {
  if ( !prep.get( id ).ok ) { return { id, ok: false, error: prep.get( id ).error }; }
  const args = [ path.join( TOOLS, 'run-cases.mjs' ), ctx.injected( id ), id, ...( o.cases[ id ] ? [ '--cases', o.cases[ id ] ] : [] ) ];
  const r = await runNode( args, { timeoutMs: 5 * 60 * 1000 } );
  const lines = r.stdout.trim().split( '\n' ).map( l => { try { return JSON.parse( l ); } catch { return null; } } ).filter( Boolean );
  const summary = lines.find( l => l.type === 'summary' );
  const bad = lines.filter( l => l.type === 'case' && !l.ok );
  const ok = r.code === 0 && !!summary && summary.ok === true;
  const describe = c => `${c.name}: ${c.error || ( c.results || [] ).filter( x => !x.ok ).map( x => `${x.key} 기대 ${x.expected} 실제 ${x.actual}` ).join( ', ' )}${c.pageErrors ? ` 페이지 오류 ${c.pageErrors[ 0 ]}` : ''}`;
  return { id, ok, exitCode: r.code, ms: r.ms, cases: summary ? `${summary.passed}/${( summary.passed || 0 ) + ( summary.failed || 0 )}` : null,
           casesPassed: summary ? summary.passed || 0 : 0, casesTotal: summary ? ( summary.passed || 0 ) + ( summary.failed || 0 ) : 0,
           tolerance: summary && summary.tolerance, caseFile: o.cases[ id ] || null,
           error: ok ? null : ( summary && summary.fatal ) || bad.map( describe ).join( ' | ' ).slice( 0, 400 ) || firstLine( r.stderr ) || `exit ${r.code}` };
}

async function runV9Job( o, ctx, prep, job ) {
  if ( !prep.get( job.id ).ok ) { return { ...job, ok: false, error: prep.get( job.id ).error }; }
  const args = [ path.join( TOOLS, 'compare-layout.mjs' ), ctx.injected( job.id ), ctx.built( job.id ), '--width', String( job.width ),
                 '--all-screens', '--pause-clock', '--seed-random', '--exclude-button' ];
  const r = await runNode( args, { timeoutMs: 6 * 60 * 1000 } );
  const rep = lastJson( r.stdout );
  const ok = r.code === 0 && !!rep && rep.ok !== false;
  const screens = rep && rep.screens ? rep.screens : [];
  return { ...job, ok, exitCode: r.code, ms: r.ms, screens: screens.length,
           distinctShots: new Set( screens.map( s => s.shotSha1 ) ).size,
           error: ok ? null : ( rep && ( rep.error || rep.fatal ) ) ||
             ( screens.filter( s => !s.ok ).map( s => `${s.name || s.index}: ${s.diffPixels}px` ).join( ', ' ) || firstLine( r.stderr ) || `exit ${r.code}` ) };
}

// ---------------------------------------------------------------------------------------------------- exclusion (spec 3.6)

/** Rebuilds the site without the excluded sims when any of them is still published. */
async function applyExclusions( o, ctx, exclusions ) {
  if ( !exclusions.length ) { return null; }
  const stillPublished = exclusions.filter( e => existsSync( ctx.published( e.id ) ) );
  if ( !stillPublished.length ) { return { rebuilt: false }; }
  const r = await runNode( [ path.join( REPO_ROOT, 'site', 'build-site.mjs' ), '--sims-dir', o.simsDir, '--out', o.siteDir, '--thumbs',
                             '--exclude', exclusions.map( e => e.id ).join( ',' ) ], { timeoutMs: 15 * 60 * 1000 } );
  return { rebuilt: r.code === 0, exitCode: r.code, output: firstLine( r.stdout ) || firstLine( r.stderr ) };
}

// ---------------------------------------------------------------------------------------------------- V6 extra

/** The catalogue itself: one card per published sim, every exam sim in the exam section. */
function catalogueCounts( o, ctx ) {
  const index = path.join( o.siteDir, 'index.html' );
  if ( !existsSync( index ) ) { return [ { id: 'index.html', error: '사이트 없음' } ]; }
  const html = readFileSync( index, 'utf8' );
  const cards = [ ...html.matchAll( /<a class="card" href="sims\/([^"]+)\.html" data-sim="([^"]+)"/g ) ].map( m => m[ 2 ] );
  const examBlock = html.slice( html.indexOf( '<section class="exam"' ), html.indexOf( '</section>', html.indexOf( '<section class="exam"' ) ) );
  const examCards = [ ...examBlock.matchAll( /data-sim="([^"]+)"/g ) ].map( m => m[ 1 ] );
  const problems = [];
  const missing = ctx.allIds.filter( id => !cards.includes( id ) );
  if ( missing.length ) { problems.push( { id: 'index.html', error: `카드 없음: ${missing.join( ', ' )}` } ); }
  const missingExam = ctx.examIds.filter( id => !examCards.includes( id ) );
  if ( missingExam.length ) { problems.push( { id: 'index.html', error: `시험 범위 칸에 없음: ${missingExam.join( ', ' )}` } ); }
  return problems;
}

// ---------------------------------------------------------------------------------------------------- V10b / V10c

async function checkV10b( ctx ) {
  const t0 = Date.now();
  const { ALL_RULES } = await import( '../theme/patches/index.mjs' );
  const { loadTermFixes, termFixRules } = await import( '../theme/patches/terms.mjs' );
  const fixes = await loadTermFixes();
  const rules = [ ...ALL_RULES ];
  const failures = [];
  for ( const id of ctx.allIds ) {
    const rec = ctx.records.get( id );
    const manifest = ctx.newIds.includes( id ) ? rec : await readManifest( id );
    if ( !manifest ) { failures.push( { id, reason: '매니페스트 없음 (npm run fetch-sources)' } ); continue; }
    rules.push( ...await termFixRules( id, manifest, fixes ) );
  }
  const records = ctx.allIds.map( id => ctx.records.get( id ) || { id, success: false, patches: [] } );
  const r = checkPatchAllowlist( { rules, records } );
  const nonExam = ctx.allIds.filter( id => !ctx.examIds.includes( id ) );
  const badIds = new Set( r.failures.map( f => f.id ) );
  return makeResult( 'V10b', { passed: r.passed, total: r.total, failures: [ ...failures, ...r.failures ], ms: Date.now() - t0,
    notes: [ `비시험 ${nonExam.length}개 중 ${nonExam.filter( id => !badIds.has( id ) ).length}개 통과`, `규칙 ${r.rulesChecked}개, 파일 ${r.filesChecked}건 확인` ] } );
}

function checkV10c( o, ctx ) {
  const t0 = Date.now();
  if ( !existsSync( o.namesFile ) ) {
    return makeResult( 'V10c', { passed: 0, total: 0, failures: [ { id: 'names', reason: `실명 목록 파일 없음 (${o.namesFile})` } ], ms: Date.now() - t0 } );
  }
  const names = parseNames( readFileSync( o.namesFile, 'utf8' ) );
  if ( !names.length ) { return makeResult( 'V10c', { passed: 0, total: 0, failures: [ { id: 'names', reason: '실명 목록이 비어 있음' } ] } ); }
  const files = [];
  const seen = new Map(); // content hash -> label, so identical copies (site = build) are read once
  const add = ( label, file ) => {
    const buf = readFileSync( file );
    const h = createHash( 'sha1' ).update( buf ).digest( 'hex' );
    if ( seen.has( h ) ) { files.push( { label, read: () => Buffer.alloc( 0 ), dupOf: seen.get( h ) } ); return; }
    seen.set( h, label );
    files.push( { label, read: () => buf } );
  };
  const groups = { builds: 0, site: 0, repo: 0 };
  for ( const id of ctx.allIds ) { if ( existsSync( ctx.built( id ) ) ) { add( `build: ${path.relative( REPO_ROOT, ctx.built( id ) )}`, ctx.built( id ) ); groups.builds++; } }
  for ( const f of walk( o.siteDir ) ) { add( `site: ${path.relative( REPO_ROOT, f )}`, f ); groups.site++; }
  return { names, files, groups, t0 };
}

async function finishV10c( pre ) {
  if ( pre.id ) { return pre; }
  const { names, files, groups, t0 } = pre;
  const ls = await runGit( [ 'ls-files', '-z' ] );
  const tracked = ls.split( '\0' ).filter( Boolean ).filter( f => existsSync( path.join( REPO_ROOT, f ) ) && statSync( path.join( REPO_ROOT, f ) ).isFile() );
  for ( const f of tracked ) { files.push( { label: `repo: ${f}`, read: () => readFileSync( path.join( REPO_ROOT, f ) ) } ); }
  groups.repo = tracked.length;
  const r = scanForNames( files, names );
  // Report files and counts only; a copy identical to an earlier file is reported under that file.
  const failures = r.hitFiles.map( h => ( { id: h.file, reason: `${h.hits}건` } ) );
  return makeResult( 'V10c', { passed: files.length - r.hitFiles.length, total: files.length, failures, ms: Date.now() - t0,
    exitCode: groups.builds === 0 || groups.site === 0 ? 2 : 0, // nothing to scan is not a pass
    notes: [ `이름 ${r.names}개 × 파일 ${r.scanned}개 (빌드 ${groups.builds}, 사이트 ${groups.site}, 저장소 추적 파일 ${groups.repo}), 일치 ${r.totalHits}건`, `목록 지문 ${r.namesDigest}` ] } );
}

function runGit( args ) {
  return new Promise( ( resolve, reject ) => {
    const c = spawn( 'git', [ '-C', REPO_ROOT, ...args ] );
    let out = '';
    c.stdout.on( 'data', d => { out += d; } );
    c.on( 'close', code => ( code === 0 ? resolve( out ) : reject( new Error( `git ${args.join( ' ' )} exit ${code}` ) ) ) );
  } );
}

// ---------------------------------------------------------------------------------------------------- npm test

async function runTests( o ) {
  const reporter = path.join( TOOLS, 'lib', 'test-events-reporter.mjs' );
  const r = await runNode( [ '--test', `--test-reporter=${reporter}`, 'tests/**/*.test.mjs' ],
    { env: { BSSHS_SITE_DIR: o.siteDir, BSSHS_PRIVATE_NAMES: o.namesFile }, timeoutMs: 20 * 60 * 1000 } );
  const events = r.stdout.split( '\n' ).map( l => { try { return JSON.parse( l ); } catch { return null; } } ).filter( e => e && e.event );
  return { exitCode: r.code, ms: r.ms, groups: groupTestEvents( events, REPO_ROOT ), stderr: r.stderr };
}

// ---------------------------------------------------------------------------------------------------- main

/** @param {string[]} argv @returns {Promise<number>} */
export async function main( argv ) {
  let o;
  try { o = parseVerifyArgs( argv ); }
  catch ( e ) { console.error( e.message ); return 2; }
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const sel = new Set( o.selected );
  const ctx = context( o );
  mkdirSync( ctx.work, { recursive: true } );
  const results = [];
  const log = s => console.log( s );
  log( `검증 시작: ${o.selected.join( ', ' )} (동시 작업 ${o.jobs}개)` );

  // Phase 1: patch allow-list (static) next to V3 and V9 (browser jobs on fresh drawer injections).
  const prep = sel.has( 'V3' ) || sel.has( 'V9' ) ? await prepareInjected( ctx ) : null;
  const browserJobs = [];
  if ( sel.has( 'V3' ) ) { ctx.examIds.forEach( id => browserJobs.push( { kind: 'V3', run: () => runV3Job( o, ctx, prep, id ) } ) ); }
  if ( sel.has( 'V9' ) ) { ctx.examIds.forEach( id => [ 1280, 390 ].forEach( width => browserJobs.push( { kind: 'V9', run: () => runV9Job( o, ctx, prep, { id, width } ) } ) ) ); }
  const v10bPromise = sel.has( 'V10b' ) ? checkV10b( ctx ) : null;
  const phase1Start = Date.now();
  // V3 first in the queue: its result decides exclusions before the site-dependent checks.
  const phase1 = await pool( browserJobs, o.jobs, async j => ( { kind: j.kind, ...( await j.run() ) } ) );
  if ( v10bPromise ) { results.push( await v10bPromise ); }
  const v3 = phase1.filter( r => r.kind === 'V3' );
  const v9 = phase1.filter( r => r.kind === 'V9' );
  let exclusions = [];
  if ( sel.has( 'V3' ) ) {
    const casesPassed = v3.reduce( ( a, r ) => a + ( r.casesPassed || 0 ), 0 );
    const casesTotal = v3.reduce( ( a, r ) => a + ( r.casesTotal || 0 ), 0 );
    results.push( makeResult( 'V3', { passed: v3.filter( r => r.ok ).length, total: ctx.examIds.length, ms: Date.now() - phase1Start,
      failures: v3.filter( r => !r.ok ).map( r => ( { id: r.id, error: r.error } ) ), details: v3,
      notes: [ `사례 ${casesPassed}/${casesTotal}`, `허용 오차: 사례에 적힌 값, 없으면 상대 1% (run-cases 기본값)`,
               ...Object.entries( o.cases ).map( ( [ id, f ] ) => `${id}: 사례 파일 바꿔 씀 ${f.startsWith( REPO_ROOT + path.sep ) ? path.relative( REPO_ROOT, f ) : f}` ) ] } ) );
    exclusions = exclusionsFromV3( v3, ctx.newIds );
    const prev = path.join( ctx.work, 'exclusions.json' );
    writeFileSync( prev, JSON.stringify( exclusions, null, 2 ) + '\n' );
    if ( exclusions.length ) {
      const applied = await applyExclusions( o, ctx, exclusions );
      log( `공개 제외 (사양 3.6): ${exclusions.map( e => e.id ).join( ', ' )} — 사이트 다시 만듦: ${applied && applied.rebuilt ? '예' : '아니오'}` );
    }
  }
  else if ( existsSync( path.join( ctx.work, 'exclusions.json' ) ) ) {
    exclusions = readJson( path.join( ctx.work, 'exclusions.json' ) );
  }
  if ( sel.has( 'V9' ) ) {
    results.push( makeResult( 'V9', { passed: v9.filter( r => r.ok ).length, total: ctx.examIds.length * 2, ms: Date.now() - phase1Start,
      failures: v9.filter( r => !r.ok ).map( r => ( { id: r.id, width: r.width, error: r.error } ) ), details: v9,
      notes: [ `화면 ${v9.reduce( ( a, r ) => a + ( r.screens || 0 ), 0 )}개 비교 (1280·390, 모든 화면, 시계 멈춤, 난수 고정, 열기 버튼만 제외)` ] } ) );
  }

  // Phase 2: build count, name scan and check-sim on the (possibly re-built) site.
  if ( sel.has( 'V1' ) ) { results.push( await checkV1( o, ctx, exclusions ) ); }
  if ( sel.has( 'V10c' ) ) { results.push( await finishV10c( checkV10c( o, ctx ) ) ); }
  if ( sel.has( 'V2' ) ) {
    const s = Date.now();
    const v2 = await pool( v2Jobs( o, ctx ), o.jobs, job => runV2Job( o, ctx, job ) );
    results.push( makeResult( 'V2', { passed: v2.filter( r => r.ok ).length, total: v2.length, ms: Date.now() - s, details: v2,
      failures: v2.filter( r => !r.ok ).map( r => ( { id: r.id, width: r.width || 1280, error: r.error } ) ),
      notes: [ `사이트 파일(dist/sims) ${ctx.allIds.length}개 × 데스크톱 1280·휴대폰 390` ] } ) );
  }

  // Phase 3: the npm test run (V4, V5, V6, V10a) with the site directory set, after the browser pool.
  const testIds = [ 'V4', 'V5', 'V6', 'V10a', 'TEST' ].filter( id => sel.has( id ) );
  if ( testIds.length ) {
    const t = await runTests( o );
    for ( const id of testIds ) {
      const g = t.groups[ id ];
      const extra = id === 'V6' ? catalogueCounts( o, ctx ) : [];
      results.push( makeResult( id, {
        passed: g.passed + ( id === 'V6' ? 1 - Math.min( 1, extra.length ) : 0 ), total: g.total + ( id === 'V6' ? 1 : 0 ),
        failures: [ ...g.failures, ...extra ], ms: t.ms,
        exitCode: id === 'TEST' ? t.exitCode : 0,
        notes: id === 'TEST' ? [ `건너뜀 ${g.skipped}개`, ...( t.exitCode && !g.failures.length ? [ firstLine( t.stderr ) ] : [] ) ] :
               id === 'V6' ? [ `BSSHS_SITE_DIR=${path.relative( REPO_ROOT, o.siteDir ) || '.'}`, '+1 = 카드 68개·시험 범위 14개 확인' ] : []
      } ) );
    }
  }

  const report = aggregate( results, { selected: o.selected, startedAt, ms: Date.now() - t0, exclusions } );
  mkdirSync( path.dirname( o.report ), { recursive: true } );
  writeFileSync( o.report, JSON.stringify( report, null, 2 ) + '\n' );

  log( '\n검증 결과' );
  for ( const c of report.checks ) {
    log( summaryLine( c ) );
    for ( const n of c.notes ) { log( `        ${n}` ); }
  }
  log( `\n${report.ok ? '모두 통과' : `실패: ${report.failed.join( ', ' )}`} · ${Math.round( report.ms / 1000 )}초 · 보고서 ${path.relative( REPO_ROOT, o.report )}` );
  return report.ok ? 0 : 1;
}

if ( isMain( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).then( code => { process.exitCode = code; }, e => { console.error( e.stack || e.message ); process.exitCode = 2; } );
}
