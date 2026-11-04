// The bsshs brand's human-readable attribution. These exact strings are required by the spec
// (section 3.2) and are shown in every rebuilt sim's About dialog. Keep the repo link in REPO_URL only.

/** Source repository of this adaptation (default name; change it here and nowhere else). */
export const REPO_URL = 'https://github.com/Rayul0325/bsshs-physics-sims';

/** The navbar wordmark: text only, no emblem, no PhET logo. */
export const WORDMARK = '부산과학고';

/** Brand id of this adaptation (source dir brand/bsshs, CLI `--brand bsshs`). */
export const BRAND_ID = 'bsshs';

/** The six required attribution items, verbatim. */
export const ATTRIBUTION = Object.freeze( {
  phetCredit: 'Simulation by PhET Interactive Simulations, University of Colorado Boulder (https://phet.colorado.edu)',
  originalKo: '원작: PhET Interactive Simulations, University of Colorado Boulder',
  modifiedBy: '부산과학고 학생이 수정함',
  licenses: '소스 라이선스: GPL-3.0 · 원본 배포본: CC BY-NC 4.0',
  sourceRepo: REPO_URL,
  notOfficial: '부산과학고 학생 제작 · 학교 공식 자료 아님'
} );

/** Strings a checker must find in the About dialog (in this order of importance). */
export const REQUIRED_ABOUT_STRINGS = Object.freeze( [
  ATTRIBUTION.phetCredit,
  ATTRIBUTION.originalKo,
  ATTRIBUTION.modifiedBy,
  ATTRIBUTION.licenses,
  ATTRIBUTION.sourceRepo,
  ATTRIBUTION.notOfficial
] );

/**
 * Values for the PhET Brand object fields that joist's AboutDialog renders in every pinned version
 * (name, copyright, license / licenseWithoutLinks; all 63 AboutDialog variants read these).
 * license is RichText; lines are separated with <br> and contain no links, so it reads the same
 * with or without ?allowLinks.
 * @returns {{ name: string, copyright: string, license: string, licenseWithoutLinks: string }}
 */
export function brandFields() {
  const license = [
    ATTRIBUTION.phetCredit,
    ATTRIBUTION.licenses,
    `소스 코드: ${ATTRIBUTION.sourceRepo}`,
    ATTRIBUTION.notOfficial
  ].join( '<br>' );
  return {
    name: ATTRIBUTION.modifiedBy,
    copyright: ATTRIBUTION.originalKo,
    license,
    licenseWithoutLinks: license
  };
}
