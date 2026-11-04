// Build variants. The baseline (no flags) keeps the original layout: build/<id>/<id>_ko.html and
// data/build-matrix.json. Other variants get their own output root and matrix so a themed build
// never overwrites the no-theme baseline that later pixel comparisons rely on.
import path from 'node:path';
import { buildDir, MATRIX_JSON, REPO_ROOT } from './paths.mjs';

/** Brands accepted by --brand. adapted-from-phet = unchanged PhET brand; bsshs = school brand. */
export const BRANDS = Object.freeze( [ 'adapted-from-phet', 'bsshs' ] );

/**
 * @param {{ brand?: string, theme?: boolean }} opts
 * @returns {{ name: string, brand: string, theme: boolean, outRoot: string, matrixFile: string, logsDir: string }}
 */
export function buildVariant( opts ) {
  const brand = opts.brand || 'adapted-from-phet';
  const theme = !!opts.theme;
  const parts = [ brand === 'adapted-from-phet' ? null : brand, theme ? 'theme' : null ].filter( Boolean );
  if ( !parts.length ) {
    return { name: 'baseline', brand, theme, outRoot: buildDir(), matrixFile: MATRIX_JSON, logsDir: path.join( buildDir(), 'logs' ) };
  }
  const name = parts.join( '-' );
  return {
    name, brand, theme,
    outRoot: path.join( buildDir(), name ),
    matrixFile: path.join( REPO_ROOT, 'data', `build-matrix.${name}.json` ),
    logsDir: path.join( buildDir(), 'logs', name )
  };
}
