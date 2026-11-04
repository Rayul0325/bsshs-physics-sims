// Pure helpers for build-sim (kept separate so they can be unit-tested without a checkout).
import { createHash } from 'node:crypto';

const ERROR_LINE = /(fatal error|error[: ]|error TS\d+|assert|unsupported|cannot find|not found|ERR!|exception|failed|warning: .*--force)/i;

/**
 * One-paragraph failure description for the matrix: error-looking lines from the log tail
 * (or the last lines if none look like errors), capped at ~900 characters.
 * @param {string} tail
 * @param {number|null} code
 * @returns {string}
 */
export function summarizeFailure( tail, code ) {
  const lines = String( tail ).split( '\n' ).map( l => l.replace( /\x1b\[[0-9;]*m/g, '' ).trim() ).filter( Boolean );
  let picked = lines.filter( l => ERROR_LINE.test( l ) ).slice( -8 );
  if ( !picked.length ) { picked = lines.slice( -6 ); }
  let text = `exit ${code}: ${picked.join( ' | ' )}`;
  if ( text.length > 900 ) { text = `${text.slice( 0, 880 )} …`; }
  return text;
}

/**
 * True when chipper refused the brand because the sim's package.json does not list it.
 * @param {string} text
 * @returns {boolean}
 */
export function isUnsupportedBrandFailure( text ) {
  return /Unsupported brand: adapted-from-phet/.test( text );
}

/**
 * Returns package.json text with `brand` appended to phet.supportedBrands (no-op if present).
 * This is a build-config overlay applied only to a throwaway slot checkout and reverted after.
 * @param {string} pkgText
 * @param {string} brand
 * @returns {string}
 */
export function addSupportedBrand( pkgText, brand ) {
  const pkg = JSON.parse( pkgText );
  pkg.phet = pkg.phet || {};
  const list = Array.isArray( pkg.phet.supportedBrands ) ? pkg.phet.supportedBrands : [];
  if ( !list.includes( brand ) ) { list.push( brand ); }
  pkg.phet.supportedBrands = list;
  return JSON.stringify( pkg, null, 2 ) + '\n';
}

/**
 * Identifies an npm install: same package.json + lockfile + node major = reuse node_modules.
 * @param {string} pkgText
 * @param {string|null} lockText
 * @param {number} nodeMajor
 * @returns {string}
 */
export function installMarker( pkgText, lockText, nodeMajor ) {
  return createHash( 'sha256' )
    .update( `node${nodeMajor}\n` ).update( pkgText ).update( '\n--lock--\n' ).update( lockText ?? '<none>' )
    .digest( 'hex' );
}

/**
 * True when type-checking failed ONLY because files of the private PhET-iO repos (phet-io*, studio)
 * are absent. Type-checking does not change the built output, so such a build may be retried with
 * chipper's documented `--type-check=false`.
 * @param {string} text - log tail
 * @returns {boolean}
 */
export function isPrivateTypeCheckFailure( text ) {
  if ( !/tsc failed/.test( text ) ) { return false; }
  const errors = String( text ).split( '\n' ).filter( l => /error TS\d+/.test( l ) );
  return errors.length > 0 && errors.every( l => /[/\\](phet-io(-[\w-]+)?|studio)[/\\]/.test( l ) );
}

/**
 * True when the build failed ONLY because tsc could not read the private
 * phet-io/tsconfig-module.json (error TS5083), and no other TypeScript error occurred.
 * @param {string} text - log tail
 * @returns {boolean}
 */
export function isPrivatePhetioTsconfigFailure( text ) {
  const errors = String( text ).split( '\n' ).filter( l => /error TS\d+/.test( l ) );
  return errors.length > 0 &&
         errors.every( l => /error TS5083: Cannot read file '[^']*[/\\]phet-io[/\\]tsconfig-module\.json'/.test( l ) );
}

const TSC_BUILD_CALL = /^([ \t]*)const results = await tsc\( `\.\.\/\$\{repo\}`, \[ '--build' \] \);\s*\n[ \t]*reportTscResults\( results, grunt \);/m;

/** Repo-relative chipper files that may contain the sim `tsc --build` call. */
export const TSC_BUILD_FILES = [ 'js/grunt/Gruntfile.js' ];

/**
 * Returns chipper source with the sim-level `tsc --build` type-check call removed (what
 * --type-check=false does in later chippers), or null when the call is not present.
 * Applied only to a throwaway slot checkout and reverted after the build.
 * @param {string} src
 * @returns {string|null}
 */
export function skipTscBuildPatch( src ) {
  if ( !TSC_BUILD_CALL.test( src ) ) { return null; }
  return src.replace( TSC_BUILD_CALL, ( _, indent ) =>
    `${indent}// bsshs overlay chipper-skip-tsc: type-check skipped (needs private phet-io/tsconfig-module.json)` );
}
