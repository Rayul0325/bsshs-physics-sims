// Registry of every allowed slot-checkout patch (invariant 9: theme, brand, outbound-traffic-off only;
// Korean string fixes live elsewhere). Rules are data (engine.mjs PatchRule), applied in the
// throwaway slot checkout at build time and reverted afterwards, like the build-config overlays.
//
// Two layers: ALL_RULES are global (the same text for every sim); the per-sim rules (color literals from
// theme/sim-styles/<id>.json, pictures from theme/art/map.json) are built by `simRulesFor` for ONE sim and
// ride the theme variant (kind `sim-color` and `art`, see tools/lib/verify-core.mjs PATCH_ALLOWLIST).
import { THEME_RULES } from './theme.mjs';
import { TELEMETRY_RULES } from './telemetry.mjs';
import { BRAND_RULES } from '../../brand/bsshs/patches.mjs';
import { toPhetTheme, toPhetColors, tokensHash } from '../index.mjs';
import { brandFields } from '../../brand/bsshs/attribution.mjs';
import { loadSimStyle, validateSimStyle, styleHashInput, SIM_STYLES_DIR } from '../sim-style.mjs';
import { colorRulesFor } from './sim-color.mjs';
import { prepareArt } from './art.mjs';

/** Every global rule, in application order. */
export const ALL_RULES = Object.freeze( [ ...TELEMETRY_RULES, ...BRAND_RULES, ...THEME_RULES ] );

/**
 * Rules for a build variant: `--brand bsshs` = brand + outbound-traffic-off, `--theme` = theme.
 * With a sim id the sim's own rules (from `simRulesFor`) follow the global ones, theme builds only.
 * @param {{ brand: string, theme: boolean }} opts
 * @param {string|null} [simId]
 * @param {import('./engine.mjs').PatchRule[]} [simRules]
 * @returns {import('./engine.mjs').PatchRule[]}
 */
export function rulesFor( { brand, theme }, simId = null, simRules = [] ) {
  const global = ALL_RULES.filter( r => ( r.kind === 'theme' ? theme : brand === 'bsshs' ) );
  return simId && theme ? [ ...global, ...simRules ] : global;
}

/**
 * Values the rules need. The wordmark images are rendered from text by brand/bsshs/wordmark.mjs.
 * @param {any} tokens
 * @param {{ brand: string, theme: boolean }} opts
 * @param {{ onWhite: Buffer, onBlack: Buffer, splashSvg: string }|null} wordmark
 * @param {string|null} [simId] - the sim being built (per-sim rules read it; global rules ignore it)
 * @returns {object}
 */
export function patchContext( tokens, opts, wordmark, simId = null ) {
  return {
    simId,
    phet: toPhetTheme( tokens ),
    brand: opts.brand === 'bsshs' ? {
      fields: brandFields(),
      logoOnWhitePng: wordmark.onWhite,
      logoOnBlackPng: wordmark.onBlack,
      splashSvg: wordmark.splashSvg
    } : null
  };
}

/** Renderer stand-in for hashing: the hash needs the SVG text, not its pixels. */
const noPixels = async jobs => jobs.map( j => Buffer.alloc( j.w * j.h * 4 ) );

/**
 * The per-sim rules and what the sim's build hash must cover. Throws on an invalid style file, a model path,
 * an unknown token, an art entry without a matching picture size, ...
 * @param {string} simId
 * @param {Record<string, string>} deps - sibling directory -> pinned SHA of this sim's build
 * @param {any} tokens
 * @param {{ stylesDir?: string, art?: object, hashOnly?: boolean }} [opts] - hashOnly: skip drawing (used to compute hashes)
 * @returns {Promise<{ rules: import('./engine.mjs').PatchRule[], hashInput: { colors: object[]|null, art: string[] } }>}
 */
export async function simRulesFor( simId, deps, tokens, opts = {} ) {
  const style = loadSimStyle( simId, opts.stylesDir || SIM_STYLES_DIR );
  if ( style ) {
    const problems = validateSimStyle( style, tokens, simId );
    if ( problems.length ) { throw new Error( `invalid sim style:\n  ${problems.join( '\n  ' )}` ); }
  }
  const art = await prepareArt( deps, tokens, { ...( opts.art || {} ), ...( opts.hashOnly ? { render: noPixels } : {} ) } );
  return {
    rules: [ ...( style ? colorRulesFor( simId, style, tokens ) : [] ), ...art.rules ],
    hashInput: { colors: styleHashInput( style, tokens ), art: art.hashInput }
  };
}

/** What identifies a rule's text in the hash: ids, files, the find patterns AND the replacement code. @param {import('./engine.mjs').PatchRule} r */
const ruleText = r => ( {
  id: r.id, kind: r.kind, repo: r.repo, files: r.files, match: r.match || 'first', required: r.required,
  edits: ( r.edits || [] ).map( e => [ String( e.find ), typeof e.replace === 'function' ? e.replace.toString() : String( e.replace ), !!e.optional ] ),
  content: r.content ? r.content.toString() : null
} );

/**
 * Hash identifying what a variant build injects, for resume decisions. With a sim id it is PER SIM: the global
 * rule text (find patterns and replacement code, plus every value those read: the tokens outside the `sim`
 * group, the phet role values (they may name `sim` tokens) and the brand fields), that sim's style colors (tokens resolved) and the pictures it maps to.
 * Tokens of the `sim` group enter only through the sims that use them, except for sims whose sources import
 * a generated token module (`newSim`), which get the whole group.
 * @param {any} tokens
 * @param {{ brand: string, theme: boolean, newSim?: boolean }} opts
 * @param {string|null} [simId]
 * @param {{ colors: object[]|null, art: string[] }|null} [simInput] - from `simRulesFor`
 * @returns {string}
 */
export function variantHash( tokens, opts, simId = null, simInput = null ) {
  const { sim: simTokens, ...shared } = tokens;
  return tokensHash( {
    tokens: shared,
    // the global rules also read `sim` tokens through the phet role map (toPhetColors), so those values count
    phetColors: toPhetColors( tokens ),
    rules: rulesFor( opts ).map( ruleText ),
    brand: opts.brand, theme: opts.theme,
    fields: opts.brand === 'bsshs' ? brandFields() : null,
    sim: simId === null ? null : { id: simId, input: simInput, tokens: opts.newSim ? simTokens : null }
  } );
}

/**
 * The per-sim theme hash without drawing anything (used by the resume checks and by V1).
 * @param {any} tokens
 * @param {{ brand: string, theme: boolean, newSim?: boolean }} opts
 * @param {string} simId
 * @param {Record<string, string>} deps
 * @param {object} [extra] - options of `simRulesFor` (tests point it at fixture directories)
 * @returns {Promise<string>}
 */
export async function simVariantHash( tokens, opts, simId, deps, extra = {} ) {
  const sr = await simRulesFor( simId, deps, tokens, { ...extra, hashOnly: true } );
  return variantHash( tokens, opts, simId, sr.hashInput );
}
