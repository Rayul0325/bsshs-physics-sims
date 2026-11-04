// Post-build injection into a sim's single-file HTML (the built file, never the PhET sources):
//   - brand markers the checker reads (<meta name="bsshs-brand">, wordmark image hashes)
//   - with --theme: the token CSS variables, the embedded font faces as data: URIs (same file, so no
//     request leaves the page) together with their SIL OFL texts, and a tiny script that starts
//     loading those faces before the sim measures any text.
// The block goes right after <meta charset> so the charset declaration stays in the first 1024 bytes.
import { readFileSync } from 'node:fs';
import { toCssVariables, fontFaces, tokensHash } from './index.mjs';

export const INJECT_MARKER_START = '<!-- bsshs:begin';
const INJECT_MARKER_END = '<!-- bsshs:end -->';
const BLOCK_RE = /\n<!-- bsshs:begin[\s\S]*?<!-- bsshs:end -->/;
const CHARSET_RE = /<meta charset=["']?utf-8["']?\s*\/?>/i;

/** @param {string} s */
const cssComment = s => `/*\n${String( s ).replace( /\*\//g, '* /' )}\n*/`;
/** @param {string} s */
const attr = s => String( s ).replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' ).replace( /</g, '&lt;' );

/**
 * @param {any} tokens
 * @returns {string} CSS with @font-face rules (data: URIs) for the faces embedded in sims, plus licenses
 */
export function fontFaceCss( tokens ) {
  const faces = fontFaces( tokens, { simsOnly: true } );
  const licenses = [ ...new Set( faces.map( f => f.license ) ) ].map( f => cssComment( readFileSync( f, 'utf8' ) ) );
  const rules = faces.map( f => `@font-face {\n  font-family: ${JSON.stringify( f.family )};\n` +
    `  src: url(data:font/woff2;base64,${readFileSync( f.file ).toString( 'base64' )}) format("woff2");\n` +
    `  font-weight: ${f.weight};\n  font-style: ${f.style};\n  font-display: block;\n}` );
  return [ ...licenses, ...rules ].join( '\n' );
}

/**
 * Script that starts loading the embedded faces at parse time and records the outcome in
 * window.bsshsFonts (read by tools/check-sim.mjs).
 * @param {any} tokens
 * @returns {string}
 */
function fontLoaderScript( tokens ) {
  const families = [ ...new Set( fontFaces( tokens, { simsOnly: true } ).map( f => f.family ) ) ];
  return `(function(){var fams=${JSON.stringify( families )};var s=window.bsshsFonts={families:fams,loaded:false,readyBeforeSim:null};` +
         'var d=document;if(!d.fonts||!d.fonts.load){return;}' +
         'Promise.all(fams.map(function(f){return d.fonts.load(\'16px "\'+f+\'"\');})).then(function(r){' +
         's.loaded=r.every(function(x){return x.length>0;});s.readyBeforeSim=!(window.phet&&window.phet.joist&&window.phet.joist.sim);' +
         '},function(e){s.error=String(e);});})();';
}

/**
 * Inserts (or replaces) the bsshs block. Returns the html unchanged when neither option is set.
 * @param {string} html
 * @param {{ tokens: any, theme: boolean, brand: { wordmarkSha256: string[], wordmarkPng?: string[] }|null }} opts
 * @returns {string}
 */
export function injectIntoHtml( html, { tokens, theme, brand } ) {
  if ( !theme && !brand ) { return html; }
  const clean = html.replace( BLOCK_RE, '' );
  const m = CHARSET_RE.exec( clean );
  if ( !m ) { throw new Error( 'inject: no <meta charset="utf-8"> in the built html' ); }
  const parts = [ `${INJECT_MARKER_START} generated at build time from theme/tokens.json and brand/bsshs; do not edit -->` ];
  if ( brand ) {
    parts.push( '<meta name="bsshs-brand" content="bsshs">' );
    parts.push( `<meta name="bsshs-wordmark-sha256" content="${attr( brand.wordmarkSha256.join( ',' ) )}">` );
    if ( brand.wordmarkPng ) {
      // The expected wordmark pixels: old (RequireJS) families re-encode logos into mipmaps, so the
      // checker compares pixels, not bytes.
      parts.push( `<meta name="bsshs-wordmark-png" content="${attr( brand.wordmarkPng.join( ',' ) )}">` );
    }
  }
  if ( theme ) {
    parts.push( `<meta name="bsshs-theme" content="${tokensHash( tokens )}">` );
    parts.push( `<style id="bsshs-theme">\n${fontFaceCss( tokens )}\n${toCssVariables( tokens )}</style>` );
    parts.push( `<script id="bsshs-fonts">${fontLoaderScript( tokens )}</script>` );
  }
  parts.push( INJECT_MARKER_END );
  const at = m.index + m[ 0 ].length;
  return `${clean.slice( 0, at )}\n${parts.join( '\n' )}${clean.slice( at )}`;
}
