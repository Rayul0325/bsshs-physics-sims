// Theme patches: common-code colors, flat component looks and fonts (navbar, home screen, buttons, panels,
// checkboxes, sliders, PhetFont, flat button strategy, spheres, accordion boxes, carousels, ...). Experiment-screen
// layout, per-sim colors with physical meaning and physics are never touched: a rule that moved anything would
// show up in tools/compare-bounds.mjs (V12) and backs off to colors only. Each `find` is PhET's ORIGINAL value written as an escaped regex; every replacement
// value comes from theme/tokens.json through ctx.phet (see theme/index.mjs toPhetTheme).
//
// The anchors were checked against all 63 pinned dependency sets with `node theme/patches/dry-run.mjs`
// (one row per "SHA family" = distinct file blob); rules marked optional do not exist in old families.

/** @param {string} v */
const q = v => JSON.stringify( v );

/**
 * One gradient declaration of a 3D button strategy: `[const |let |var ]<...Fill...> = new (Linear|Radial)Gradient( ... ).addColorStop( ... )...;`
 * (no `;` inside any of them, in all pinned families).
 */
const GRADIENT_STATEMENT = /(?:(?:const|let|var) )?\w*Fill\w* = new (?:Linear|Radial)Gradient\([^;]*;/g;

/** @param {string} text @param {number} open index of an opening `(` @returns {number} index of its matching `)` */
const matchingParen = ( text, open ) => {
  let depth = 0;
  for ( let i = open; i < text.length; i++ ) {
    if ( text[ i ] === '(' ) { depth++; }
    else if ( text[ i ] === ')' && --depth === 0 ) { return i; }
  }
  throw new Error( 'unbalanced parentheses in a gradient statement' );
};

/**
 * Flat stand-in for a gradient declaration: the same variable, assigned the paint of one of the gradient's color
 * stops. Which one: the base look for the main fill (2nd stop of a vertical or pressed gradient: base, lighter when
 * hovered, darker when pressed), the first stop of a round button's highlight, and the transparent end of the
 * overlay gradients (the horizontal ones of rectangular buttons and the round buttons' shadow ones), so the
 * overlay layers stay in the node tree but paint nothing.
 * @param {string} statement
 * @returns {string}
 */
const flatGradientStatement = statement => {
  const head = /^((?:(?:const|let|var) )?)(\w+) = new (?:Linear|Radial)Gradient\(/.exec( statement );
  const stops = [];
  let at = matchingParen( statement, head[ 0 ].length - 1 ) + 1;
  for ( const m of statement.slice( at ).matchAll( /\.addColorStop\(/g ) ) {
    const open = at + m.index + m[ 0 ].length - 1;
    const close = matchingParen( statement, open );
    const args = statement.slice( open + 1, close );
    let depth = 0;
    let comma = -1;
    for ( let i = 0; i < args.length && comma < 0; i++ ) {
      if ( args[ i ] === '(' ) { depth++; }
      else if ( args[ i ] === ')' ) { depth--; }
      else if ( args[ i ] === ',' && depth === 0 ) { comma = i; }
    }
    stops.push( args.slice( comma + 1 ).trim() );
  }
  const name = head[ 2 ];
  const pick = /(Highlight|Shadow)$/.test( name ) ? 0 : 1;
  if ( !stops[ pick ] ) { throw new Error( `gradient ${name} has no color stop #${pick}` ); }
  return `${head[ 1 ]}${name} = ${stops[ pick ]};`;
};

/** @type {import('./engine.mjs').PatchRule[]} */
export const THEME_RULES = [
  {
    id: 'theme-font-family',
    kind: 'theme',
    repo: 'scenery-phet',
    files: [ 'js/PhetFont.ts', 'js/PhetFont.js' ],
    required: true,
    why: 'PhetFont default family -> tokens font.sans + font.koreanFallback (PhetFont appends the generic sans-serif itself).',
    edits: [ {
      find: /family: (?:'Arial'|sceneryPhetQueryParameters\.fontFamily!?)/,
      replace: env => `family: ${q( env.phet.fontFamily )}`
    } ]
  },
  {
    id: 'theme-navigation-bar',
    kind: 'theme',
    repo: 'joist',
    files: [ 'js/LookAndFeel.ts', 'js/LookAndFeel.js' ],
    required: true,
    why: 'Navbar always uses PhET\'s light mode (white, so every joist "=== white/black" check stays consistent); its text color comes from the tokens.',
    edits: [
      {
        // navigation bar fill: white for dark screens, black otherwise -> white always
        find: /(\b(?:backgroundDark|screenIsBlack) \? )(Color\.WHITE|'white') : (?:Color\.BLACK|'black')/,
        replace: ( env, m, head, white ) => `${head}${white} : ${white}`
      },
      {
        // navigation bar text: the light-bar branch gets the token text color
        find: /(navigationBarFill(?:\.equals\( Color\.BLACK \)| === 'black') \? (?:Color\.WHITE|'white') : )(Color\.BLACK|'black')/,
        replace: ( env, m, head, black ) => `${head}${black.startsWith( 'Color' ) ? `new Color( ${q( env.phet.colors.navigationBarText )} )` : q( env.phet.colors.navigationBarText )}`
      }
    ]
  },
  {
    id: 'theme-home-screen-background',
    kind: 'theme',
    repo: 'joist',
    files: [ 'js/HomeScreen.ts', 'js/HomeScreen.js' ],
    required: false,
    why: 'Home screen body color -> tokens (dark). HomeScreen.BACKGROUND_COLOR is left black because the navbar compares against it.',
    edits: [ {
      find: /(backgroundColorProperty: new Property\( )(?:BACKGROUND_COLOR|'black')( \))|(backgroundColor: )'black'/,
      // TS HomeScreen files hold a Color (and import Color); JS files hold a CSS string.
      replace: ( env, m, head, tail, oldHead ) => {
        const v = q( env.phet.colors.homeScreenBackground );
        return oldHead ? `${oldHead}${v}` : `${head}${env.isTs ? `new Color( ${v} )` : v}${tail}`;
      }
    } ]
  },
  {
    id: 'theme-push-button-base',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/ColorConstants.ts', 'js/ColorConstants.js' ],
    required: true,
    why: 'Default base color of sun push buttons (ColorConstants.LIGHT_BLUE) -> tokens.',
    edits: [ {
      find: /LIGHT_BLUE: new Color\( 153, 206, 255 \)/,
      replace: env => `LIGHT_BLUE: new Color( ${q( env.phet.colors.pushButtonBase )} )`
    } ]
  },
  {
    id: 'theme-panel',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/Panel.ts', 'js/Panel.js' ],
    required: true,
    why: 'sun Panel DEFAULT options (first occurrence only): fill, stroke, corner radius -> tokens. Sims that pass their own fill keep it.',
    edits: [
      { find: /fill: 'white',/, replace: env => `fill: ${q( env.phet.colors.panelFill )},` },
      { find: /stroke: 'black',/, replace: env => `stroke: ${q( env.phet.colors.panelStroke )},` },
      { find: /cornerRadius: 10,/, replace: env => `cornerRadius: ${env.phet.panelCornerRadius},` }
    ]
  },
  {
    id: 'theme-checkbox',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/Checkbox.ts', 'js/Checkbox.js', 'js/CheckBox.js' ],
    required: false,
    why: 'sun Checkbox default box color -> tokens (old families spell it CheckBox / checkBoxColor).',
    edits: [ { find: /(check[bB]oxColor): 'black',/, replace: ( env, m, key ) => `${key}: ${q( env.phet.colors.checkbox )},` } ]
  },
  {
    id: 'theme-slider-thumb',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/SliderThumb.ts', 'js/SliderThumb.js', 'js/Slider.ts', 'js/Slider.js', 'js/HSlider.js' ],
    match: 'all',
    required: false,
    why: 'Default slider thumb fill / highlight (PhET blue) -> tokens accent.',
    edits: [
      { find: /'rgb\(\s*50,\s*145,\s*184\s*\)'/g, replace: env => q( env.phet.colors.sliderThumb ), optional: true },
      { find: /'rgb\(\s*71,\s*207,\s*255\s*\)'/g, replace: env => q( env.phet.colors.sliderThumbHighlight ), optional: true }
    ]
  },
  // ---- flat look (restyle phase 3) -------------------------------------------------------------------------
  {
    id: 'theme-button-flat-rectangular',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/buttons/RectangularButton.ts', 'js/buttons/RectangularButton.js', 'js/buttons/RectangularButtonView.js' ],
    required: true,
    why: 'Rectangular buttons look flat: every gradient fill of the 3D strategy collapses to one flat paint (the shading layers stay in the node tree, so no node is added or removed) and the dark edge derived from the base color becomes the faint token line.',
    edits: [
      { find: GRADIENT_STATEMENT, replace: ( env, stmt ) => flatGradientStatement( stmt ), optional: true },
      { find: /providedOptions\.stroke :\s*new PaintColorProperty\( baseColorProperty, \{ luminanceFactor: -0\.4 \} \)/g, replace: env => `providedOptions.stroke : ${q( env.phet.colors.buttonStroke )}`, optional: true },
      { find: /stroke: \( typeof \( options\.stroke \) === 'undefined' \) \? baseDarker4 : options\.stroke/g, replace: env => `stroke: ( typeof ( options.stroke ) === 'undefined' ) ? ${q( env.phet.colors.buttonStroke )} : options.stroke`, optional: true }
    ]
  },
  {
    id: 'theme-button-flat-round',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/buttons/RoundButton.ts', 'js/buttons/RoundButton.js', 'js/buttons/RoundButtonView.js' ],
    required: true,
    why: 'Round buttons look flat: the radial highlight and shadow gradients collapse to one flat paint (layers stay), the dark edge becomes the faint token line.',
    edits: [
      { find: GRADIENT_STATEMENT, replace: ( env, stmt ) => flatGradientStatement( stmt ), optional: true },
      { find: /providedOptions\.stroke :\s*new PaintColorProperty\( baseColorProperty, \{ luminanceFactor: -0\.4 \} \)/g, replace: env => `providedOptions.stroke : ${q( env.phet.colors.buttonStroke )}`, optional: true },
      { find: /stroke: !options\.stroke \? baseDarker4Property : options\.stroke/g, replace: env => `stroke: !options.stroke ? ${q( env.phet.colors.buttonStroke )} : options.stroke`, optional: true },
      { find: /stroke: \( typeof \( options\.stroke \) === 'undefined' \) \? baseDarker4 : options\.stroke/g, replace: env => `stroke: ( typeof ( options.stroke ) === 'undefined' ) ? ${q( env.phet.colors.buttonStroke )} : options.stroke`, optional: true }
    ]
  },
  {
    id: 'theme-button-flat-stroke',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/buttons/ButtonNode.ts', 'js/buttons/ButtonNode.js' ],
    required: false,
    why: 'The flat button strategy derived its outline from the base color (a dark edge); it gets the faint token line instead. The stroke width stays, so the layout does not move.',
    edits: [
      { find: /buttonBackground\.stroke = options\.stroke \|\| baseDarker4Property;/, replace: env => `buttonBackground.stroke = options.stroke || ${q( env.phet.colors.buttonStroke )};`, optional: true },
      { find: /\( typeof \( options\.stroke \) === 'undefined' \) \? baseDarker4 : options\.stroke/, replace: env => `( typeof ( options.stroke ) === 'undefined' ) ? ${q( env.phet.colors.buttonStroke )} : options.stroke`, optional: true }
    ]
  },
  {
    id: 'theme-button-flat-stroke-old',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/buttons/RectangularButtonView.js', 'js/buttons/RoundButtonView.js' ],
    match: 'all',
    required: false,
    why: 'Old (RequireJS-era) families keep their flat strategy in the *ButtonView files: same faint token outline.',
    edits: [
      { find: /enabledStroke = baseDarker4;/g, replace: env => `enabledStroke = ${q( env.phet.colors.buttonStroke )};`, optional: true },
      { find: /enabledStroke = baseColor\.colorUtilsDarker\( 0\.4 \);/g, replace: env => `enabledStroke = ${q( env.phet.colors.buttonStroke )};`, optional: true }
    ]
  },
  {
    id: 'theme-radio-selected-stroke',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/buttons/RectangularRadioButtonGroup.ts', 'js/buttons/RectangularRadioButtonGroup.js' ],
    required: false,
    why: 'The selected radio button was outlined in black and the others in dark grey; they get the accent color and the faint token line (widths unchanged).',
    edits: [
      { find: /selectedStroke: 'black'/, replace: env => `selectedStroke: ${q( env.phet.colors.selectedStroke )}` },
      { find: /new Color\( 50, 50, 50 \)/g, replace: env => `new Color( ${q( env.phet.colors.componentStroke )} )`, optional: true }
    ]
  },
  {
    id: 'theme-phet-color-scheme',
    kind: 'theme',
    repo: 'scenery-phet',
    files: [ 'js/PhetColorScheme.ts', 'js/PhetColorScheme.js' ],
    required: true,
    why: 'Reset-all button (orange) and the yellow zoom/button color -> tokens. Physical colors of the scheme are left alone; the 5 oldest families have no BUTTON_YELLOW.',
    edits: [
      { find: /RESET_ALL_BUTTON_BASE_COLOR: new Color\( 247, 151, 34 \)/, replace: env => `RESET_ALL_BUTTON_BASE_COLOR: new Color( ${q( env.phet.colors.resetAllButton )} )` },
      { find: /BUTTON_YELLOW: PHET_LOGO_YELLOW/, replace: env => `BUTTON_YELLOW: new Color( ${q( env.phet.colors.zoomButton )} )`, optional: true }
    ]
  },
  {
    id: 'theme-shaded-sphere-flat',
    kind: 'theme',
    repo: 'scenery-phet',
    files: [ 'js/ShadedSphereNode.ts', 'js/ShadedSphereNode.js' ],
    required: true,
    why: 'ShadedSphereNode fills with its main color instead of a highlight-to-shadow radial gradient (size and position unchanged).',
    edits: [ { find: /(this\.fill|options\.fill) = new RadialGradient\([^;]*;/, replace: ( env, m, target ) => `${target} = options.mainColor;` } ]
  },
  {
    id: 'theme-shaded-rectangle-flat',
    kind: 'theme',
    repo: 'scenery-phet',
    files: [ 'js/ShadedRectangle.ts', 'js/ShadedRectangle.js' ],
    required: true,
    why: 'ShadedRectangle paints all of its layers with the base color (the layers stay in the node tree, so no node is added or removed) and the pickable outline child is filled with it instead of stroked with a dark derived color.',
    edits: [
      { find: /this\.addChild\( darkCorner \);/, replace: 'this.addChild( darkCorner );\n    horizontalNode.fill = options.baseColor;\n    verticalNode.fill = options.baseColor;\n    lightCorner.fill = options.baseColor;\n    darkCorner.fill = options.baseColor;' },
      { find: /stroke: new DerivedProperty\( \[ rightColorProperty \],[\s\S]*?withAlpha\( 0\.4 \);\s*\} \)(?: \))?(?=\s*\} \);)/, replace: 'fill: options.baseColor', optional: true },
      { find: /stroke: rightColor\.withAlpha\( 0\.4 \)/, replace: 'fill: options.baseColor', optional: true }
    ]
  },
  {
    id: 'theme-accordion-box',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/AccordionBox.ts', 'js/AccordionBox.js' ],
    required: true,
    why: 'AccordionBox default fill (grey) and stroke (black) -> white card with a faint line.',
    edits: [
      { find: /fill: 'rgb\( 238, 238, 238 \)',/, replace: env => `fill: ${q( env.phet.colors.componentFill )},` },
      { find: /stroke: 'black',/, replace: env => `stroke: ${q( env.phet.colors.componentStroke )},` }
    ]
  },
  {
    id: 'theme-combo-box',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/ComboBox.ts', 'js/ComboBox.js', 'js/ComboBoxButton.ts', 'js/ComboBoxButton.js', 'js/ComboBoxListBox.ts', 'js/ComboBoxListBox.js', 'js/ComboBoxListItemNode.ts', 'js/ComboBoxListItemNode.js' ],
    match: 'all',
    required: true,
    why: 'ComboBox, its button and list: white cards, faint lines, token highlight (defaults only).',
    edits: [
      { find: /(buttonFill|listFill|baseColor): 'white'/g, replace: ( env, m, key ) => `${key}: ${q( env.phet.colors.componentFill )}`, optional: true },
      { find: /(buttonStroke|listStroke): 'black'/g, replace: ( env, m, key ) => `${key}: ${q( env.phet.colors.componentStroke )}`, optional: true },
      { find: /(highlightFill|itemHighlightFill): 'rgb\(\s*245,\s*245,\s*245\s*\)'/g, replace: ( env, m, key ) => `${key}: ${q( env.phet.colors.componentHighlight )}`, optional: true },
      { find: /arrowFill: 'black'/g, replace: env => `arrowFill: ${q( env.phet.colors.componentText )}`, optional: true }
    ]
  },
  {
    id: 'theme-carousel',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/Carousel.ts', 'js/Carousel.js' ],
    required: true,
    why: 'Carousel defaults: white card, faint line and separators, flat grey next/previous buttons, near-black arrows.',
    edits: [
      { find: /(arrowStroke|stroke): 'black'(?=,?\s*(?:\/\/[^\n]*)?\n\s*lineWidth: 3)/g, replace: ( env, m, key ) => `${key}: ${q( env.phet.colors.componentText )}`, optional: true },
      { find: /arrowStroke: 'black'/g, replace: env => `arrowStroke: ${q( env.phet.colors.componentText )}`, optional: true },
      { find: /fill: 'white'/, replace: env => `fill: ${q( env.phet.colors.componentFill )}`, optional: true },
      { find: /stroke: 'black'/g, replace: env => `stroke: ${q( env.phet.colors.componentStroke )}`, optional: true },
      { find: /(baseColor|buttonColor): 'rgba\(\s*200,\s*200,\s*200,\s*0\.5\s*\)'/g, replace: ( env, m, key ) => `${key}: ${q( env.phet.colors.componentHighlight )}`, optional: true },
      { find: /(stroke|separatorColor): 'rgb\(\s*180,\s*180,\s*180\s*\)'/g, replace: ( env, m, key ) => `${key}: ${q( env.phet.colors.componentStroke )}`, optional: true }
    ]
  },
  {
    id: 'theme-carousel-button',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/buttons/CarouselButton.ts', 'js/buttons/CarouselButton.js' ],
    required: true,
    why: 'Carousel next/previous buttons: flat light fill, near-black arrow instead of pure black.',
    edits: [
      { find: /(arrowStroke|stroke): 'black'/g, replace: ( env, m, key ) => `${key}: ${q( env.phet.colors.componentText )}` },
      { find: /baseColor: 'rgba\(\s*200,\s*200,\s*200,\s*0\.5\s*\)'/, replace: env => `baseColor: ${q( env.phet.colors.componentHighlight )}` }
    ]
  },
  {
    id: 'theme-expand-collapse-button',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/ExpandCollapseButton.ts', 'js/ExpandCollapseButton.js' ],
    required: true,
    why: 'Expand (green +) and collapse (orange -) buttons of accordion boxes -> accent / muted token; box outline -> faint line.',
    edits: [
      { find: /expanded \? 'rgb\( 255, 85, 0 \)' : 'rgb\( 0, 179, 0 \)'/, replace: env => `expanded ? ${q( env.phet.colors.componentMuted )} : ${q( env.phet.colors.componentAccent )}`, optional: true },
      { find: /fill: 'rgb\( 255, 85, 0 \)'/g, replace: env => `fill: ${q( env.phet.colors.componentMuted )}`, optional: true },
      { find: /fill: 'rgb\(0, 179, 0 \)'/g, replace: env => `fill: ${q( env.phet.colors.componentAccent )}`, optional: true },
      { find: /stroke: 'black'/, replace: env => `stroke: ${q( env.phet.colors.componentStroke )}`, optional: true }
    ]
  },
  {
    id: 'theme-arrow-button',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/buttons/ArrowButton.ts', 'js/buttons/ArrowButton.js' ],
    required: false,
    why: 'ArrowButton (the little left/right/up/down buttons of sliders and pickers): white card with a faint line and a near-black arrow instead of a black outline (line width and arrow size unchanged).',
    edits: [
      { find: /baseColor: 'white'/, replace: env => `baseColor: ${q( env.phet.colors.componentFill )}` },
      { find: /stroke: 'black'/, replace: env => `stroke: ${q( env.phet.colors.componentStroke )}` },
      { find: /arrowFill: 'black'/, replace: env => `arrowFill: ${q( env.phet.colors.componentText )}` }
    ]
  },
  {
    id: 'theme-page-control',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/PageControl.ts', 'js/PageControl.js' ],
    required: false,
    why: 'PageControl dots (grey) -> faint token line / near-black current page.',
    edits: [
      { find: /pageFill: 'rgb\(\s*200,\s*200,\s*200\s*\)'/, replace: env => `pageFill: ${q( env.phet.colors.componentStroke )}`, optional: true },
      { find: /currentPageFill: 'black'/, replace: env => `currentPageFill: ${q( env.phet.colors.componentText )}`, optional: true }
    ]
  },
  {
    id: 'theme-slider-track',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/Slider.ts', 'js/Slider.js', 'js/HSlider.js', 'js/HSliderTrack.js', 'js/DefaultSliderTrack.ts', 'js/DefaultSliderTrack.js', 'js/SliderThumb.ts', 'js/SliderThumb.js' ],
    match: 'all',
    required: true,
    why: 'Slider track defaults (and the thumb outline): light groove with a faint line instead of white with a black outline.',
    edits: [
      { find: /trackFillEnabled: 'white'/, replace: env => `trackFillEnabled: ${q( env.phet.colors.componentHighlight )}`, optional: true },
      { find: /trackStroke: 'black'/, replace: env => `trackStroke: ${q( env.phet.colors.componentStroke )}`, optional: true },
      { find: /thumbStroke: 'black'/, replace: env => `thumbStroke: ${q( env.phet.colors.componentStroke )}`, optional: true },
      { find: /^(\s*)stroke: 'black',/m, replace: ( env, m, ws ) => `${ws}stroke: ${q( env.phet.colors.componentStroke )},`, optional: true }
    ]
  },
  {
    id: 'theme-spectrum-slider',
    kind: 'theme',
    repo: 'scenery-phet',
    files: [ 'js/SpectrumSlider.ts', 'js/SpectrumSlider.js' ],
    required: false,
    why: 'SpectrumSlider chrome only: the black track border and cursor line become a faint line and the near-black text color. The wavelength colors of the bar are physics and stay.',
    edits: [
      { find: /trackBorderStroke: 'black'/, replace: env => `trackBorderStroke: ${q( env.phet.colors.componentStroke )}` },
      { find: /cursorStroke: 'black'/, replace: env => `cursorStroke: ${q( env.phet.colors.componentText )}` }
    ]
  },
  {
    id: 'theme-number-picker',
    kind: 'theme',
    repo: 'sun',
    files: [ 'js/NumberPicker.ts', 'js/NumberPicker.js' ],
    required: false,
    why: 'NumberPicker defaults: white box with a faint line, near-black arrows, accent (was pure blue) highlight.',
    edits: [
      { find: /arrowStroke: 'black'/, replace: env => `arrowStroke: ${q( env.phet.colors.componentText )}`, optional: true },
      { find: /backgroundColor: 'white'/, replace: env => `backgroundColor: ${q( env.phet.colors.componentFill )}`, optional: true },
      { find: /backgroundStroke: 'gray'/, replace: env => `backgroundStroke: ${q( env.phet.colors.componentStroke )}`, optional: true },
      { find: /color: new Color\( 0, 0, 255 \)/, replace: env => `color: new Color( ${q( env.phet.colors.componentAccent )} )`, optional: true }
    ]
  },
  {
    id: 'theme-number-display',
    kind: 'theme',
    repo: 'scenery-phet',
    files: [ 'js/NumberDisplay.ts', 'js/NumberDisplay.js' ],
    required: true,
    why: 'NumberDisplay defaults: white box with a faint line instead of a light-grey outline (corner radius and sizes unchanged).',
    edits: [
      { find: /backgroundFill: 'white'/, replace: env => `backgroundFill: ${q( env.phet.colors.componentFill )}` },
      { find: /backgroundStroke: 'lightGray'/, replace: env => `backgroundStroke: ${q( env.phet.colors.componentStroke )}` }
    ]
  },
  {
    id: 'theme-probe-node',
    kind: 'theme',
    repo: 'scenery-phet',
    files: [ 'js/ProbeNode.ts', 'js/ProbeNode.js' ],
    required: true,
    why: 'ProbeNode glass colors (light blue gradient stops) and black outline -> one flat token tone and a near-black line.',
    edits: [
      { find: /centerColor: 'white'/, replace: env => `centerColor: ${q( env.phet.colors.componentFill )}` },
      { find: /middleColor: '[#]E6F5FF'/, replace: env => `middleColor: ${q( env.phet.colors.componentFill )}` },
      { find: /edgeColor: '[#]C2E7FF'/, replace: env => `edgeColor: ${q( env.phet.colors.componentHighlight )}` },
      { find: /stroke: 'black'/, replace: env => `stroke: ${q( env.phet.colors.componentText )}` }
    ]
  }
];
