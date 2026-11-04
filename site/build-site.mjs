#!/usr/bin/env node
// Builds the catalogue site (spec 3.7) into a static folder:
//   <out>/index.html          catalogue (exam scope first, then class units, then 기타)
//   <out>/sims/<id>.html      the themed build; exam-scope sims get the class drawer injected
//   <out>/thumbs/<id>.png     card thumbnails (optional, --thumbs)
//   <out>/fonts/*             same-origin fonts + OFL licenses (no CDN, invariant 8)
// Usage: node site/build-site.mjs [--sims-dir build/bsshs-theme] [--out dist] [--thumbs]
//        [--exclude id,id] [--no-drawer id,id] [--allow-missing]
// --exclude drops a whole sim from the site; --no-drawer publishes an exam-scope sim as the plain themed
// build, without the class drawer (spec 3.5/3.6: a sim that fails V3 does not ship its added feature).
// Every id of data/exam-scope.json must have its adapter, cases and lessons files, else the build fails
// before writing anything and prints all missing items (spec 2.3).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTokens, toCssVariables, fontFaces } from '../theme/index.mjs';
import { physicsHash } from '../drawer/hash.mjs';
import { assertExamComplete } from '../drawer/inject.mjs';
import { listNewSimIds } from '../tools/lib/new-sims.mjs';
import { loadStatusFile, resolveStatus } from '../drawer/status.mjs';
import { ATTRIBUTION, REPO_URL, WORDMARK } from '../brand/bsshs/attribution.mjs';

export const REPO_ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const readJson = rel => JSON.parse( readFileSync( path.join( REPO_ROOT, rel ), 'utf8' ) );

const BADGE_CLASS = { '확인 중': 'pending', '확인 완료': 'approved', '수정 중': 'fixing' };

/** Escapes text for HTML element content and attribute values. @param {string} s */
export const esc = s => String( s ).replace( /[&<>"']/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ] ) );

/**
 * Korean title from a built sim's <title> (decodes numeric entities, drops bidi embedding marks).
 * @param {string} html
 * @returns {string|null}
 */
export function titleFromHtml( html ) {
  const m = /<title>([^<]*)<\/title>/.exec( html );
  if ( !m ) { return null; }
  const decoded = m[ 1 ].replace( /&#(\d+);/g, ( _, n ) => String.fromCodePoint( Number( n ) ) )
    .replace( /&#x([0-9a-f]+);/gi, ( _, n ) => String.fromCodePoint( parseInt( n, 16 ) ) );
  return decoded.replace( /[‪-‮⁦-⁩]/g, '' ).trim() || null;
}

/**
 * Extra CSS variables the site needs beyond toCssVariables (size and site groups).
 * @param {any} tokens
 * @returns {string}
 */
export function siteVariables( tokens ) {
  const kebab = s => String( s ).replace( /([a-z0-9])([A-Z])/g, '$1-$2' ).toLowerCase();
  const lines = [];
  for ( const [ k, v ] of Object.entries( tokens.size || {} ) ) { lines.push( `  --bsshs-size-${kebab( k )}: ${v};` ); }
  for ( const [ k, v ] of Object.entries( tokens.site || {} ) ) { lines.push( `  --site-${kebab( k )}: ${v};` ); }
  return `:root {\n${lines.join( '\n' )}\n}\n`;
}

/**
 * The site stylesheet with token-driven breakpoints filled in.
 * @param {any} tokens
 * @returns {string}
 */
export function siteCss( tokens ) {
  const css = readFileSync( path.join( REPO_ROOT, 'site', 'site.css' ), 'utf8' )
    .replaceAll( '__BREAKPOINT_SHEET__', tokens.breakpoint.sheet )
    .replaceAll( '__BREAKPOINT_LARGE__', tokens.breakpoint.large );
  return toCssVariables( tokens ) + siteVariables( tokens ) + css;
}

/**
 * Catalogue model: ordered sections with cards. Pure (no file writes), so it is unit-testable.
 * @param {{ ids: string[], titles: Record<string,string>, units: any, exam: { exam: string, ids: string[] },
 *   status: Record<string,{state:string,label:string}>, originals: Set<string>, thumbs: Set<string> }} input
 */
export function catalogueModel( input ) {
  const available = new Set( input.ids );
  const card = id => ( {
    id,
    title: input.titles[ id ] || id,
    href: `sims/${id}.html`,
    thumb: input.thumbs.has( id ) ? `thumbs/${id}.png` : null,
    exam: input.exam.ids.includes( id ),
    original: input.originals.has( id ),
    status: input.exam.ids.includes( id ) ? input.status[ id ] : null
  } );
  const sections = [ {
    kind: 'exam', id: 'exam', name: '기말 시험 범위', note: input.exam.exam,
    cards: input.exam.ids.filter( id => available.has( id ) ).map( card )
  } ];
  for ( const u of [ ...input.units.units ].sort( ( a, b ) => a.order - b.order ) ) {
    const cards = u.sims.filter( id => available.has( id ) ).map( card );
    if ( cards.length ) { sections.push( { kind: 'unit', id: u.id, name: u.name, cards } ); }
  }
  return sections;
}

/** @param {any} c */
function cardHtml( c ) {
  const tags = [];
  if ( c.exam ) { tags.push( '<span class="tag">시험 범위</span>' ); }
  if ( c.original ) { tags.push( '<span class="tag original">새로 만든 시뮬레이션</span>' ); }
  if ( c.status ) { tags.push( `<span class="badge ${BADGE_CLASS[ c.status.state ]}">${esc( c.status.label )}</span>` ); }
  const img = c.thumb ? `<img class="thumb" src="${esc( c.thumb )}" alt="" loading="lazy">` : '<span class="thumb" aria-hidden="true"></span>';
  return `<li><a class="card" href="${esc( c.href )}" data-sim="${esc( c.id )}">${img}<span class="body"><span class="title">${esc( c.title )}</span>${tags.length ? `<span class="tags">${tags.join( '' )}</span>` : ''}</span></a></li>`;
}

/**
 * The whole index.html.
 * @param {ReturnType<typeof catalogueModel>} sections
 * @param {any} tokens
 * @param {number} total
 */
export function indexHtml( sections, tokens, total ) {
  const faces = fontFaces( tokens ).map( f => `@font-face { font-family: ${JSON.stringify( f.family )}; src: url("fonts/${path.basename( f.file )}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap; }` ).join( '\n' );
  const body = sections.map( s => `
<section class="${s.kind}" id="${esc( s.id )}">
  <header><h2>${esc( s.name )}</h2><span class="count">${s.cards.length}개</span></header>
  ${s.note ? `<p class="exam-name">${esc( s.note )}</p>` : ''}
  <ul class="grid">${s.cards.map( cardHtml ).join( '' )}</ul>
</section>` ).join( '\n' );
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc( WORDMARK )} 물리 시뮬레이션</title>
<style>
${faces}
${siteCss( tokens )}
</style>
</head>
<body>
<div class="wrap">
<div class="hero">
  <span class="wordmark">${esc( WORDMARK )}</span>
  <h1>물리 시뮬레이션 <em>Lab</em></h1>
  <p>「전자기와 양자」 수업과 기말 대비에 쓰는 시뮬레이션 ${total}개. 시험 범위 시뮬레이션에는 측정 기록·그래프·수업 공식을 담은 「수업 서랍」이 있습니다.</p>
</div>
${body}
<footer class="site">
  <p class="not-official">${esc( ATTRIBUTION.notOfficial )}</p>
  <p>${esc( ATTRIBUTION.phetCredit )}</p>
  <p>${esc( ATTRIBUTION.originalKo )} · ${esc( ATTRIBUTION.modifiedBy )}</p>
  <p>${esc( ATTRIBUTION.licenses )} · 비상업 용도</p>
  <p><a href="${esc( REPO_URL )}">소스 코드: ${esc( REPO_URL )}</a></p>
</footer>
</div>
</body>
</html>
`;
}

/**
 * Captures one PNG thumbnail per sim (Playwright, installed Chrome).
 * @param {{ id: string, html: string }[]} items
 * @param {string} outDir
 * @param {any} tokens
 * @returns {Promise<Set<string>>} ids that got a thumbnail
 */
async function captureThumbs( items, outDir, tokens ) {
  const { chromium } = await import( 'playwright' );
  const browser = await chromium.launch( { channel: 'chrome', headless: true } );
  const done = new Set();
  const width = Number( tokens.site.thumbWidth );
  const height = Number( tokens.site.thumbHeight );
  try {
    for ( const { id, html } of items ) {
      const page = await browser.newPage( { viewport: { width, height } } );
      try {
        await page.goto( `file://${html}` );
        // Same readiness rule as tools/check-sim.mjs: older sims have no construction-complete property.
        await page.waitForFunction( () => {
          const sim = window.phet?.joist?.sim;
          const display = sim && ( sim.display || window.phet.joist.display );
          if ( !display || !display.rootNode ) { return false; }
          const cc = sim.isConstructionCompleteProperty || sim._isConstructionCompleteProperty;
          if ( cc && cc.value === false ) { return false; }
          return !document.querySelector( '[id*="splash"]' );
        }, null, { timeout: 20000 } );
        await page.waitForTimeout( 800 );
        await page.screenshot( { path: path.join( outDir, `${id}.png` ) } );
        done.add( id );
      }
      catch ( e ) { console.error( `thumb ${id}: ${e.message.split( '\n' )[ 0 ]}` ); }
      finally { await page.close(); }
    }
  }
  finally { await browser.close(); }
  return done;
}

/** @param {string[]} argv */
export function parseArgs( argv ) {
  const o = { simsDir: path.join( REPO_ROOT, 'build', 'bsshs-theme' ), out: path.join( REPO_ROOT, 'dist' ), thumbs: false, exclude: [], noDrawer: [], allowMissing: false };
  for ( let i = 0; i < argv.length; i++ ) {
    const a = argv[ i ];
    if ( a === '--sims-dir' ) { o.simsDir = path.resolve( argv[ ++i ] ); }
    else if ( a === '--out' ) { o.out = path.resolve( argv[ ++i ] ); }
    else if ( a === '--thumbs' ) { o.thumbs = true; }
    else if ( a === '--exclude' ) { o.exclude = argv[ ++i ].split( ',' ).filter( Boolean ); }
    else if ( a === '--no-drawer' ) { o.noDrawer = argv[ ++i ].split( ',' ).filter( Boolean ); }
    else if ( a === '--allow-missing' ) { o.allowMissing = true; }
    else { throw new Error( `unknown argument ${a}` ); }
  }
  return o;
}

/** @param {string[]} argv */
export async function main( argv ) {
  const o = parseArgs( argv );
  const tokens = loadTokens();
  const sims = readJson( 'data/sims.json' ).map( s => s.id );
  const exam = readJson( 'data/exam-scope.json' );
  assertExamComplete( exam.ids );
  const originals = listNewSimIds(); // the same definition of "new sim" as tools/verify.mjs
  const allIds = [ ...sims, ...originals ].filter( id => !o.exclude.includes( id ) );
  const titles = readJson( 'data/titles.json' );
  const units = readJson( 'data/units.json' );
  const statusFile = loadStatusFile();

  rmSync( o.out, { recursive: true, force: true } );
  for ( const d of [ 'sims', 'thumbs', 'fonts' ] ) { mkdirSync( path.join( o.out, d ), { recursive: true } ); }

  const present = [];
  const missing = [];
  for ( const id of allIds ) {
    const src = path.join( o.simsDir, id, `${id}_ko.html` );
    if ( !existsSync( src ) ) { missing.push( id ); continue; }
    const dest = path.join( o.out, 'sims', `${id}.html` );
    if ( exam.ids.includes( id ) && !o.noDrawer.includes( id ) ) {
      const r = spawnSync( process.execPath, [ path.join( REPO_ROOT, 'tools', 'inject-drawer.mjs' ), src, id, '--out', dest ], { encoding: 'utf8' } );
      if ( r.status !== 0 ) { throw new Error( `inject-drawer ${id} failed:\n${r.stderr || r.stdout}` ); }
    }
    else { copyFileSync( src, dest ); }
    if ( !titles[ id ] ) { titles[ id ] = titleFromHtml( readFileSync( src, 'utf8' ) ) || id; }
    present.push( { id, html: src } );
  }
  if ( missing.length && !o.allowMissing ) { throw new Error( `missing builds: ${missing.join( ', ' )} (use --allow-missing or --exclude)` ); }

  for ( const f of fontFaces( tokens ) ) {
    copyFileSync( f.file, path.join( o.out, 'fonts', path.basename( f.file ) ) );
    copyFileSync( f.license, path.join( o.out, 'fonts', path.basename( f.license ) ) );
  }

  const thumbs = o.thumbs ? await captureThumbs( present, path.join( o.out, 'thumbs' ), tokens ) : new Set();
  const status = {};
  for ( const id of exam.ids ) { status[ id ] = resolveStatus( statusFile[ id ], physicsHash( id ) ); }
  const sections = catalogueModel( { ids: present.map( p => p.id ), titles, units, exam, status, originals: new Set( originals ), thumbs } );
  writeFileSync( path.join( o.out, 'index.html' ), indexHtml( sections, tokens, present.length ) );
  console.log( JSON.stringify( { out: o.out, sims: present.length, missing, excluded: o.exclude, noDrawer: o.noDrawer.filter( id => exam.ids.includes( id ) ), thumbs: thumbs.size } ) );
  return { present: present.length, missing, thumbs: thumbs.size };
}

if ( process.argv[ 1 ] && path.resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {
  main( process.argv.slice( 2 ) ).catch( e => { console.error( e.message || e ); process.exit( 1 ); } );
}
