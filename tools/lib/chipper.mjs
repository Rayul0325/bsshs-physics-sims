// Knowledge about PhET's chipper build tool generations (mirrors perennial's getBuildArguments).

/**
 * Maps a chipper package.json version onto the build-argument generation.
 * chipper 0.0.0 = RequireJS era (singular --brand); 2.x/3.x = webpack era (--brands).
 * @param {string} version
 * @returns {0|2}
 */
export function chipperGeneration( version ) {
  const m = /^(\d+)\.(\d+)\.\d+/.exec( String( version ) );
  if ( m && m[ 1 ] === '0' && m[ 2 ] === '0' ) { return 0; }
  if ( m && ( m[ 1 ] === '2' || m[ 1 ] === '3' ) && m[ 2 ] === '0' ) { return 2; }
  throw new Error( `unsupported chipper version: ${version}` );
}

/**
 * Grunt arguments for a single-brand, single-locale build. Lint is skipped (it checks
 * code style, not the output); type-check stays on unless explicitly disabled.
 * @param {0|2} gen
 * @param {{ brand: string, locale: string, typeCheck?: boolean }} options
 * @returns {string[]}
 */
export function gruntArgs( gen, { brand, locale, typeCheck = true } ) {
  if ( gen === 0 ) {
    return [ 'build', `--brand=${brand}`, `--locales=${locale}`, '--lint=false' ];
  }
  const args = [ 'build', `--brands=${brand}`, `--locales=${locale}`, '--lint=false' ];
  if ( !typeCheck ) { args.push( '--type-check=false' ); }
  return args;
}

/**
 * Where chipper writes the built HTML, relative to the sim repo.
 * @param {0|2} gen
 * @param {string} id
 * @param {string} brand
 * @param {string} locale
 * @returns {string}
 */
export function builtHtmlRelPath( gen, id, brand, locale ) {
  return gen === 0 ? `build/${id}_${locale}.html` : `build/${brand}/${id}_${locale}_${brand}.html`;
}
