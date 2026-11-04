// Theme patches: common-code colors and fonts only (navbar, home screen, buttons, panels, checkboxes,
// sliders, PhetFont). Experiment-screen layout, per-sim colors with physical meaning and physics are
// never touched. Each `find` is PhET's ORIGINAL value written as an escaped regex; every replacement
// value comes from theme/tokens.json through ctx.phet (see theme/index.mjs toPhetTheme).
//
// The anchors were checked against all 63 pinned dependency sets with `node theme/patches/dry-run.mjs`
// (one row per "SHA family" = distinct file blob); rules marked optional do not exist in old families.

/** @param {string} v */
const q = v => JSON.stringify( v );

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
  }
];
