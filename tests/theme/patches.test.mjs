// Patch rules: what each rule does to representative PhET source variants, idempotence, and the
// apply/revert cycle in a real (temporary) git checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadTokens, toPhetTheme } from '../../theme/index.mjs';
import { transformFile, applyPatchRules, revertTouched } from '../../theme/patches/engine.mjs';
import { rulesFor, ALL_RULES } from '../../theme/patches/index.mjs';
import { brandFields } from '../../brand/bsshs/attribution.mjs';
import { MENU_NAME, MENU_BUTTON_NAME, renameStrings } from '../../brand/bsshs/patches.mjs';

const tokens = loadTokens();
const phet = toPhetTheme( tokens );
const PNG_WHITE = Buffer.from( 'png-on-white' );
const PNG_BLACK = Buffer.from( 'png-on-black' );
const ctx = {
  phet,
  brand: { fields: brandFields(), logoOnWhitePng: PNG_WHITE, logoOnBlackPng: PNG_BLACK, splashSvg: '<svg>wordmark</svg>' }
};
const rule = id => {
  const r = ALL_RULES.find( x => x.id === id );
  assert.ok( r, `rule ${id}` );
  return r;
};
const run = ( id, text, file ) => transformFile( rule( id ), Buffer.from( text ), ctx, file || rule( id ).files[ 0 ] );
const once = ( id, text, file ) => run( id, text, file ).content.toString();

test( 'rule ids are unique and every rule is classified as theme, brand or telemetry', () => {
  const ids = ALL_RULES.map( r => r.id );
  assert.equal( new Set( ids ).size, ids.length );
  for ( const r of ALL_RULES ) {
    assert.ok( [ 'theme', 'brand', 'telemetry' ].includes( r.kind ), r.id );
    assert.ok( r.repo && r.files.length && r.why, r.id );
    assert.ok( r.edits || r.content, r.id );
  }
} );

test( 'rulesFor selects brand+telemetry for --brand bsshs and theme rules for --theme', () => {
  assert.deepEqual( rulesFor( { brand: 'adapted-from-phet', theme: false } ), [] );
  const b = rulesFor( { brand: 'bsshs', theme: false } );
  assert.ok( b.length && b.every( r => r.kind !== 'theme' ) );
  assert.ok( b.some( r => r.kind === 'telemetry' ) && b.some( r => r.kind === 'brand' ) );
  const t = rulesFor( { brand: 'bsshs', theme: true } );
  assert.ok( t.some( r => r.kind === 'theme' ) && t.length > b.length );
  assert.ok( rulesFor( { brand: 'adapted-from-phet', theme: true } ).every( r => r.kind === 'theme' ) );
} );

test( 'font rule swaps the PhetFont default family in JS and TS variants', () => {
  const js = "  options = merge( {\n    family: 'Arial'\n  }, options );";
  const ts = '    options = combineOptions<FontOptions>( {\n      family: sceneryPhetQueryParameters.fontFamily!\n    }, options );';
  for ( const src of [ js, ts ] ) {
    const out = once( 'theme-font-family', src );
    assert.ok( out.includes( `family: ${JSON.stringify( phet.fontFamily )}` ), out );
    assert.ok( !out.includes( "'Arial'" ) && !out.includes( 'fontFamily!' ) );
  }
} );

test( 'navigation-bar rule keeps the bar light and colors its text from the tokens', () => {
  const js = "      return backgroundDark ? 'white' : 'black';\n      return navigationBarFill === 'black' ? 'white' : 'black';";
  const outJs = once( 'theme-navigation-bar', js );
  assert.ok( outJs.includes( "backgroundDark ? 'white' : 'white'" ), outJs );
  assert.ok( outJs.includes( `navigationBarFill === 'black' ? 'white' : ${JSON.stringify( phet.colors.navigationBarText )}` ), outJs );
  const ts = '      backgroundDark => backgroundDark ? Color.WHITE : Color.BLACK\n      navigationBarFill => navigationBarFill.equals( Color.BLACK ) ? Color.WHITE : Color.BLACK';
  const outTs = once( 'theme-navigation-bar', ts );
  assert.ok( outTs.includes( 'backgroundDark ? Color.WHITE : Color.WHITE' ), outTs );
  assert.ok( outTs.includes( `? Color.WHITE : new Color( ${JSON.stringify( phet.colors.navigationBarText )} )` ), outTs );
  const old = "      return screenIsBlack ? 'white' : 'black';\n      return navigationBarFill === 'black' ? 'white' : 'black';";
  assert.ok( once( 'theme-navigation-bar', old ).includes( "screenIsBlack ? 'white' : 'white'" ) );
} );

test( 'home-screen rule changes only the home screen body, never HomeScreen.BACKGROUND_COLOR', () => {
  const ts = 'const BACKGROUND_COLOR = Color.BLACK;\n      backgroundColorProperty: new Property( BACKGROUND_COLOR ),';
  const out = once( 'theme-home-screen-background', ts );
  assert.ok( out.startsWith( 'const BACKGROUND_COLOR = Color.BLACK;' ) );
  assert.ok( out.includes( `new Property( new Color( ${JSON.stringify( phet.colors.homeScreenBackground )} ) )` ), out );
  const js = "const BACKGROUND_COLOR = 'black';\n      backgroundColorProperty: new Property( BACKGROUND_COLOR )";
  assert.ok( once( 'theme-home-screen-background', js, 'js/HomeScreen.js' ).includes( `new Property( ${JSON.stringify( phet.colors.homeScreenBackground )} )` ) );
} );

test( 'common UI rules: push-button base, panel defaults, checkbox, slider thumb', () => {
  assert.ok( once( 'theme-push-button-base', '  LIGHT_BLUE: new Color( 153, 206, 255 ),' )
    .includes( `LIGHT_BLUE: new Color( ${JSON.stringify( phet.colors.pushButtonBase )} ),` ) );
  const panel = once( 'theme-panel', "  fill: 'white',\n  stroke: 'black',\n  lineWidth: 1,\n  cornerRadius: 10,\n  x: { fill: 'white' }" );
  assert.ok( panel.includes( `fill: ${JSON.stringify( phet.colors.panelFill )},` ) );
  assert.ok( panel.includes( `stroke: ${JSON.stringify( phet.colors.panelStroke )},` ) );
  assert.ok( panel.includes( `cornerRadius: ${phet.panelCornerRadius},` ) );
  assert.ok( panel.endsWith( "x: { fill: 'white' }" ), 'only the defaults block changes' );
  assert.ok( once( 'theme-checkbox', "    checkboxColor: 'black'," ).includes( `checkboxColor: ${JSON.stringify( phet.colors.checkbox )},` ) );
  const thumb = once( 'theme-slider-thumb', "      fill: 'rgb( 50, 145, 184 )',\n      fillHighlighted: 'rgb(71,207,255)'," );
  assert.ok( thumb.includes( `fill: ${JSON.stringify( phet.colors.sliderThumb )},` ), thumb );
  assert.ok( thumb.includes( `fillHighlighted: ${JSON.stringify( phet.colors.sliderThumbHighlight )},` ), thumb );
} );

test( 'telemetry rules remove the analytics script and disable update checks', () => {
  const ga = run( 'telemetry-google-analytics', "( function() { pingURL( 'https://phet.colorado.edu/yotta/immediate.gif' ); } )();" ).content.toString();
  assert.doesNotMatch( ga, /yotta|google|https?:/ );
  const u1 = once( 'telemetry-update-check', "    this.areUpdatesChecked = phet.chipper.brand === 'phet' && !phet.chipper.isApp && phet.chipper.queryParameters.yotta;" );
  assert.ok( u1.includes( 'this.areUpdatesChecked = false;' ), u1 );
  const u2 = once( 'telemetry-update-check', "    areUpdatesChecked: Brand.id === 'phet' && !Brand.isPhetApp && phet.chipper.queryParameters.yotta,\n  public readonly areUpdatesChecked: boolean;" );
  assert.ok( u2.includes( 'areUpdatesChecked: false,' ) && u2.includes( 'areUpdatesChecked: boolean;' ), u2 );
  const y = once( 'telemetry-yotta-default', "    yotta: {\n      type: 'boolean',\n      defaultValue: true,\n      public: true\n    }," );
  assert.ok( y.includes( 'defaultValue: false,' ), y );
} );

test( 'brand rules fill the About fields, swap logo data and splash, drop "adapted from" text', () => {
  const f = brandFields();
  const b = once( 'brand-object', "  id: 'adapted-from-phet',\n  name: null,\n  copyright: null,\n  getLinks: function() { return []; }," );
  assert.ok( b.includes( `name: ${JSON.stringify( f.name )},` ) );
  assert.ok( b.includes( `copyright: ${JSON.stringify( f.copyright )},` ) );
  assert.ok( b.includes( `license: ${JSON.stringify( f.license )},` ) && b.includes( `licenseWithoutLinks: ${JSON.stringify( f.licenseWithoutLinks )},` ) );
  assert.ok( b.includes( "id: 'adapted-from-phet'" ), 'runtime brand slot id is kept' );
  const mod = once( 'brand-logo-modules', "image.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMoAAABg+/=';", 'adapted-from-phet/images/logoOnWhite_png.ts' );
  assert.ok( mod.includes( `'data:image/png;base64,${PNG_WHITE.toString( 'base64' )}'` ), mod );
  const mod2 = once( 'brand-logo-modules', "image.src = 'data:image/png;base64,AAAA';", 'adapted-from-phet/images/logo_png.js' );
  assert.ok( mod2.includes( PNG_BLACK.toString( 'base64' ) ) );
  assert.deepEqual( run( 'brand-logo-images', 'old', 'adapted-from-phet/images/logo-on-white.png' ).content, PNG_WHITE );
  assert.deepEqual( run( 'brand-logo-images', 'old', 'adapted-from-phet/images/logo.png' ).content, PNG_BLACK );
  assert.equal( run( 'brand-splash', '<svg>phet</svg>', 'adapted-from-phet/images/splash.svg' ).content.toString(), ctx.brand.splashSvg );
  const t = once( 'brand-no-adapted-from-text', "    if ( Brand.id === 'adapted-from-phet' ) {\n      this.addChild( new AdaptedFromText( textFillProperty, {" );
  assert.ok( t.includes( 'if ( false ) {' ) && t.includes( 'new AdaptedFromText' ), t );
} );

test( 'every rule is idempotent on its own output', () => {
  const samples = {
    'theme-font-family': "family: 'Arial'",
    'theme-navigation-bar': "backgroundDark ? 'white' : 'black';\nnavigationBarFill === 'black' ? 'white' : 'black';",
    'theme-home-screen-background': 'backgroundColorProperty: new Property( BACKGROUND_COLOR )',
    'theme-push-button-base': 'LIGHT_BLUE: new Color( 153, 206, 255 ),',
    'theme-panel': "fill: 'white',\nstroke: 'black',\ncornerRadius: 10,",
    'theme-checkbox': "checkboxColor: 'black',",
    'theme-slider-thumb': "fill: 'rgb(50,145,184)',\nfillHighlighted: 'rgb(71,207,255)',",
    'telemetry-google-analytics': 'ping()',
    'telemetry-update-check': "this.areUpdatesChecked = phet.chipper.brand === 'phet';",
    'telemetry-yotta-default': 'yotta: {\n defaultValue: true\n}',
    'brand-object': 'name: null,\ncopyright: null,',
    'brand-logo-modules': "'data:image/png;base64,AAAA'",
    'brand-splash': '<svg/>',
    'brand-no-adapted-from-text': "if ( Brand.id === 'adapted-from-phet' ) {\n this.addChild( new AdaptedFromText(",
    'brand-menu-strings': '{ "a11y": { "phetMenu": { "value": "PhET Menu" } } }',
    'brand-menu-strings-ko': '{ "PhetButton.name": { "value": "PhET Menu Button" } }',
    'brand-menu-a11y-js': "phetMenu: {\n value: 'PhET Menu'\n},\ntextDescription: 'PhET Menu Button',"
  };
  for ( const r of ALL_RULES ) {
    const file = r.files[ 0 ];
    const src = r.id in samples ? samples[ r.id ] : 'x';
    const one = transformFile( r, Buffer.from( src ), ctx, file );
    const two = transformFile( r, one.content, ctx, file );
    assert.deepEqual( two.content, one.content, `${r.id} is not idempotent` );
  }
} );

test( 'transformFile reports unmatched edits so required rules can fail loudly', () => {
  const r = transformFile( rule( 'theme-font-family' ), Buffer.from( 'nothing here' ), ctx, 'js/PhetFont.ts' );
  assert.equal( r.changed, false );
  assert.ok( r.missing.length >= 1 );
} );

/** @param {string} dir @param {string[]} args */
const git = ( dir, args ) => execFileSync( 'git', [ '-C', dir, ...args ], { encoding: 'utf8' } ).trim();

test( 'applyPatchRules patches pristine HEAD content, is idempotent, and revertTouched restores git state', async () => {
  const slot = await mkdtemp( path.join( tmpdir(), 'bsshs-slot-' ) );
  try {
    const repo = path.join( slot, 'scenery-phet' );
    await mkdir( path.join( repo, 'js' ), { recursive: true } );
    const original = "options = merge( {\n  family: 'Arial'\n}, options );\n";
    await writeFile( path.join( repo, 'js', 'PhetFont.js' ), original );
    git( repo, [ 'init', '-q' ] );
    git( repo, [ 'add', '.' ] );
    git( repo, [ '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init' ] );
    const rules = [ rule( 'theme-font-family' ) ];

    const touched = [];
    const r1 = await applyPatchRules( slot, rules, ctx, touched );
    const after1 = await readFile( path.join( repo, 'js', 'PhetFont.js' ), 'utf8' );
    assert.ok( after1.includes( JSON.stringify( phet.fontFamily ) ) );
    assert.equal( r1[ 0 ].status, 'applied' );
    assert.match( git( repo, [ 'status', '--porcelain' ] ), /PhetFont\.js/ );

    const r2 = await applyPatchRules( slot, rules, ctx, touched );
    assert.equal( await readFile( path.join( repo, 'js', 'PhetFont.js' ), 'utf8' ), after1, 'second apply gives the same file' );
    assert.equal( r2[ 0 ].status, 'applied' );

    await revertTouched( touched );
    assert.equal( git( repo, [ 'status', '--porcelain' ] ), '' );
    assert.equal( await readFile( path.join( repo, 'js', 'PhetFont.js' ), 'utf8' ), original );
    await revertTouched( touched ); // reverting twice is harmless
    assert.equal( git( repo, [ 'status', '--porcelain' ] ), '' );

    // A required rule whose anchor is gone fails, after recording what it touched.
    await writeFile( path.join( repo, 'js', 'PhetFont.js' ), 'changed\n' );
    git( repo, [ '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'drift' ] );
    await assert.rejects( applyPatchRules( slot, rules, ctx, [] ), /theme-font-family/ );
    // A missing optional target is reported as skipped, not as an error.
    const skipped = await applyPatchRules( slot, [ rule( 'theme-checkbox' ) ], ctx, [] );
    assert.equal( skipped[ 0 ].status, 'skipped' );
  }
  finally {
    await rm( slot, { recursive: true, force: true } );
  }
} );

test( 'menu-button accessible name and other perceivable PhET strings are renamed in every string layout', () => {
  assert.equal( MENU_NAME, '부산과학고 메뉴' );
  assert.equal( MENU_BUTTON_NAME, '부산과학고 메뉴 버튼' );
  const nested = JSON.parse( renameStrings( Buffer.from( JSON.stringify( {
    a11y: { phetMenu: { value: 'PhET Menu' }, homeScreen: { value: 'Home Screen' } },
    menuItem: { phetWebsite: { value: 'PhET Website…' } }
  } ) ) ).toString() );
  assert.equal( nested.a11y.phetMenu.value, MENU_NAME );
  assert.equal( nested.a11y.homeScreen.value, 'Home Screen' );
  assert.equal( nested.menuItem.phetWebsite.value, 'PhET Website…', 'hidden-for-this-brand keys are left alone' );
  const flat = JSON.parse( renameStrings( Buffer.from( JSON.stringify( {
    'PhetButton.name': { value: 'PhET Menu Button' },
    'preferences.tabs.general.moreAccessibility': { value: 'Look for Inclusive Features on the Simulations Filter page of the PhET website to find all simulations.' }
  } ) ) ).toString() );
  assert.equal( flat[ 'PhetButton.name' ].value, MENU_NAME );
  assert.doesNotMatch( flat[ 'preferences.tabs.general.moreAccessibility' ].value, /PhET/ );
  const untouched = Buffer.from( '{ "a": { "value": "x" } }' );
  assert.equal( renameStrings( untouched ), untouched, 'no match -> same bytes' );
  assert.equal( renameStrings( Buffer.from( 'not json' ) ).toString(), 'not json' );
  const js = once( 'brand-menu-a11y-js', "    phetMenu: {\n      value: 'PhET Menu'\n    },\n      textDescription: 'PhET Menu Button',", 'js/JoistA11yStrings.js' );
  assert.ok( js.includes( `value: ${JSON.stringify( MENU_NAME )}` ) && js.includes( `textDescription: ${JSON.stringify( MENU_BUTTON_NAME )}` ), js );
  assert.doesNotMatch( js, /PhET/ );
} );
