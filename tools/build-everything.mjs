#!/usr/bin/env node
// The full build in one command (docs/verify.md):
//   1. the 63 PhET school builds (--brand bsshs --theme, 10 slots) and the 5 original sims (build-all --include-new);
//   2. the build matrices rewritten in a stable, commit-friendly form (see normalizeMatrix);
//   3. the catalogue site in dist/ with thumbnails (site/build-site.mjs --thumbs).
// Resumable like build-all: up-to-date sims are skipped; --force rebuilds every sim.
// Usage: node tools/build-everything.mjs [--force] [--jobs 10] [--out dist] [--exclude id,id]
// --exclude passes through to the site build (spec 3.5/3.6 exclusions are applied by tools/verify.mjs after V3).
// The dist/ made here has NOT passed V3: deploy only a dist/ from a passing `npm run verify` (docs/verify.md).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT, cacheDir } from './lib/paths.mjs';
import { isMain } from './lib/cli.mjs';
import { main as buildAll } from './build-all.mjs';

export const MATRIX_FILES = Object.freeze( [ 'build-matrix.json', 'build-matrix.bsshs-theme.json', 'build-matrix.new-sims.json' ] );

/**
 * Makes a matrix independent of the machine that built it: absolute cache and repo paths inside
 * recorded error texts become `$BSSHS_CACHE` / `.`, and rows are ordered by the given id order.
 * Everything else (SHAs, hashes, timestamps of the build that made each row) is kept as recorded.
 * @param {any} matrix
 * @param {{ cache: string, repo: string, order?: string[] }} where
 * @returns {any}
 */
export function normalizeMatrix( matrix, { cache, repo, order } ) {
  const swap = s => ( typeof s === 'string' ? s.split( cache ).join( '$BSSHS_CACHE' ).split( repo ).join( '.' ) : s );
  const deep = v => {
    if ( Array.isArray( v ) ) { return v.map( deep ); }
    if ( v && typeof v === 'object' ) { return Object.fromEntries( Object.entries( v ).map( ( [ k, x ] ) => [ k, deep( x ) ] ) ); }
    return swap( v );
  };
  const out = deep( matrix );
  if ( Array.isArray( out.sims ) ) {
    const pos = new Map( ( order || [] ).map( ( id, i ) => [ id, i ] ) );
    out.sims = [ ...out.sims ].sort( ( a, b ) => ( pos.get( a.id ) ?? 1e9 ) - ( pos.get( b.id ) ?? 1e9 ) || a.id.localeCompare( b.id ) );
  }
  return out;
}

/**
 * A rerun that rebuilt nothing must leave the file byte-identical: when the new matrix differs from the
 * previous one only in `generatedAt`, the previous timestamp is kept.
 * @param {any|null} prev - matrix before this run (already normalized form or raw)
 * @param {any} next
 * @returns {any}
 */
export function keepStableTimestamp( prev, next ) {
  if ( !prev || prev.generatedAt === undefined || next.generatedAt === undefined ) { return next; }
  const strip = m => JSON.stringify( { ...m, generatedAt: null } );
  return strip( prev ) === strip( next ) ? { ...next, generatedAt: prev.generatedAt } : next;
}

/** @param {string[]} argv */
export function parseEverythingArgs( argv ) {
  const o = { force: false, jobs: '10', out: path.join( REPO_ROOT, 'dist' ), exclude: null };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    if ( a === '--force' ) { o.force = true; }
    else if ( a === '--jobs' ) { o.jobs = argv[ ++i ]; }
    else if ( a === '--out' ) { o.out = path.resolve( argv[ ++i ] ); }
    else if ( a === '--exclude' ) { o.exclude = argv[ ++i ]; }
    else { throw new Error( `unknown argument ${a}` ); }
  }
  return o;
}

/** @param {string[]} argv @returns {Promise<number>} */
export async function main( argv ) {
  const o = parseEverythingArgs( argv );
  const t0 = Date.now();
  const order = JSON.parse( readFileSync( path.join( REPO_ROOT, 'data', 'sims.json' ), 'utf8' ) ).map( s => s.id );
  const where = { cache: cacheDir(), repo: REPO_ROOT, order };
  const previous = new Map( MATRIX_FILES.map( f => path.join( REPO_ROOT, 'data', f ) ).filter( existsSync )
    .map( file => [ file, normalizeMatrix( JSON.parse( readFileSync( file, 'utf8' ) ), where ) ] ) );
  const originalText = new Map( [ ...previous.keys() ].map( file => [ file, readFileSync( file, 'utf8' ) ] ) );
  console.log( '== 1/3 시뮬레이션 빌드 (PhET 63개 학교판 + 새 시뮬레이션)' );
  const buildCode = await buildAll( [ '--brand', 'bsshs', '--theme', '--jobs', o.jobs, '--include-new', ...( o.force ? [ '--force' ] : [] ) ] );

  console.log( '\n== 2/3 빌드 기록 정리 (data/build-matrix*.json)' );
  for ( const f of MATRIX_FILES ) {
    const file = path.join( REPO_ROOT, 'data', f );
    if ( !existsSync( file ) ) { continue; }
    const before = readFileSync( file, 'utf8' );
    const after = JSON.stringify( keepStableTimestamp( previous.get( file ) || null, normalizeMatrix( JSON.parse( before ), where ) ), null, 2 ) + '\n';
    if ( after !== before ) { writeFileSync( file, after ); }
    console.log( `${f}: ${after === originalText.get( file ) ? '이번 실행 전과 같음' : '바뀜'}` );
  }

  console.log( '\n== 3/3 목록 사이트 (썸네일 포함)' );
  const site = spawnSync( process.execPath, [ path.join( REPO_ROOT, 'site', 'build-site.mjs' ), '--out', o.out, '--thumbs',
                                              ...( o.exclude ? [ '--exclude', o.exclude ] : [] ) ], { stdio: 'inherit', cwd: REPO_ROOT } );
  const code = buildCode || site.status || 0;
  console.log( `\n전체 빌드 ${code === 0 ? '성공' : `실패 (빌드 ${buildCode}, 사이트 ${site.status})`} · ${Math.round( ( Date.now() - t0 ) / 1000 )}초 · 다음: npm run verify` );
  console.log( '주의: 이 dist/는 아직 물리 검사(V3)를 거치지 않았습니다. 끝 코드 0으로 끝난 `npm run verify`가 만들거나 확인한 dist/만 배포하세요 (docs/verify.md).' );
  return code;
}

if ( isMain( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).then( code => { process.exitCode = code; }, e => { console.error( e.stack || e.message ); process.exitCode = 2; } );
}
