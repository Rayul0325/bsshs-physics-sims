// The flat component rules of theme/patches/theme.mjs (restyle phase 3): buttons, spheres, rectangles and the
// component defaults. Each rule is checked on the text shapes of the pinned families; the 63-version proof is
// `node theme/patches/dry-run.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens, toPhetTheme, toPhetColors } from '../../theme/index.mjs';
import { ALL_RULES, patchContext } from '../../theme/patches/index.mjs';
import { transformFile } from '../../theme/patches/engine.mjs';

const tokens = loadTokens();
const ctx = patchContext( tokens, { brand: 'bsshs', theme: true }, { onWhite: Buffer.from( 'x' ), onBlack: Buffer.from( 'x' ), splashSvg: '<svg/>' } );
const colors = toPhetTheme( tokens ).colors;
const q = JSON.stringify;
const rule = id => { const r = ALL_RULES.find( x => x.id === id ); assert.ok( r, id ); return r; };
const once = ( id, text, file ) => transformFile( rule( id ), Buffer.from( text ), ctx, file || rule( id ).files[ 0 ] ).content.toString();
const balance = t => [ '()', '[]', '{}' ].map( p => t.split( p[ 0 ] ).length - t.split( p[ 1 ] ).length ).join( ',' );

const RECT_TS = `      // Gradient fills for button states
      const upFillVertical = new LinearGradient( 0, 0, 0, buttonHeight )
        .addColorStop( 0, baseBrighter7Property )
        .addColorStop( verticalHighlightStop, baseColorProperty )
        .addColorStop( verticalShadowStop, baseColorProperty )
        .addColorStop( 1, baseDarker5Property );

      const upFillHorizontal = new LinearGradient( 0, 0, buttonWidth, 0 )
        .addColorStop( 0, transparentWhite )
        .addColorStop( horizontalHighlightStop, baseTransparentProperty )
        .addColorStop( 1, baseDarker5Property );

      const overFillVertical = new LinearGradient( 0, 0, 0, buttonHeight )
        .addColorStop( 0, baseBrighter7Property )
        .addColorStop( verticalHighlightStop, baseBrighter5Property )
        .addColorStop( 1, baseDarker5Property );

      const overFillHorizontal = new LinearGradient( 0, 0, buttonWidth, 0 )
        .addColorStop( 0, transparentWhite )
        .addColorStop( horizontalHighlightStop / 2, new Color( 255, 255, 255, 0 ) )
        .addColorStop( 1, baseDarker3Property );

      const downFillVertical = new LinearGradient( 0, 0, 0, buttonHeight )
        .addColorStop( 0, baseBrighter7Property )
        .addColorStop( verticalHighlightStop * 0.67, baseDarker3Property )
        .addColorStop( 1, baseDarker5Property );
`;

test( 'rectangular button rule: every gradient collapses to its base/hover/pressed/transparent paint, layers stay', () => {
  const out = once( 'theme-button-flat-rectangular', RECT_TS, 'js/buttons/RectangularButton.ts' );
  assert.ok( !/new LinearGradient/.test( out ), out );
  assert.ok( out.includes( 'const upFillVertical = baseColorProperty;' ) );
  assert.ok( out.includes( 'const overFillVertical = baseBrighter5Property;' ) );
  assert.ok( out.includes( 'const downFillVertical = baseDarker3Property;' ) );
  assert.ok( out.includes( 'const upFillHorizontal = baseTransparentProperty;' ) );
  assert.ok( out.includes( 'const overFillHorizontal = new Color( 255, 255, 255, 0 );' ), 'a stop with nested parentheses survives' );
  assert.equal( balance( out ), balance( RECT_TS ) );
} );

test( 'rectangular and round button rules replace the dark derived edge by the faint token line', () => {
  const ts = '    const defaultStroke = ( providedOptions && providedOptions.stroke ) ?\n                          providedOptions.stroke :\n                          new PaintColorProperty( baseColorProperty, { luminanceFactor: -0.4 } );';
  assert.ok( once( 'theme-button-flat-rectangular', ts, 'js/buttons/RectangularButton.ts' ).includes( `providedOptions.stroke : ${q( colors.buttonStroke )}` ) );
  assert.ok( once( 'theme-button-flat-round', ts, 'js/buttons/RoundButton.ts' ).includes( `providedOptions.stroke : ${q( colors.buttonStroke )}` ) );
  const js = "      stroke: ( typeof ( options.stroke ) === 'undefined' ) ? baseDarker4 : options.stroke,";
  assert.ok( once( 'theme-button-flat-rectangular', js, 'js/buttons/RectangularButton.js' ).includes( `? ${q( colors.buttonStroke )} : options.stroke` ) );
  const round = '      stroke: !options.stroke ? baseDarker4Property : options.stroke,';
  assert.ok( once( 'theme-button-flat-round', round, 'js/buttons/RoundButton.ts' ).includes( `!options.stroke ? ${q( colors.buttonStroke )} : options.stroke` ) );
  assert.ok( once( 'theme-button-flat-stroke-old', '      enabledStroke = baseDarker4;\n      enabledStroke = baseColor.colorUtilsDarker( 0.4 );', 'js/buttons/RectangularButtonView.js' )
    .split( q( colors.buttonStroke ) ).length === 3 );
} );

test( 'round button rule: highlight keeps its first stop, shadow overlays keep their transparent one, pressed its second', () => {
  const round = `      const upFillHighlight = new RadialGradient( gradientOffset, gradientOffset, innerGradientRadius, gradientOffset, gradientOffset, outerGradientRadius )
        .addColorStop( 0, baseColorProperty )
        .addColorStop( 1, baseBrighter7Property );
      const upFillShadow = new RadialGradient( -gradientOffset, -gradientOffset, innerGradientRadius, -gradientOffset, -gradientOffset, outerGradientRadius )
        .addColorStop( 0, baseTransparentProperty )
        .addColorStop( 1, baseDarker5Property );
      const pressedFill = new RadialGradient( -gradientOffset, -gradientOffset, 0, 0, 0, outerGradientRadius )
        .addColorStop( 0, baseDarker1Property )
        .addColorStop( 0.6, baseDarker2Property )
        .addColorStop( 1, baseBrighter8Property );`;
  const out = once( 'theme-button-flat-round', round, 'js/buttons/RoundButton.ts' );
  assert.ok( out.includes( 'const upFillHighlight = baseColorProperty;' ) && out.includes( 'const upFillShadow = baseTransparentProperty;' ) && out.includes( 'const pressedFill = baseDarker2Property;' ), out );
  assert.ok( !/Gradient/.test( out ) );
  // old RequireJS-era text: assignments with `var`, no keyword inside nested functions
  const old = '      upFillVertical = new LinearGradient( 0, 0, 0, buttonHeight )\n        .addColorStop( 0, baseColor.colorUtilsBrighter( 0.7 ) )\n        .addColorStop( verticalHighlightStop, baseColor )\n        .addColorStop( 1, baseColor.colorUtilsDarker( 0.5 ) );';
  assert.ok( once( 'theme-button-flat-rectangular', old, 'js/buttons/RectangularButtonView.js' ).includes( '      upFillVertical = baseColor;' ) );
} );

test( 'phet color scheme: reset-all and the yellow button color come from the role map; physical colors stay', () => {
  const src = '  RESET_ALL_BUTTON_BASE_COLOR: new Color( 247, 151, 34 ),\n  BUTTON_YELLOW: PHET_LOGO_YELLOW,\n  GREEN_COLORBLIND: GREEN_COLORBLIND,';
  const out = once( 'theme-phet-color-scheme', src );
  assert.ok( out.includes( `RESET_ALL_BUTTON_BASE_COLOR: new Color( ${q( colors.resetAllButton )} )` ) );
  assert.ok( out.includes( `BUTTON_YELLOW: new Color( ${q( colors.zoomButton )} )` ) );
  assert.ok( out.endsWith( 'GREEN_COLORBLIND: GREEN_COLORBLIND,' ) );
  assert.ok( once( 'theme-phet-color-scheme', '  RESET_ALL_BUTTON_BASE_COLOR: new Color( 247, 151, 34 ),' ).includes( 'new Color(' ), 'the 5 oldest families have no BUTTON_YELLOW' );
} );

test( 'shaded sphere and shaded rectangle: flat, same node tree', () => {
  const ts = '    this.fill = new RadialGradient( highlightX, highlightY, 0, highlightX, highlightY, radius * 2 )\n      .addColorStop( 0, options.highlightColor )\n      .addColorStop( options.highlightDiameterRatio, options.mainColor )\n      .addColorStop( 1, options.shadowColor );\n    foo();';
  assert.equal( once( 'theme-shaded-sphere-flat', ts ), '    this.fill = options.mainColor;\n    foo();' );
  const js = '  options.fill = new RadialGradient( highlightX, highlightY, 0, highlightX, highlightY, diameter )\n    .addColorStop( 0, options.highlightColor )\n    .addColorStop( 1, options.shadowColor );';
  assert.equal( once( 'theme-shaded-sphere-flat', js, 'js/ShadedSphereNode.js' ), '  options.fill = options.mainColor;' );
  const rect = `    this.addChild( horizontalNode );
    this.addChild( darkCorner );
    const panelStroke = Rectangle.roundedBounds( rectBounds, cornerRadius, cornerRadius, {
      stroke: new DerivedProperty( [ rightColorProperty ], ( color => {
        return color.withAlpha( 0.4 );
      } ) )
    } );`;
  const out = once( 'theme-shaded-rectangle-flat', rect );
  assert.ok( out.includes( 'this.addChild( horizontalNode );' ) && out.includes( 'this.addChild( darkCorner );' ), 'no layer is dropped' );
  assert.ok( out.includes( 'horizontalNode.fill = options.baseColor;' ) && out.includes( 'darkCorner.fill = options.baseColor;' ) );
  assert.ok( out.includes( '{\n      fill: options.baseColor\n    } );' ), out );
  assert.equal( balance( out ), balance( rect ) );
  const old = '    var panelStroke = Rectangle.roundedBounds( rectBounds, cornerRadius, cornerRadius, {\n      stroke: rightColor.withAlpha( 0.4 )\n    } );\n    this.addChild( darkCorner );';
  assert.ok( once( 'theme-shaded-rectangle-flat', old, 'js/ShadedRectangle.js' ).includes( 'fill: options.baseColor' ) );
} );

test( 'component defaults: accordion box, carousel, number display, slider track, radio group', () => {
  const acc = once( 'theme-accordion-box', "  fill: 'rgb( 238, 238, 238 )',\n  stroke: 'black',\n  lineWidth: 1," );
  assert.ok( acc.includes( `fill: ${q( colors.componentFill )},` ) && acc.includes( `stroke: ${q( colors.componentStroke )},` ) && acc.includes( 'lineWidth: 1,' ) );
  const car = once( 'theme-carousel', "      fill: 'white',\n      stroke: 'black',\n      baseColor: 'rgba( 200, 200, 200, 0.5 )',\n      arrowPathOptions: {\n        stroke: 'black',\n        lineWidth: 3\n      },\n      stroke: 'rgb( 180, 180, 180 )'," );
  assert.ok( car.includes( `arrowPathOptions: {\n        stroke: ${q( colors.componentText )},` ), car );
  assert.ok( car.includes( `baseColor: ${q( colors.componentHighlight )}` ) && !/'black'|'white'|180, 180/.test( car ), car );
  const nd = once( 'theme-number-display', "  backgroundFill: 'white',\n  backgroundStroke: 'lightGray',\n  cornerRadius: 0," );
  assert.ok( nd.includes( `backgroundStroke: ${q( colors.componentStroke )}` ) && nd.includes( 'cornerRadius: 0,' ), 'corner radius is geometry and stays' );
  const slider = once( 'theme-slider-track', "      trackFillEnabled: 'white',\n      trackStroke: 'black',\n      trackLineWidth: 1," );
  assert.ok( slider.includes( `trackFillEnabled: ${q( colors.componentHighlight )}` ) && slider.includes( `trackStroke: ${q( colors.componentStroke )}` ) );
  const radio = once( 'theme-radio-selected-stroke', "selectedStroke: 'black',\n selectedLineWidth: 1.5,\n deselectedStroke: new Color( 50, 50, 50 )," );
  assert.ok( radio.includes( `selectedStroke: ${q( colors.selectedStroke )}` ) && radio.includes( `new Color( ${q( colors.componentStroke )} )` ) && radio.includes( 'selectedLineWidth: 1.5' ) );
} );

test( 'the new phet roles resolve to tokens (a sim token is reached only through a role) and no role value is pure black', () => {
  const c = toPhetColors( tokens );
  assert.equal( c.buttonStroke, tokens.sim.line );
  assert.equal( c.resetAllButton, tokens.sim.controlActive );
  assert.equal( c.panelStroke, tokens.sim.line );
  assert.equal( c.componentFill, tokens.color.surface );
  for ( const [ role, v ] of Object.entries( c ) ) { assert.ok( v && !/^#0{3,6}$/i.test( v ), `${role}=${v}` ); }
} );

test( 'a global rule reads sim tokens through roles, so the per-sim hash follows them', async () => {
  const { variantHash } = await import( '../../theme/patches/index.mjs' );
  const opts = { brand: 'bsshs', theme: true };
  const base = variantHash( tokens, opts, 'faradays-law', { colors: null, art: [] } );
  const t = JSON.parse( JSON.stringify( tokens ) );
  t.sim.line = '#c0c4cc'; // buttonStroke / panelStroke / componentStroke come from sim.line
  assert.notEqual( variantHash( t, opts, 'faradays-law', { colors: null, art: [] } ), base );
  const u = JSON.parse( JSON.stringify( tokens ) );
  u.sim.physics.copper = '#c07030'; // read by no global rule, only by sims that map to it
  assert.equal( variantHash( u, opts, 'faradays-law', { colors: null, art: [] } ), base );
} );
