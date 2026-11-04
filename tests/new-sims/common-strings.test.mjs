// Common-library strings (joist, scenery-phet, sun, …) in the five original sims: the build bundles the
// pinned Korean babel translations exactly as the 63 adapted sims get them (newSimBase babelSha, global term
// fixes applied), and no accessible name the built page exposes is English.
// Needs the themed builds (node tools/build-all.mjs --new-only) and the source cache; skips otherwise.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listNewSimIds } from '../../tools/lib/new-sims.mjs';
import { buildDir, MATRIX_JSON } from '../../tools/lib/paths.mjs';
import { loadKoTables } from '../../tools/lib/ko-strings.mjs';
import { loadTermFixes, applyFixesToValue } from '../../theme/patches/terms.mjs';

const IDS = listNewSimIds();
const built = id => path.join( buildDir(), 'bsshs-theme', id, `${id}_ko.html` );
const base = JSON.parse( readFileSync( MATRIX_JSON, 'utf8' ) ).newSimBase;
let tables = null;
try { tables = await loadKoTables( { deps: base.deps, babelSha: base.babelSha } ); }
catch { tables = null; }
const missing = IDS.filter( id => !existsSync( built( id ) ) );
const skip = missing.length ? `themed builds missing: ${missing.join( ', ' )}` : !tables ? 'source cache (babel mirror) missing' : false;
const strip = s => String( s ).replace( /[‪-‮]/g, '' );
/** Latin words that may appear in Korean UI (units, element symbols, letters as symbols). */
const ALLOWED = /^(?:[A-Za-z]|PN|eV|keV|Hz|kHz|MHz|THz|pm|nm|mm|cm|km|ms|mA|μA|Cs|Na|Zn|Cu|Pt|RGB|AC|DC|CSV|PNG|LED|LASER)$/;

let browser;
before( async () => {
  if ( skip ) { return; }
  const { chromium } = await import( 'playwright' );
  browser = await chromium.launch( { channel: 'chrome', headless: true } );
} );
after( async () => { await browser?.close(); } );

test( 'there are five original sims', () => { assert.equal( IDS.length, 5, IDS.join( ', ' ) ); } );

for ( const id of IDS ) {
  test( `${id}: every pinned Korean common string is bundled, and no exposed accessible name is English`, { skip, timeout: 120000 }, async () => {
    const page = await browser.newPage();
    try {
      await page.goto( pathToFileURL( built( id ) ).href );
      await page.waitForFunction( () => { const s = window.phet && phet.joist && phet.joist.sim; return s && !document.querySelector( '[id*="splash"]' ); }, null, { timeout: 60000 } );
      await page.waitForTimeout( 500 );
      const { ko, locale, names } = await page.evaluate( () => {
        const out = [ document.title ];
        for ( const e of document.querySelectorAll( '[aria-label], [title], button, [role="button"], h1, h2, h3, label' ) ) {
          for ( const v of [ e.getAttribute( 'aria-label' ), e.getAttribute( 'title' ), e.matches( 'button, [role="button"], h1, h2, h3, label' ) ? e.textContent : null ] ) {
            if ( v && v.trim() ) { out.push( v.trim() ); }
          }
        }
        return { ko: phet.chipper.strings.ko, locale: phet.chipper.locale, names: out };
      } );
      assert.equal( locale, 'ko' );
      const fixes = ( await loadTermFixes() ).global;
      let checked = 0;
      const wrong = [];
      for ( const t of tables ) {
        const prefix = `${t.repo.toUpperCase().replace( /-/g, '_' )}/`;
        for ( const s of t.strings ) {
          const key = prefix + s.key;
          if ( !( key in ko ) ) { continue; }
          checked++;
          const want = applyFixesToValue( s.value, fixes );
          if ( strip( ko[ key ] ) !== want ) { wrong.push( `${key}: built ${JSON.stringify( strip( ko[ key ] ) )}, pinned ${JSON.stringify( want )}` ); }
        }
      }
      assert.ok( checked >= 50, `only ${checked} common strings with a pinned Korean translation were found in the bundle` );
      assert.deepEqual( wrong, [] );
      const english = names.map( strip ).filter( n => ( n.match( /[A-Za-zμ]+/g ) || [] ).some( w => !ALLOWED.test( w ) ) );
      assert.deepEqual( english, [], 'accessible names must be Korean' );
    }
    finally { await page.close(); }
  } );
}
