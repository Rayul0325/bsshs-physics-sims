// V10b for the per-sim patch kinds. Guard (a), second layer: the allow-list forbids model paths whatever the kind
// (the rule builder refuses them too, tests/theme/sim-color.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATCH_ALLOWLIST, PATCH_DENY, isAllowed, checkPatchAllowlist, parsePatchLine } from '../../tools/lib/verify-core.mjs';

test( 'sim-color may edit js/ sources of a sim\'s own or shared repos, not model paths, not build tools', () => {
  assert.ok( isAllowed( 'sim-color', 'faradays-law', 'js/faradays-law/view/MagnetNode.js' ) );
  assert.ok( isAllowed( 'sim-color', 'circuit-construction-kit-common', 'js/view/CCKCConstants.ts' ) );
  assert.ok( !isAllowed( 'sim-color', 'chipper', 'js/grunt/Gruntfile.js' ) );
  assert.ok( !isAllowed( 'sim-color', 'babel', 'js/x.js' ) );
  assert.ok( !isAllowed( 'sim-color', 'faradays-law', 'package.json' ) );
  assert.ok( !isAllowed( 'sim-color', 'faradays-law', 'images/a.png' ) );
} );

test( 'art may replace pictures, their generated modules and the license record, nothing else', () => {
  for ( const f of [ 'images/eraser.png', 'images/eraser_png.js', 'images/eraser_png.ts', 'mipmaps/lightBulbBase_png.ts', 'images/license.json', 'phet/images/a.png' ] ) {
    assert.ok( isAllowed( 'art', 'scenery-phet', f ), f );
  }
  for ( const f of [ 'images/a.svg', 'images/a.jpg', 'js/Panel.js', 'images/model/a.png', 'sounds/a.mp3' ] ) { assert.ok( !isAllowed( 'art', 'scenery-phet', f ), f ); }
  assert.ok( !isAllowed( 'art', 'brand', 'adapted-from-phet/images/logo.png' ), 'the brand folder is the brand kind\'s' );
} );

test( 'guard (a3): the allow-list denies model paths for every kind (real paths), and only model paths', () => {
  assert.ok( PATCH_DENY.length >= 1 );
  assert.ok( !isAllowed( 'sim-color', 'faradays-law', 'js/common/model/X.js' ), 'real model path' );
  assert.ok( !isAllowed( 'sim-color', 'faradays-law', 'js/faradays-law/model/FaradaysLawModel.js' ) );
  for ( const kind of Object.keys( PATCH_ALLOWLIST ) ) { assert.ok( !isAllowed( kind, 'joist', 'js/model/Anything.js' ), kind ); }
  assert.ok( isAllowed( 'theme', 'sun', 'js/Panel.js' ), 'existing rules still pass' );
  assert.ok( isAllowed( 'sim-color', 'faradays-law', 'js/faradays-law/view/ModelNode.js' ), 'a file merely called ModelNode is not a model path' );
} );

test( 'checkPatchAllowlist: a sim-color rule or a record line that reaches a build-tool file fails', () => {
  const rules = [
    { id: 'simcolor-demo-1', kind: 'sim-color', repo: 'demo', files: [ 'js/view/A.js' ] },
    { id: 'simcolor-demo-2', kind: 'sim-color', repo: 'chipper', files: [ 'js/grunt/B.js' ] },
    { id: 'art-x-png', kind: 'art', repo: 'scenery-phet', files: [ 'images/x.png' ] }
  ];
  const records = [ { id: 'demo', success: true, patches: [ 'simcolor-demo-1: applied (js/view/A.js: replaced)', 'art-x-png: applied (images/x.png: replaced)', 'simcolor-demo-2: applied (js/grunt/B.js: replaced)' ], overlays: [], trackedChangesAfterBuild: [] } ];
  const r = checkPatchAllowlist( { rules, records } );
  assert.equal( r.passed, 0 );
  assert.deepEqual( r.failures.map( f => f.id ).sort(), [ 'demo', 'simcolor-demo-2' ] );
  assert.ok( r.failures.every( f => /js\/grunt\/B\.js/.test( f.reason ) ) );
  const ok = checkPatchAllowlist( { rules: rules.filter( x => x.id !== 'simcolor-demo-2' ), records: [ { ...records[ 0 ], patches: records[ 0 ].patches.slice( 0, 2 ) } ] } );
  assert.equal( ok.passed, 1 );
  assert.deepEqual( ok.failures, [] );
  assert.deepEqual( parsePatchLine( 'art-scenery-phet-images-x-png-ab12cd-license: applied (images/license.json: replaced)' ).written, [ 'images/license.json' ] );
} );
