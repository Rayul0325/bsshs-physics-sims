// V6 on a built catalogue (spec 3.7, 3.8, invariants 7 and 8). Runs when a site build exists:
// BSSHS_SITE_DIR (default dist/). Build one with: node site/build-site.mjs --thumbs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTRIBUTION } from '../../brand/bsshs/attribution.mjs';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
const SITE = path.resolve( process.env.BSSHS_SITE_DIR || path.join( ROOT, 'dist' ) );
const INDEX = path.join( SITE, 'index.html' );
const NAMES_FILE = process.env.BSSHS_PRIVATE_NAMES || path.join( os.homedir(), '.config', 'bsshs-physics-sims', 'private-names.txt' );
const skip = existsSync( INDEX ) ? false : `no site build at ${SITE} (run node site/build-site.mjs)`;
const exam = JSON.parse( readFileSync( path.join( ROOT, 'data', 'exam-scope.json' ), 'utf8' ) ).ids;

test( 'every card links to a sim file that exists; exam sims are highlighted with a status badge', { skip }, () => {
  const html = readFileSync( INDEX, 'utf8' );
  const hrefs = [ ...html.matchAll( /<a class="card" href="([^"]+)" data-sim="([^"]+)"/g ) ].map( m => ( { href: m[ 1 ], id: m[ 2 ] } ) );
  const ids = new Set( hrefs.map( h => h.id ) );
  for ( const h of hrefs ) { assert.ok( existsSync( path.join( SITE, h.href ) ), h.href ); }
  const sims = readdirSync( path.join( SITE, 'sims' ) ).filter( f => f.endsWith( '.html' ) );
  assert.equal( ids.size, sims.length, 'each built sim appears on the page' );
  const examBlock = html.slice( html.indexOf( '<section class="exam"' ), html.indexOf( '</section>' ) );
  for ( const id of exam ) {
    if ( !ids.has( id ) ) { continue; } // an excluded original sim is simply not listed
    assert.match( examBlock, new RegExp( `data-sim="${id}"[^]*?class="badge` ), id );
  }
} );

test( 'footer carries the attribution and the not-official line', { skip }, () => {
  const html = readFileSync( INDEX, 'utf8' );
  for ( const s of [ ATTRIBUTION.phetCredit, ATTRIBUTION.originalKo, ATTRIBUTION.modifiedBy, ATTRIBUTION.notOfficial ] ) {
    assert.ok( html.includes( s.replaceAll( '&', '&amp;' ) ), s );
  }
} );

test( 'no private name (teachers, students, personal mail) anywhere in the site', { skip: skip || ( existsSync( NAMES_FILE ) ? false : `no names file ${NAMES_FILE}` ) }, () => {
  const names = readFileSync( NAMES_FILE, 'utf8' ).split( '\n' ).map( s => s.trim() ).filter( s => s.length >= 2 );
  const files = [ INDEX, ...readdirSync( path.join( SITE, 'sims' ) ).map( f => path.join( SITE, 'sims', f ) ) ];
  const hits = [];
  for ( const f of files ) {
    const text = readFileSync( f, 'utf8' );
    for ( const n of names ) { if ( text.includes( n ) ) { hits.push( `${path.basename( f )}: ${n.slice( 0, 1 )}…` ); } }
  }
  assert.deepEqual( hits, [] );
} );

test( 'layout: no sideways scroll at 390px, touch targets >= 44px, text >= 18px at 1600px, same-origin only', { skip }, async () => {
  const { chromium } = await import( 'playwright' );
  const browser = await chromium.launch( { channel: 'chrome', headless: true } );
  try {
    const page = await browser.newPage();
    const external = [];
    page.on( 'request', r => { if ( !r.url().startsWith( 'file://' ) && !r.url().startsWith( 'data:' ) ) { external.push( r.url() ); } } );
    const cdp = await page.context().newCDPSession( page );
    await cdp.send( 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } );
    await page.goto( `file://${INDEX}` );
    await page.waitForLoadState( 'load' );
    const narrow = await page.evaluate( () => ( {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      smallest: Math.min( ...[ ...document.querySelectorAll( '.card, footer a' ) ].map( a => a.getBoundingClientRect().height ) )
    } ) );
    assert.ok( narrow.overflow <= 0, `horizontal overflow ${narrow.overflow}px at 390` );
    assert.ok( narrow.smallest >= 44, `smallest touch target ${narrow.smallest}px` );
    await cdp.send( 'Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false } );
    const sizes = await page.evaluate( () => [ ...document.querySelectorAll( '.card .title, .badge, .tag, footer.site p' ) ]
      .map( e => parseFloat( getComputedStyle( e ).fontSize ) ) );
    assert.ok( Math.min( ...sizes ) >= 18, `smallest text ${Math.min( ...sizes )}px at 1600` );
    assert.deepEqual( external, [] );
  }
  finally { await browser.close(); }
} );
