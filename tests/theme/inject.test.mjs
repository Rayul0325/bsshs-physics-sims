// Post-build HTML injection: placement after <meta charset>, inline fonts (no URLs), markers, idempotence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTokens, fontFaces } from '../../theme/index.mjs';
import { injectIntoHtml, INJECT_MARKER_START } from '../../theme/inject.mjs';

const tokens = loadTokens();
const HTML = '<!DOCTYPE HTML>\n<html lang="ko">\n<head>\n  <meta charset="utf-8"/>\n  <title>x</title>\n<script>sim()</script>\n</head><body></body></html>';

test( 'theme injection goes right after <meta charset> and before the first script', () => {
  const out = injectIntoHtml( HTML, { tokens, theme: true, brand: { wordmarkSha256: [ 'a'.repeat( 64 ) ], wordmarkPng: [ 'iVBOR', 'iVBOS' ] } } );
  assert.match( out, /<meta name="bsshs-wordmark-png" content="iVBOR,iVBOS">/ );
  const iCharset = out.indexOf( '<meta charset="utf-8"/>' );
  const iBlock = out.indexOf( INJECT_MARKER_START );
  assert.ok( iCharset >= 0 && iBlock > iCharset && iBlock < out.indexOf( '<script>sim()' ) );
  assert.ok( out.indexOf( INJECT_MARKER_START ) < 1024 || out.indexOf( '<meta charset' ) < 1024, 'charset stays in the first 1024 bytes' );
  assert.match( out, /<meta name="bsshs-brand" content="bsshs">/ );
  assert.match( out, /<meta name="bsshs-wordmark-sha256" content="a{64}">/ );
  assert.match( out, /--bsshs-color-accent:/ );
} );

test( 'fonts are inlined as data: URIs with their OFL text, never fetched from a URL', () => {
  const out = injectIntoHtml( HTML, { tokens, theme: true, brand: null } );
  const faces = fontFaces( tokens, { simsOnly: true } );
  for ( const f of faces ) {
    const b64 = readFileSync( f.file ).toString( 'base64' );
    assert.ok( out.includes( `url(data:font/woff2;base64,${b64})` ), f.family );
  }
  assert.match( out, /SIL OPEN FONT LICENSE Version 1\.1/ );
  const block = out.slice( out.indexOf( INJECT_MARKER_START ), out.indexOf( '<title>' ) );
  assert.doesNotMatch( block.replace( /\/\*[\s\S]*?\*\//g, '' ), /url\(\s*['"]?https?:/ );
} );

test( 'brand-only injection adds markers but no fonts; no options = unchanged html', () => {
  const out = injectIntoHtml( HTML, { tokens, theme: false, brand: { wordmarkSha256: [ 'b'.repeat( 64 ) ] } } );
  assert.match( out, /bsshs-wordmark-sha256/ );
  assert.doesNotMatch( out, /@font-face/ );
  assert.equal( injectIntoHtml( HTML, { tokens, theme: false, brand: null } ), HTML );
} );

test( 'injection is idempotent and refuses html without a charset meta', () => {
  const once = injectIntoHtml( HTML, { tokens, theme: true, brand: { wordmarkSha256: [ 'c'.repeat( 64 ) ] } } );
  assert.equal( injectIntoHtml( once, { tokens, theme: true, brand: { wordmarkSha256: [ 'c'.repeat( 64 ) ] } } ), once );
  assert.throws( () => injectIntoHtml( '<html><head></head></html>', { tokens, theme: true, brand: null } ), /charset/ );
} );
