// The drawn pictures under theme/art/: every SVG states its pixel size, uses only token placeholders and no color
// value, and every map entry points at an existing SVG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadTokens, resolveSvgPlaceholders, svgPlaceholders } from '../../theme/index.mjs';
import { ART_DIR, loadArtMap, svgSize } from '../../theme/patches/art.mjs';

const tokens = loadTokens();
const svgs = ( dir = ART_DIR ) => readdirSync( dir ).flatMap( f => {
  const p = path.join( dir, f );
  return statSync( p ).isDirectory() ? svgs( p ) : f.endsWith( '.svg' ) ? [ p ] : [];
} );

test( 'every drawn SVG has a pixel size, token placeholders only, and resolves', () => {
  const files = svgs();
  assert.ok( files.length >= 30, `${files.length} pictures` );
  for ( const f of files ) {
    const text = readFileSync( f, 'utf8' );
    assert.ok( svgSize( text ).w > 0, f );
    assert.ok( !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test( text ), `${f} writes a color value` );
    assert.ok( svgPlaceholders( text ).length > 0, `${f} uses no token` );
    assert.ok( !/\{\{/.test( resolveSvgPlaceholders( text, tokens ) ), f );
    assert.ok( !/PhET/i.test( text.replace( /<!--[\s\S]*?-->/g, '' ) ), `${f} carries PhET lettering` );
  }
} );

test( 'map.json is valid, each picture is mapped once and every map entry has its SVG', () => {
  const { entries } = loadArtMap();
  const used = entries.filter( e => e.svg ).map( e => e.svg );
  assert.equal( new Set( used ).size, used.length, 'an SVG serves one entry' );
  const files = svgs().map( f => path.relative( ART_DIR, f ) );
  for ( const f of files ) { assert.ok( used.includes( f ), `${f} is not mapped` ); }
} );
