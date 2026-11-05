#!/usr/bin/env node
// Builds the review page for the restyle: build/style-review/index.html, a local Korean page with the frozen
// "before" (layout baseline) and the current "after" screenshot of every screen of every chosen sim, next to
// the V11 and V12 results. Images are separate PNG files beside the page (relative paths), so the page opens
// from file:// without a server.
//
// Usage: node tools/style-review.mjs [--sims id,id | --done | --all] [--out build/style-review] [--width 1280]
//                                   [--sims-dir build/bsshs-theme] [--baseline-dir <dir>] [--styles-dir <dir>]
//   default: the sims of data/style-done.json (when it is empty, nothing is chosen: pass --sims or --all)
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { isMain } from './lib/cli.mjs';
import { loadTokens, toCssVariables } from '../theme/index.mjs';
import { REPO_ROOT, buildDir } from './lib/paths.mjs';
import { openSim, visitScreens } from './lib/page-control.mjs';
import { checkStyle } from './check-style.mjs';
import { compareSim, allSimIds, baselineDir, baselineFile } from './compare-bounds.mjs';
import { loadStyleDone } from './lib/style-core.mjs';
import { SIM_STYLES_DIR } from '../theme/sim-style.mjs';
import { esc } from '../site/build-site.mjs';

/** @param {string[]} argv */
export function parseReviewArgs( argv ) {
  const o = { sims: null, done: true, all: false, out: path.join( buildDir(), 'style-review' ), width: 1280, simsDir: path.join( buildDir(), 'bsshs-theme' ),
              baselineDir: baselineDir(), stylesDir: SIM_STYLES_DIR };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    const val = () => ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : argv[ ++i ] );
    if ( a.startsWith( '--sims-dir' ) ) { o.simsDir = path.resolve( val() ); }
    else if ( a.startsWith( '--sims' ) ) { o.sims = val().split( ',' ).filter( Boolean ); }
    else if ( a === '--done' ) { o.done = true; }
    else if ( a === '--all' ) { o.all = true; }
    else if ( a.startsWith( '--out' ) ) { o.out = path.resolve( val() ); }
    else if ( a.startsWith( '--width' ) ) { o.width = Number( val() ); }
    else if ( a.startsWith( '--baseline-dir' ) ) { o.baselineDir = path.resolve( val() ); }
    else if ( a.startsWith( '--styles-dir' ) ) { o.stylesDir = path.resolve( val() ); }
    else { throw new Error( `unknown option ${a}` ); }
  }
  return o;
}

/**
 * Screenshots of every screen of one build.
 * @param {import('playwright').Browser} browser
 * @param {string} file
 * @param {number} width
 * @returns {Promise<{ index: number, name: string, png: Buffer }[]>}
 */
async function shootScreens( browser, file, width ) {
  const { context, page } = await openSim( browser, file, { width } );
  try {
    const out = [];
    await visitScreens( page, {}, async t => {
      out.push( { index: t.index, name: t.name === 'null' ? '' : t.name, png: await page.screenshot( { type: 'png', animations: 'disabled', caret: 'hide' } ) } );
    } );
    return out;
  }
  finally { await context.close(); }
}

/** One cell of the summary: text and a good/bad class. */
const badge = ( ok, text ) => `<span class="badge ${ok ? 'ok' : 'bad'}">${esc( text )}</span>`;

/**
 * The page. Pure: everything comes from `rows`.
 * @param {{ rows: any[], tokens: any, generatedAt: string, doneCount: number, total: number }} m
 * @returns {string}
 */
export function reviewHtml( { rows, tokens, generatedAt, doneCount, total } ) {
  const summary = rows.map( r => {
    const v11 = r.v11;
    const v12 = r.v12;
    return `<tr><td><a href="#${esc( r.id )}">${esc( r.title || r.id )}</a><div class="id">${esc( r.id )}</div></td>` +
      `<td>${r.inDoneList ? badge( true, '완료 목록' ) : '<span class="muted">완료 목록 밖</span>'}</td>` +
      `<td>${v11 ? `${badge( v11.ok, v11.ok ? '통과' : '실패' )} <span class="muted">열린 지적 ${v11.open}건 · 예외 ${v11.excepted}건</span>` : '<span class="muted">검사 안 함</span>'}</td>` +
      `<td>${v11 && v11.maxShare !== null ? `${( v11.maxShare * 100 ).toFixed( 1 )}%` : '–'}</td>` +
      `<td>${v11 && v11.minContrast !== null ? `${v11.minContrast.toFixed( 2 )}:1` : '–'}</td>` +
      `<td>${v12 ? `${badge( v12.ok, v12.ok ? '같음' : '다름' )} <span class="muted">${v12.differing}개</span>` : '<span class="muted">–</span>'}</td></tr>`;
  } ).join( '\n' );
  const sections = rows.map( r => {
    const findings = r.v11 && r.v11.top.length ?
      `<details><summary>열린 지적 ${r.v11.open}건 중 앞 ${r.v11.top.length}건</summary><ul>${r.v11.top.map( f => `<li><b>${esc( f.kind )}</b> ${esc( f.node )}${f.color ? ` · 색 ${esc( f.color )}` : ''}${f.dialog ? ` · ${esc( f.dialog )} 창` : ''} · ${esc( f.count )}곳<br><span class="muted">${esc( f.detail )}</span></li>` ).join( '' )}</ul></details>` : '';
    const shots = r.screens.map( s => `<figure><figcaption>${esc( s.name || '화면' )}</figcaption><div class="pair"><div><div class="tag">이전 (고정본)</div><img loading="lazy" src="${esc( s.before )}" alt="이전 ${esc( s.name )}"></div><div><div class="tag">이후 (지금 빌드)</div><img loading="lazy" src="${esc( s.after )}" alt="이후 ${esc( s.name )}"></div></div></figure>` ).join( '\n' );
    return `<section id="${esc( r.id )}"><h2>${esc( r.title || r.id )} <span class="id">${esc( r.id )}</span></h2>${r.error ? `<p class="bad-text">${esc( r.error )}</p>` : ''}${findings}${shots}</section>`;
  } ).join( '\n' );
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>시뮬레이션 내부 디자인 대조표</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${toCssVariables( tokens )}
body { margin: 0; padding: var(--bsshs-space-6); background: var(--bsshs-color-bg); color: var(--bsshs-color-text); font: var(--bsshs-font-size-base) var(--bsshs-font-sans); letter-spacing: var(--bsshs-tracking-tight); }
main { max-width: 1400px; margin: 0 auto; }
h1 { font-size: var(--bsshs-font-size-3xl); margin: 0 0 var(--bsshs-space-2); }
h2 { font-size: var(--bsshs-font-size-xl); margin: var(--bsshs-space-8) 0 var(--bsshs-space-3); }
.muted { color: var(--bsshs-color-text-muted); font-size: var(--bsshs-font-size-sm); }
.id { color: var(--bsshs-color-text-subtle); font-size: var(--bsshs-font-size-xs); }
.card { background: var(--bsshs-color-surface); border: var(--bsshs-size-hairline) solid var(--bsshs-color-border); border-radius: var(--bsshs-radius-lg); padding: var(--bsshs-space-4); box-shadow: var(--bsshs-shadow-card); }
table { width: 100%; border-collapse: collapse; background: var(--bsshs-color-surface); border-radius: var(--bsshs-radius-lg); overflow: hidden; }
th, td { text-align: left; padding: var(--bsshs-space-2) var(--bsshs-space-3); border-bottom: var(--bsshs-size-hairline) solid var(--bsshs-color-border); vertical-align: top; }
th { background: var(--bsshs-color-surface-alt); font-size: var(--bsshs-font-size-sm); }
.badge { display: inline-block; padding: 0 var(--bsshs-space-2); border-radius: var(--bsshs-radius-full); font-size: var(--bsshs-font-size-xs); color: var(--bsshs-color-accent-text); }
.badge.ok { background: var(--bsshs-color-success); }
.badge.bad { background: var(--bsshs-color-danger); }
.bad-text { color: var(--bsshs-color-danger); }
a { color: var(--bsshs-color-accent-soft-text); }
figure { margin: var(--bsshs-space-4) 0; }
figcaption { font-weight: var(--bsshs-font-wordmark-weight); margin-bottom: var(--bsshs-space-2); }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--bsshs-space-3); }
.pair img { width: 100%; height: auto; border: var(--bsshs-size-hairline) solid var(--bsshs-color-border); border-radius: var(--bsshs-radius-md); background: var(--bsshs-color-surface); }
.tag { font-size: var(--bsshs-font-size-xs); color: var(--bsshs-color-text-muted); margin-bottom: var(--bsshs-space-1); }
details { margin: var(--bsshs-space-2) 0; }
dl { margin: 0; } dt { font-weight: var(--bsshs-font-wordmark-weight); margin-top: var(--bsshs-space-2); } dd { margin: 0; color: var(--bsshs-color-text-muted); }
</style></head>
<body><main>
<h1>시뮬레이션 내부 디자인 대조표</h1>
<p class="muted">만든 때 ${esc( generatedAt )} · 완료 목록 ${doneCount}개 / 전체 ${total}개 · 이 페이지는 파일로 바로 열립니다(서버 필요 없음).</p>
<div class="card"><dl>
<dt>이전 / 이후</dt><dd>이전은 디자인을 바꾸기 전에 떠 둔 고정본, 이후는 지금 빌드입니다. 같은 시계 상태에서 찍어서 움직임 때문에 달라 보이지 않습니다.</dd>
<dt>검사 V11 (화면 팔레트)</dt><dd>팔레트는 디자인 값 파일(토큰)에 정의한 색 모음입니다. 화면의 칠·선 색이 팔레트 밖이거나, 그라데이션이거나, 원본 그림 그대로이면 「열린 지적」으로 셉니다. 「예외」는 이유와 승인자를 적어 허용한 것입니다.</dd>
<dt>팔레트 밖 픽셀 / 최저 글자 대비</dt><dd>화면 사진에서 팔레트에 없는 색이 차지하는 비율(가장 큰 화면), 글자와 바로 뒤 바탕의 밝기 차이(가장 낮은 글자, 4.5:1 이상이어야 함).</dd>
<dt>검사 V12 (배치 불변)</dt><dd>모든 화면에서 요소의 위치와 크기가 이전과 같은지 봅니다. 「다름」 뒤의 숫자가 달라진 요소 개수입니다.</dd>
<dt>이 검사가 못 보는 것</dt><dd>자동 검사는 「팔레트 안에 있다」까지만 압니다. 보기 좋은지는 아래 그림을 직접 보고 판단해야 합니다.</dd>
</dl></div>
<h2>한눈에 보기</h2>
<table><thead><tr><th>시뮬레이션</th><th>목록</th><th>V11</th><th>팔레트 밖 픽셀</th><th>최저 글자 대비</th><th>V12</th></tr></thead><tbody>
${summary || '<tr><td colspan="6" class="muted">고른 시뮬레이션이 없습니다. 완료 목록이 비어 있으면 --sims id,id 또는 --all 로 고르세요.</td></tr>'}
</tbody></table>
${sections}
</main></body></html>
`;
}

/** @param {string[]} argv @returns {Promise<number>} */
export async function main( argv ) {
  let o;
  try { o = parseReviewArgs( argv ); }
  catch ( e ) { console.error( e.message ); return 2; }
  const tokens = loadTokens();
  const ids = allSimIds();
  const done = loadStyleDone( path.join( REPO_ROOT, 'data', 'style-done.json' ), ids );
  const chosen = o.all ? ids : o.sims || done.ids;
  for ( const id of chosen ) { if ( !ids.includes( id ) ) { console.error( `unknown sim id ${id}` ); return 2; } }
  const titles = JSON.parse( readFileSync( path.join( REPO_ROOT, 'data', 'titles.json' ), 'utf8' ) );
  await rm( o.out, { recursive: true, force: true } );
  await mkdir( path.join( o.out, 'img' ), { recursive: true } );
  const { chromium } = await import( 'playwright' );
  const browser = await chromium.launch( { channel: 'chrome', headless: true } );
  const rows = [];
  try {
    for ( const id of chosen ) {
      const row = { id, title: titles[ id ] || id, inDoneList: done.ids.includes( id ), v11: null, v12: null, screens: [], error: null };
      const after = baselineFile( o.simsDir, id );
      const before = baselineFile( o.baselineDir, id );
      try {
        if ( !existsSync( after ) ) { throw new Error( '빌드 결과 없음' ); }
        const A = existsSync( before ) ? await shootScreens( browser, before, o.width ) : [];
        const B = await shootScreens( browser, after, o.width );
        await mkdir( path.join( o.out, 'img', id ), { recursive: true } );
        for ( const [ i, b ] of B.entries() ) {
          const a = A[ i ];
          const rel = k => `img/${id}/${i}-${k}.png`;
          await writeFile( path.join( o.out, rel( 'after' ) ), b.png );
          if ( a ) { await writeFile( path.join( o.out, rel( 'before' ) ), a.png ); }
          row.screens.push( { name: b.name, before: a ? rel( 'before' ) : rel( 'after' ), after: rel( 'after' ) } );
        }
        if ( !A.length ) { row.error = '고정본이 없어 이전 그림을 못 만들었습니다 (node tools/compare-bounds.mjs --freeze)'; }
        const rep = await checkStyle( { target: after, id, width: o.width, height: null, settle: 800, stylesDir: o.stylesDir, dialogs: true, quiet: true } );
        const shares = rep.views.map( v => v.stats.outsideShare ).filter( x => typeof x === 'number' );
        const ratios = rep.views.map( v => v.stats.worstContrast && v.stats.worstContrast.ratio ).filter( x => typeof x === 'number' );
        row.v11 = { ok: rep.ok, open: rep.openFindings.length, excepted: rep.excepted.length, maxShare: shares.length ? Math.max( ...shares ) : null,
                    minContrast: ratios.length ? Math.min( ...ratios ) : null, top: rep.openFindings.slice( 0, 8 ) };
        if ( existsSync( before ) ) {
          const cmp = await compareSim( browser, { id, baseline: before, current: after, width: o.width, height: null, settle: 800 } );
          row.v12 = { ok: cmp.ok, differing: cmp.differing };
        }
      }
      catch ( e ) { row.error = String( e.message || e ); }
      rows.push( row );
      console.log( `${id}: ${row.error ? `오류 ${row.error}` : `화면 ${row.screens.length}개${row.v11 ? `, V11 ${row.v11.ok ? '통과' : `열린 지적 ${row.v11.open}건`}` : ''}${row.v12 ? `, V12 ${row.v12.ok ? '같음' : `다름 ${row.v12.differing}`}` : ''}`}` );
    }
  }
  finally { await browser.close(); }
  const file = path.join( o.out, 'index.html' );
  await writeFile( file, reviewHtml( { rows, tokens, generatedAt: new Date().toLocaleString( 'ko-KR' ), doneCount: done.ids.length, total: ids.length } ) );
  console.log( `대조표 ${rows.length}개 시뮬레이션: ${file}` );
  console.log( JSON.stringify( { tool: 'style-review', file, sims: rows.length, errors: rows.filter( r => r.error ).map( r => r.id ) } ) );
  return rows.some( r => r.error ) ? 1 : 0;
}

if ( isMain( import.meta.url ) ) { main( process.argv.slice( 2 ) ).then( c => { process.exitCode = c; } ); }
