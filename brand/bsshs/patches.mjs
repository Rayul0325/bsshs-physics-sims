// The bsshs brand, derived from PhET's adapted-from-phet brand (MIT, see brand/bsshs/LICENSE).
//
// chipper's list of brands (ChipperConstants.BRANDS, webpack brand filters) is hard-coded in each of
// the 62 pinned chipper SHAs, so a new brand directory would need chipper patches in every family.
// Instead the bsshs brand is installed INTO the adapted-from-phet brand slot of the throwaway slot
// checkout: chipper and joist still see `adapted-from-phet` (PhET's official route for third-party
// builds; it already disables PhET-only menu items, credits and update checks), while every file
// the user can see comes from here:
//   - Brand.{js,ts}: About-dialog name / copyright / license fields (attribution.mjs)
//   - logo*.png and logo*_png.{js,ts}: the 「부산과학고」 text wordmark (rendered from text, wordmark.mjs)
//   - splash.svg / splash_svg.ts: the loading splash, also the text wordmark
//   - joist PhetButton.js (2 old families): drop the extra "Adapted from" text next to the logo
// Brand.id stays 'adapted-from-phet' at runtime because joist aligns the logo by that id.

import path from 'node:path';
import { REPO_URL, WORDMARK } from './attribution.mjs';

/** @param {string} v */
const q = v => JSON.stringify( v );

/** True for the logo variant drawn on a white navigation bar. @param {string} file */
const isOnWhite = file => /white/i.test( path.posix.basename( file ) );

/** The menu button's accessible name (spec 3.2: no PhET name outside the About attribution). */
export const MENU_NAME = `${WORDMARK} 메뉴`;
/** Same for the older families' PhetButton `textDescription` (「PhET Menu Button」 in the joist menu code). */
export const MENU_BUTTON_NAME = `${WORDMARK} 메뉴 버튼`;

/**
 * Joist string keys a user can perceive (screen reader name of the ⋮ menu button, Preferences text)
 * whose PhET wording is replaced. Keys whose UI is never shown for this brand (menuItem.phetWebsite,
 * donateToPhet, credits) are left alone; tools/check-sim.mjs proves they are not exposed.
 * @type {Record<string, (value: string) => string>}
 */
export const STRING_RENAMES = {
  'a11y.phetMenu': () => MENU_NAME,
  'PhetButton.name': () => MENU_NAME,
  'preferences.tabs.general.moreAccessibility': v => v.replace( / of the PhET website/g, '' ).replace( /\bPhET\s*/g, '' )
};

/**
 * Rewrites the listed keys in a PhET/babel string file. Both layouts occur in the pinned versions:
 * flat ("PhetButton.name": { "value" }) and nested ({ "a11y": { "phetMenu": { "value" } } }).
 * Only values that contain "PhET" are changed. Returns the input unchanged when nothing matches.
 * @param {Buffer} old
 * @returns {Buffer|string}
 */
export function renameStrings( old ) {
  let json;
  try { json = JSON.parse( old.toString( 'utf8' ) ); } catch { return old; }
  let changed = 0;
  const walk = ( obj, prefix ) => {
    for ( const [ k, v ] of Object.entries( obj ) ) {
      if ( !v || typeof v !== 'object' ) { continue; }
      const key = prefix ? `${prefix}.${k}` : k;
      if ( typeof v.value === 'string' && STRING_RENAMES[ key ] && /PhET/.test( v.value ) ) {
        v.value = STRING_RENAMES[ key ]( v.value );
        changed++;
      }
      else if ( typeof v.value !== 'string' ) { walk( v, key ); }
    }
  };
  walk( json, '' );
  return changed ? JSON.stringify( json, null, 2 ) + '\n' : old;
}

/** @type {import('../../theme/patches/engine.mjs').PatchRule[]} */
export const BRAND_RULES = [
  {
    id: 'brand-object',
    kind: 'brand',
    repo: 'brand',
    files: [ 'adapted-from-phet/js/Brand.ts', 'adapted-from-phet/js/Brand.js' ],
    required: true,
    why: 'About dialog: name, copyright and license fields carry the required attribution strings.',
    edits: [
      { find: /\bname: null\b/, replace: env => `name: ${q( env.brand.fields.name )}` },
      {
        find: /\bcopyright: null,/,
        replace: env => `copyright: ${q( env.brand.fields.copyright )},\n  license: ${q( env.brand.fields.license )},\n  licenseWithoutLinks: ${q( env.brand.fields.licenseWithoutLinks )},`
      }
    ]
  },
  {
    id: 'brand-logo-images',
    kind: 'brand',
    repo: 'brand',
    files: [ 'adapted-from-phet/images/logo.png', 'adapted-from-phet/images/logo-on-white.png', 'adapted-from-phet/images/logoOnWhite.png' ],
    match: 'all',
    required: true,
    why: 'Navbar logo PNGs (read by the RequireJS image! plugin in old families) -> text wordmark.',
    content: env => ( isOnWhite( env.file ) ? env.brand.logoOnWhitePng : env.brand.logoOnBlackPng )
  },
  {
    id: 'brand-logo-modules',
    kind: 'brand',
    repo: 'brand',
    files: [ 'adapted-from-phet/images/logo_png.ts', 'adapted-from-phet/images/logo_png.js',
             'adapted-from-phet/images/logoOnWhite_png.ts', 'adapted-from-phet/images/logo-on-white_png.js' ],
    match: 'all',
    required: false,
    why: 'Navbar logo modules (ES-module families embed the PNG as a data URI) -> text wordmark.',
    edits: [ {
      find: /data:image\/png;base64,[A-Za-z0-9+/=]+/,
      replace: env => `data:image/png;base64,${( isOnWhite( env.file ) ? env.brand.logoOnWhitePng : env.brand.logoOnBlackPng ).toString( 'base64' )}`
    } ]
  },
  {
    id: 'brand-splash',
    kind: 'brand',
    repo: 'brand',
    files: [ 'adapted-from-phet/images/splash.svg' ],
    required: true,
    why: 'Loading splash (chipper inlines brand/<brand>/images/splash.svg) -> text wordmark.',
    content: env => env.brand.splashSvg
  },
  {
    id: 'brand-splash-module',
    kind: 'brand',
    repo: 'brand',
    files: [ 'adapted-from-phet/images/splash_svg.ts' ],
    required: false,
    why: 'Splash image module of newer families -> the same text wordmark SVG.',
    edits: [ {
      find: /data:image\/svg\+xml;base64,(?:\$\{btoa\('[^']*'\)\}|[A-Za-z0-9+/=]+)/,
      replace: env => `data:image/svg+xml;base64,${Buffer.from( env.brand.splashSvg, 'utf8' ).toString( 'base64' )}`
    } ]
  },
  {
    id: 'brand-image-licenses',
    kind: 'brand',
    repo: 'brand',
    files: [ 'adapted-from-phet/images/license.json' ],
    required: false,
    why: 'Media credits embedded in the built file: the replaced logo/splash entries describe the text wordmark, not the PhET logo.',
    content: ( env, old ) => {
      let json;
      try { json = JSON.parse( old.toString( 'utf8' ) ); } catch { return old; }
      for ( const key of Object.keys( json ) ) {
        if ( /^(logo|splash)/.test( key ) ) {
          json[ key ] = { text: [ `${WORDMARK} wordmark rendered from text (bsshs brand)` ], projectURL: REPO_URL, license: 'GPL-3.0', notes: 'replaces the adapted-from-phet logo/splash' };
        }
      }
      return JSON.stringify( json, null, 2 ) + '\n';
    }
  },
  {
    id: 'brand-menu-strings',
    kind: 'brand',
    repo: 'joist',
    files: [ 'joist-strings_en.json' ],
    required: false, // 6 old families have no PhET wording in these keys; check-sim enforces the result
    why: 'English joist strings (the fallback for untranslated keys): menu button accessible name "PhET Menu" -> 「부산과학고 메뉴」, PhET wording in Preferences removed.',
    content: ( env, old ) => renameStrings( old )
  },
  {
    id: 'brand-menu-strings-ko',
    kind: 'brand',
    repo: 'babel',
    files: [ 'joist/joist-strings_ko.json' ],
    required: false,
    why: 'Korean joist translations of the same keys, when a translation contains PhET.',
    content: ( env, old ) => renameStrings( old )
  },
  {
    id: 'brand-menu-a11y-js',
    kind: 'brand',
    repo: 'joist',
    files: [ 'js/JoistA11yStrings.js', 'js/PhetButton.js' ],
    match: 'all',
    required: false,
    why: 'Older families keep the menu button\'s accessible name in JS (JoistA11yStrings phetMenu -> 「부산과학고 메뉴」, PhetButton textDescription -> 「부산과학고 메뉴 버튼」).',
    edits: [
      { find: /((?:value|phetString): )'PhET Menu'/g, replace: ( env, m, head ) => `${head}${q( MENU_NAME )}`, optional: true },
      { find: /(textDescription: )'PhET Menu Button'/g, replace: ( env, m, head ) => `${head}${q( MENU_BUTTON_NAME )}`, optional: true }
    ]
  },
  {
    id: 'brand-no-adapted-from-text',
    kind: 'brand',
    repo: 'joist',
    files: [ 'js/PhetButton.js' ],
    required: false,
    why: 'Two old joist families draw an extra "Adapted from" text beside the logo; the navbar must show only the wordmark.',
    edits: [ {
      find: /if \( Brand\.id === 'adapted-from-phet' \) \{(\s*this\.addChild\( new AdaptedFromText)/,
      replace: ( env, m, rest ) => `if ( false ) {${rest}`
    } ]
  }
];
