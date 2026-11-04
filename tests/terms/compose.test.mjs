// Two patch rules aimed at the same file must compose (regression: charges-and-fields and under-pressure
// kept 「PhET Menu Button」 because the later rule on joist js/PhetButton.js re-read pristine HEAD and
// overwrote the earlier rule's textDescription rename).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyPatchRules, revertTouched } from '../../theme/patches/engine.mjs';
import { ALL_RULES } from '../../theme/patches/index.mjs';
import { MENU_BUTTON_NAME } from '../../brand/bsshs/patches.mjs';

const git = ( dir, args ) => execFileSync( 'git', [ '-C', dir, ...args ], { encoding: 'utf8' } ).trim();
const rule = id => ALL_RULES.find( r => r.id === id );

test( 'brand-menu-a11y-js and brand-no-adapted-from-text both land in joist js/PhetButton.js', async () => {
  const slot = await mkdtemp( path.join( tmpdir(), 'bsshs-compose-' ) );
  try {
    const joist = path.join( slot, 'joist' );
    await mkdir( path.join( joist, 'js' ), { recursive: true } );
    const original = [
      "      if ( Brand.id === 'adapted-from-phet' ) {",
      '        this.addChild( new AdaptedFromText( options ) );',
      '      }',
      "      textDescription: 'PhET Menu Button',",
      ''
    ].join( '\n' );
    await writeFile( path.join( joist, 'js', 'PhetButton.js' ), original );
    git( joist, [ 'init', '-q' ] );
    git( joist, [ 'add', '.' ] );
    git( joist, [ '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init' ] );

    const touched = [];
    await applyPatchRules( slot, [ rule( 'brand-menu-a11y-js' ), rule( 'brand-no-adapted-from-text' ) ], {}, touched );
    const text = await readFile( path.join( joist, 'js', 'PhetButton.js' ), 'utf8' );
    assert.ok( text.includes( `textDescription: ${JSON.stringify( MENU_BUTTON_NAME )}` ), text );
    assert.ok( text.includes( 'if ( false ) {' ), text );
    assert.doesNotMatch( text, /PhET Menu Button/ );

    // A second call starts from pristine HEAD again (idempotent), and revert restores the checkout.
    await applyPatchRules( slot, [ rule( 'brand-menu-a11y-js' ), rule( 'brand-no-adapted-from-text' ) ], {}, touched );
    assert.equal( await readFile( path.join( joist, 'js', 'PhetButton.js' ), 'utf8' ), text );
    await revertTouched( touched );
    assert.equal( await readFile( path.join( joist, 'js', 'PhetButton.js' ), 'utf8' ), original );
    assert.equal( git( joist, [ 'status', '--porcelain' ] ), '' );
  }
  finally {
    await rm( slot, { recursive: true, force: true } );
  }
} );
