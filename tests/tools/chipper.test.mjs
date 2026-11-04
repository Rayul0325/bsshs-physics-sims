// Tests for chipper-generation detection, grunt arguments and output paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipperGeneration, gruntArgs, builtHtmlRelPath } from '../../tools/lib/chipper.mjs';

test( 'chipperGeneration distinguishes chipper 0.0.0 from 2.x/3.x', () => {
  assert.equal( chipperGeneration( '0.0.0' ), 0 );
  assert.equal( chipperGeneration( '2.0.0' ), 2 );
  assert.equal( chipperGeneration( '3.0.0' ), 2 );
  assert.throws( () => chipperGeneration( '1.0.0' ), /unsupported/i );
  assert.throws( () => chipperGeneration( 'x' ), /unsupported/i );
} );

test( 'gruntArgs for chipper 0.0.0 uses the singular --brand flag', () => {
  assert.deepEqual( gruntArgs( 0, { brand: 'adapted-from-phet', locale: 'ko' } ),
    [ 'build', '--brand=adapted-from-phet', '--locales=ko', '--lint=false' ] );
} );

test( 'gruntArgs for chipper 2 uses --brands and can disable type-check', () => {
  assert.deepEqual( gruntArgs( 2, { brand: 'adapted-from-phet', locale: 'ko' } ),
    [ 'build', '--brands=adapted-from-phet', '--locales=ko', '--lint=false' ] );
  assert.deepEqual( gruntArgs( 2, { brand: 'adapted-from-phet', locale: 'ko', typeCheck: false } ),
    [ 'build', '--brands=adapted-from-phet', '--locales=ko', '--lint=false', '--type-check=false' ] );
} );

test( 'builtHtmlRelPath follows each chipper generation layout', () => {
  assert.equal( builtHtmlRelPath( 0, 'pendulum-lab', 'adapted-from-phet', 'ko' ), 'build/pendulum-lab_ko.html' );
  assert.equal( builtHtmlRelPath( 2, 'gravity-and-orbits', 'adapted-from-phet', 'ko' ),
    'build/adapted-from-phet/gravity-and-orbits_ko_adapted-from-phet.html' );
} );
