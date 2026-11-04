// Pure parts of tools/check-sim.mjs: the "no PhET name outside the About attribution" rule, request
// classification and attribution matching. (The browser part runs in the real gate, see docs/theme.md.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phetMentions, classifyRequest, missingAttribution, parseCheckArgs } from '../../tools/check-sim.mjs';
import { ATTRIBUTION, REQUIRED_ABOUT_STRINGS } from '../../brand/bsshs/attribution.mjs';

test( 'phetMentions flags accessible names and PDOM text that name PhET', () => {
  const hits = phetMentions( [
    { where: 'dom-text <button>', text: '‪PhET Menu‬' },
    { where: 'scenery innerContent', text: 'PhET Menu' },
    { where: 'dom @aria-label <div>', text: 'PhET' },
    { where: 'dom-text <p>', text: '부산과학고 메뉴' }
  ] );
  assert.deepEqual( hits.map( h => h.where ), [ 'dom-text <button>', 'scenery innerContent', 'dom @aria-label <div>' ] );
  assert.equal( hits[ 0 ].text, 'PhET Menu', 'bidi marks stripped' );
} );

test( 'phetMentions allows the About attribution, whole or wrapped, but not text hidden next to it', () => {
  const ok = phetMentions( [
    ...REQUIRED_ABOUT_STRINGS.map( text => ( { where: 'dom-text <text>', text } ) ),
    { where: 'dom-text <text>', text: 'Simulation by PhET Interactive Simulations, University of Colorado Boulder' },
    { where: 'dom-text <text>', text: `${ATTRIBUTION.originalKo}<br>${ATTRIBUTION.licenses}` }
  ] );
  assert.deepEqual( ok, [] );
  const bad = phetMentions( [ { where: 'dom-text <text>', text: `${ATTRIBUTION.originalKo} · PhET Website` } ] );
  assert.equal( bad.length, 1 );
  assert.equal( phetMentions( [ { where: 'x', text: 'PhET' } ] ).length, 1, 'a short fragment is not an attribution line' );
} );

test( 'classifyRequest: file pages allow only local/file URLs; http pages compare origins', () => {
  const file = 'file:///x/sim.html';
  assert.equal( classifyRequest( 'data:image/png;base64,AA', file ), 'local' );
  assert.equal( classifyRequest( 'file:///x/sim.html', file ), 'same-origin' );
  assert.equal( classifyRequest( 'https://phet.colorado.edu/yotta/immediate.gif', file ), 'external' );
  assert.equal( classifyRequest( 'https://site.example/a.woff2', 'https://site.example/sims/a.html' ), 'same-origin' );
  assert.equal( classifyRequest( 'https://cdn.example/a.woff2', 'https://site.example/sims/a.html' ), 'external' );
} );

test( 'missingAttribution ignores whitespace and bidi marks; parseCheckArgs reads the flags', () => {
  assert.deepEqual( missingAttribution( REQUIRED_ABOUT_STRINGS.map( s => `‪${s.replace( / /g, '  ' )}‬` ) ), [] );
  assert.equal( missingAttribution( [] ).length, 6 );
  const o = parseCheckArgs( [ 'a.html', '--width', '390', '--no-about' ] );
  assert.equal( o.width, 390 );
  assert.equal( o.about, false );
  assert.throws( () => parseCheckArgs( [ '--bogus' ] ), /unknown option/ );
} );
