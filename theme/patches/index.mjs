// Registry of every allowed slot-checkout patch (invariant 9: theme, brand, outbound-traffic-off only;
// Korean string fixes live elsewhere). Rules are data (engine.mjs PatchRule), applied in the
// throwaway slot checkout at build time and reverted afterwards, like the build-config overlays.
import { THEME_RULES } from './theme.mjs';
import { TELEMETRY_RULES } from './telemetry.mjs';
import { BRAND_RULES } from '../../brand/bsshs/patches.mjs';
import { toPhetTheme, tokensHash } from '../index.mjs';
import { brandFields } from '../../brand/bsshs/attribution.mjs';

/** Every rule, in application order. */
export const ALL_RULES = Object.freeze( [ ...TELEMETRY_RULES, ...BRAND_RULES, ...THEME_RULES ] );

/**
 * Rules for a build variant: `--brand bsshs` = brand + outbound-traffic-off, `--theme` = theme.
 * @param {{ brand: string, theme: boolean }} opts
 * @returns {import('./engine.mjs').PatchRule[]}
 */
export function rulesFor( { brand, theme } ) {
  return ALL_RULES.filter( r => ( r.kind === 'theme' ? theme : brand === 'bsshs' ) );
}

/**
 * Values the rules need. The wordmark images are rendered from text by brand/bsshs/wordmark.mjs.
 * @param {any} tokens
 * @param {{ brand: string, theme: boolean }} opts
 * @param {{ onWhite: Buffer, onBlack: Buffer, splashSvg: string }|null} wordmark
 * @returns {object}
 */
export function patchContext( tokens, opts, wordmark ) {
  return {
    phet: toPhetTheme( tokens ),
    brand: opts.brand === 'bsshs' ? {
      fields: brandFields(),
      logoOnWhitePng: wordmark.onWhite,
      logoOnBlackPng: wordmark.onBlack,
      splashSvg: wordmark.splashSvg
    } : null
  };
}

/**
 * Hash identifying what a variant build injects (tokens + rule set), for resume decisions.
 * @param {any} tokens
 * @param {{ brand: string, theme: boolean }} opts
 * @returns {string}
 */
export function variantHash( tokens, opts ) {
  const rules = rulesFor( opts ).map( r => `${r.id}:${r.files.join( ',' )}:${( r.edits || [] ).map( e => String( e.find ) ).join( '|' )}` );
  return tokensHash( { tokens, rules, brand: opts.brand, theme: opts.theme, fields: opts.brand === 'bsshs' ? brandFields() : null } );
}
