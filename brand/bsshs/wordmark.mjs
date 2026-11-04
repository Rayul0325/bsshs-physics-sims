// The 「부산과학고」 wordmark, rendered from TEXT (no emblem, no copied logo):
//   - navbar logo PNGs (on a white and on a black navigation bar), drawn on a canvas in headless
//     Chrome with the token Korean font stack, 96 px high like PhET's logo images (joist scales any
//     logo to the PhET logo height, so only the height matters);
//   - the splash SVG, a <text> element (the device's Korean font draws it).
// Colors and fonts come from theme/tokens.json. PNGs are cached under $BSSHS_CACHE/bsshs-wordmark/
// by a hash of their inputs, so parallel builds render them once.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { WORDMARK } from './attribution.mjs';
import { fontStack, toPhetColors } from '../../theme/index.mjs';
import { cacheDir } from '../../tools/lib/paths.mjs';

// Image geometry mirrors PhET's own logo/splash files; the type sizes are design values and come
// from theme/tokens.json (font.sizes.wordmark / font.sizes.splash, px within these boxes).
const LOGO_HEIGHT = 96; // px, same as brand/adapted-from-phet/images/logo.png
const LOGO_PAD_X = 4;
const SPLASH_W = 273; // px, same box as brand/adapted-from-phet/images/splash.svg
const SPLASH_H = 130;
/** @param {any} tokens @param {'wordmark'|'splash'} key */
const sizePx = ( tokens, key ) => Number.parseFloat( tokens.font.sizes[ key ] );
const RENDER_VERSION = 1;

/** @param {string} s */
const xml = s => String( s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( /"/g, '&quot;' );

/**
 * Splash SVG with the wordmark as text.
 * @param {any} tokens
 * @returns {string}
 */
export function splashSvg( tokens ) {
  const c = toPhetColors( tokens );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH_W}" height="${SPLASH_H}" viewBox="0 0 ${SPLASH_W} ${SPLASH_H}">` +
         `<text x="${SPLASH_W / 2}" y="${SPLASH_H / 2}" text-anchor="middle" dominant-baseline="central" ` +
         `font-family="${xml( fontStack( tokens, 'sans' ).replace( /"/g, '\'' ) )}" font-size="${sizePx( tokens, 'splash' )}" ` +
         `font-weight="${xml( tokens.font.wordmarkWeight )}" fill="${xml( c.splashText )}">${xml( WORDMARK )}</text></svg>\n`;
}

/** @param {Buffer} b */
export const sha256 = b => createHash( 'sha256' ).update( b ).digest( 'hex' );

let memo = null;

/**
 * Renders (or loads from cache) the wordmark PNGs and the splash SVG.
 * @param {any} tokens
 * @returns {Promise<{ onWhite: Buffer, onBlack: Buffer, splashSvg: string, sha256: string[] }>}
 */
export function renderWordmark( tokens ) {
  const c = toPhetColors( tokens );
  const spec = { v: RENDER_VERSION, text: WORDMARK, font: fontStack( tokens, 'sans' ), weight: String( tokens.font.wordmarkWeight ),
                 onWhite: c.wordmarkOnWhite, onBlack: c.wordmarkOnBlack, h: LOGO_HEIGHT, px: sizePx( tokens, 'wordmark' ), pad: LOGO_PAD_X };
  const key = createHash( 'sha256' ).update( JSON.stringify( spec ) ).digest( 'hex' ).slice( 0, 16 );
  if ( memo && memo.key === key ) { return memo.promise; }
  const promise = ( async () => {
    const dir = path.join( cacheDir(), 'bsshs-wordmark' );
    const files = { onWhite: path.join( dir, `${key}-on-white.png` ), onBlack: path.join( dir, `${key}-on-black.png` ) };
    if ( !existsSync( files.onWhite ) || !existsSync( files.onBlack ) ) {
      const pngs = await renderPngs( spec );
      await mkdir( dir, { recursive: true } );
      for ( const k of [ 'onWhite', 'onBlack' ] ) {
        const tmp = `${files[ k ]}.tmp-${process.pid}`;
        await writeFile( tmp, pngs[ k ] );
        await rename( tmp, files[ k ] );
      }
    }
    const onWhite = await readFile( files.onWhite );
    const onBlack = await readFile( files.onBlack );
    return { onWhite, onBlack, splashSvg: splashSvg( tokens ), sha256: [ sha256( onWhite ), sha256( onBlack ) ] };
  } )();
  memo = { key, promise };
  promise.catch( () => { if ( memo && memo.promise === promise ) { memo = null; } } );
  return promise;
}

/**
 * Draws the wordmark on a canvas in headless Chrome (installed Google Chrome, via Playwright).
 * @param {object} spec
 * @returns {Promise<{ onWhite: Buffer, onBlack: Buffer }>}
 */
async function renderPngs( spec ) {
  const { chromium } = await import( 'playwright' );
  const browser = await chromium.launch( { channel: 'chrome', headless: true } );
  try {
    const page = await browser.newPage();
    await page.setContent( '<!DOCTYPE html><html lang="ko"><body></body></html>' );
    const out = await page.evaluate( s => {
      const draw = color => {
        const c = document.createElement( 'canvas' );
        const ctx = c.getContext( '2d' );
        const font = `${s.weight} ${s.px}px ${s.font}`;
        ctx.font = font;
        const m = ctx.measureText( s.text );
        c.width = Math.ceil( m.actualBoundingBoxLeft + m.actualBoundingBoxRight ) + 2 * s.pad;
        c.height = s.h;
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = 'alphabetic';
        const glyphH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        ctx.fillText( s.text, s.pad + m.actualBoundingBoxLeft, ( s.h - glyphH ) / 2 + m.actualBoundingBoxAscent );
        return c.toDataURL( 'image/png' ).split( ',' )[ 1 ];
      };
      return { onWhite: draw( s.onWhite ), onBlack: draw( s.onBlack ) };
    }, spec );
    return { onWhite: Buffer.from( out.onWhite, 'base64' ), onBlack: Buffer.from( out.onBlack, 'base64' ) };
  }
  finally {
    await browser.close();
  }
}
