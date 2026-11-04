// Graph canvas text layout: every text box the graph draws (title, axis labels, tick labels, legend, the
// linear-fit lines) lies inside the canvas and overlaps no other text box, at 390, 1280 and 1600 wide.
// Runs every graph of every exam-scope drawer.json (their real titles and axis labels) plus the free graph,
// on the fixture page with seeded log rows (long numbers on purpose), and the PNG export once.
// Boxes come from measureText() (actual bounding box) through the canvas transform (rotated y label too).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FIX, ROOT, injectTo, fileUrl, contextOptions, launch } from './helpers.mjs';

const SRC = path.join( FIX, 'fake-sim.html' );
const EXAM = JSON.parse( readFileSync( path.join( ROOT, 'data/exam-scope.json' ), 'utf8' ) ).ids;
let browser;
before( async () => { browser = await launch(); } );
after( async () => { await browser?.close(); } );

/** Seeded rows: four records, every measurement with an awkward magnitude, all x distinct. */
function seedRows( dj ) {
  const bases = [ 6.62607e14, 1.23456e-4, 523.789, -2.5e-19, 98765.4, 0.0313 ];
  const rows = [];
  for ( let i = 0; i < 4; i++ ) {
    const values = {};
    dj.measurements.forEach( ( m, k ) => { values[ m.key ] = bases[ k % bases.length ] * ( 1 + i * 0.37 ) + ( i % 2 ? 1e-3 * bases[ k % bases.length ] : 0 ); } );
    rows.push( { time: `2026-11-0${i + 1}T10:00:00.000Z`, screen: '화면', values } );
  }
  return rows;
}

/** In-page: draws `graphId` in the visible canvas (or the PNG export) and returns every text box. */
async function boxesOf( { graphId, png } ) {
  const out = [];
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function( t, x, y, ...r ) {
    if ( png ? !this.canvas.isConnected : this.canvas.isConnected ) {
      const m = this.measureText( t );
      const T = this.getTransform();
      const xs = [ x - m.actualBoundingBoxLeft, x + m.actualBoundingBoxRight ];
      const ys = [ y - m.actualBoundingBoxAscent, y + m.actualBoundingBoxDescent ];
      const pts = xs.flatMap( px => ys.map( py => [ T.a * px + T.c * py + T.e, T.b * px + T.d * py + T.f ] ) );
      out.push( { t: String( t ), x0: Math.min( ...pts.map( p => p[ 0 ] ) ), x1: Math.max( ...pts.map( p => p[ 0 ] ) ),
                  y0: Math.min( ...pts.map( p => p[ 1 ] ) ), y1: Math.max( ...pts.map( p => p[ 1 ] ) ), W: this.canvas.width, H: this.canvas.height } );
    }
    return orig.call( this, t, x, y, ...r );
  };
  try {
    if ( png ) { await bsshsDrawer.exportPng( graphId ); }
    else {
      const root = document.getElementById( 'bsshs-drawer-host' ).shadowRoot;
      const sel = root.querySelector( '[data-ctl="graph"]' );
      sel.value = graphId;
      sel.dispatchEvent( new Event( 'change' ) );
    }
  }
  finally { CanvasRenderingContext2D.prototype.fillText = orig; }
  return out;
}

/** Problems: boxes outside the canvas or overlapping each other (device px, 0.5 px slack). */
function problems( boxes ) {
  const e = [];
  const s = 0.5;
  for ( const b of boxes ) {
    if ( b.x0 < -s || b.y0 < -s || b.x1 > b.W + s || b.y1 > b.H + s ) {
      e.push( `clipped: ${JSON.stringify( b.t )} [${b.x0.toFixed( 1 )},${b.y0.toFixed( 1 )} – ${b.x1.toFixed( 1 )},${b.y1.toFixed( 1 )}] in ${b.W}×${b.H}` );
    }
  }
  for ( let i = 0; i < boxes.length; i++ ) {
    for ( let j = i + 1; j < boxes.length; j++ ) {
      const a = boxes[ i ], b = boxes[ j ];
      if ( Math.min( a.x1, b.x1 ) - Math.max( a.x0, b.x0 ) > s && Math.min( a.y1, b.y1 ) - Math.max( a.y0, b.y0 ) > s ) {
        e.push( `overlap: ${JSON.stringify( a.t )} × ${JSON.stringify( b.t )}` );
      }
    }
  }
  return e;
}

for ( const width of [ 390, 1280, 1600 ] ) {
  test( `graph text is neither clipped nor overlapping at ${width} (all exam graphs + free graph)`, { timeout: 300000 }, async () => {
    const all = [];
    for ( const id of EXAM ) {
      const adapterDir = path.join( ROOT, 'adapters', id );
      const dj = JSON.parse( readFileSync( path.join( adapterDir, 'drawer.json' ), 'utf8' ) );
      const file = injectTo( SRC, `graph-text-${id}.html`, { id, repoRoot: ROOT, adapterDir } );
      const context = await browser.newContext( contextOptions( width ) );
      const page = await context.newPage();
      try {
        await page.addInitScript( ( [ key, log ] ) => { localStorage.setItem( key, JSON.stringify( log ) ); },
          [ `bsshs:log:${id}:v${dj.schemaVersion}`, { simId: id, version: dj.schemaVersion, measurements: dj.measurements, rows: seedRows( dj ) } ] );
        await page.goto( fileUrl( file ) );
        await page.waitForFunction( () => window.bsshsDrawer && window.bsshsDrawer.mounted, null, { timeout: 30000 } );
        assert.equal( ( await page.evaluate( () => bsshsDrawer.rows() ) ).length, 4 );
        await page.evaluate( () => bsshsDrawer.open( 'graphs' ) );
        for ( const g of [ ...dj.graphs.map( x => x.id ), 'free' ] ) {
          const boxes = await page.evaluate( boxesOf, { graphId: g, png: false } );
          assert.ok( boxes.length >= 6, `${id}/${g}: drew ${boxes.length} texts` );
          if ( g !== 'free' && dj.graphs.find( x => x.id === g ).fit ) {
            assert.ok( boxes.some( b => /기울기/.test( b.t ) ), `${id}/${g}: fit text drawn` );
          }
          all.push( ...problems( boxes ).map( p => `${id}/${g}: ${p}` ) );
        }
        if ( width === 1280 ) {
          for ( const g of dj.graphs.map( x => x.id ) ) {
            all.push( ...problems( await page.evaluate( boxesOf, { graphId: g, png: true } ) ).map( p => `${id}/${g} PNG: ${p}` ) );
          }
        }
      }
      finally { await context.close(); }
    }
    assert.deepEqual( all, [] );
  } );
}
