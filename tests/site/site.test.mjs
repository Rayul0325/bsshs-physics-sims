// Catalogue model and HTML (spec 3.7): exam scope first, class units in order, 기타 last, badges, attribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueModel, indexHtml, titleFromHtml, siteCss, esc } from '../../site/build-site.mjs';
import { loadTokens } from '../../theme/index.mjs';
import { ATTRIBUTION, REPO_URL } from '../../brand/bsshs/attribution.mjs';

const units = { units: [
  { id: 'b', name: '나중 단원', order: 2, sims: [ 'p2' ] },
  { id: 'a', name: '먼저 단원', order: 1, sims: [ 'p1', 'n1' ] },
  { id: 'etc', name: '기타', order: 9, sims: [ 'p3' ] }
] };
const exam = { exam: '기말', ids: [ 'p1', 'n1' ] };
const status = { p1: { state: '확인 중', label: '선생님 확인 중' }, n1: { state: '확인 완료', label: '선생님 확인 완료' } };
const model = catalogueModel( { ids: [ 'p1', 'p2', 'p3', 'n1' ], titles: { p1: '하나', n1: '새것' }, units, exam, status, originals: new Set( [ 'n1' ] ), thumbs: new Set( [ 'p1' ] ) } );

test( 'exam section first, units in order, 기타 last; every available sim appears in a unit', () => {
  assert.deepEqual( model.map( s => s.id ), [ 'exam', 'a', 'b', 'etc' ] );
  assert.deepEqual( model[ 0 ].cards.map( c => c.id ), [ 'p1', 'n1' ] );
  assert.ok( model[ 0 ].cards.every( c => c.exam && c.status ) );
  assert.equal( model.find( s => s.id === 'b' ).cards[ 0 ].status, null );
  assert.equal( model[ 0 ].cards[ 0 ].thumb, 'thumbs/p1.png' );
  assert.equal( model[ 0 ].cards[ 1 ].thumb, null );
} );

test( 'missing builds are left out instead of linking to nothing', () => {
  const m = catalogueModel( { ids: [ 'p2' ], titles: {}, units, exam, status, originals: new Set(), thumbs: new Set() } );
  assert.equal( m[ 0 ].cards.length, 0 );
  assert.deepEqual( m.slice( 1 ).map( s => s.id ), [ 'b' ] );
} );

test( 'index.html: badges, attribution, not-official line, repo link, Korean lang, no teacher wording', () => {
  const html = indexHtml( model, loadTokens(), 4 );
  assert.match( html, /<html lang="ko">/ );
  assert.match( html, /badge pending">선생님 확인 중</ );
  assert.match( html, /badge approved">선생님 확인 완료</ );
  for ( const s of [ ATTRIBUTION.phetCredit, ATTRIBUTION.originalKo, ATTRIBUTION.modifiedBy, ATTRIBUTION.notOfficial ] ) { assert.ok( html.includes( esc( s ) ), s ); }
  assert.ok( html.includes( `href="${REPO_URL}"` ) );
  assert.doesNotMatch( html, /https?:\/\/(?!github\.com\/Rayul0325|phet\.colorado\.edu)/ ); // no other URLs (no CDN)
} );

test( 'stylesheet fills token breakpoints and leaves no placeholder', () => {
  const css = siteCss( loadTokens() );
  assert.doesNotMatch( css, /__BREAKPOINT_/ );
  assert.match( css, /--site-card-min:/ );
  assert.match( css, /--bsshs-size-touch-target:/ );
} );

test( 'title from a built sim strips bidi marks and decodes entities', () => {
  assert.equal( titleFromHtml( '<title>&#8234;&#47112;&#51060;&#51200;&#8236;</title>' ), '레이저' );
  assert.equal( titleFromHtml( '<p>none</p>' ), null );
} );
