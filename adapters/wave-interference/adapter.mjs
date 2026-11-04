// Class drawer adapter for wave-interference (PhET 2.0.21, 2019 joist). Reads the model only; see
// docs/drawer.md.
//
// Model facts (verified in the built sim and in js/common/model/Scene.js, LightScene.js,
// IntensitySample.js, Lattice.js, js/waves/model/WavesModel.js):
//   - this joist has showHomeScreenProperty + screenIndexProperty instead of selectedScreenProperty;
//     drawer.helpers.screen()/isHomeScreen() handle that;
//   - screens: 파동 (Waves, 1 source), 간섭 (Interference, 2 point sources), 슬릿 (Slits, plane wave and a
//     barrier), 회절 (Diffraction, out of scope here). Each wave screen has water / sound / light scenes
//     (model.sceneProperty); positions are in scene units: light nm, water and sound cm;
//   - wavelength = scene.getWavelength() = waveSpeed / frequency;
//   - the waves live on a 151×151 lattice with 20 damping cells per side; scene.modelToLatticeTransform maps
//     0..waveAreaWidth to the visible cells. The screen is lattice.getOutputColumn(): the average of
//     columns width − dampX − 1 and − 2. The barrier column is scene.barrierLatticeCoordinateProperty;
//     the point sources sit in column WaveInterferenceConstants.POINT_SOURCE_HORIZONTAL_COORDINATE;
//   - light only: scene.intensitySample.getIntensityValues() = time-averaged intensity on the screen
//     (the sim's screen and intensity graph), one value per visible lattice row.
// The fringe spacing is measured on that intensity: the bright fringe nearest the centre and its two
// neighbours, each refined by a parabola through 3 samples; spacing = (right − left) / 2.
const drawer = globalThis.bsshsDrawer;
const NM_PER = { nm: 1, cm: 1e7 };
const EDGE_CELLS = 3; // ignore maxima this close to the screen ends (damping-region artefacts)
const MIN_PEAK = 0.05; // ignore maxima below 5 % of the brightest sample

function sim() { return drawer.helpers.sim(); }
function isHome() { return !sim() || drawer.helpers.isHomeScreen(); }
function currentScreen() { return isHome() ? null : drawer.helpers.screen(); }
const isWaveModel = m => !!( m && m.sceneProperty && m.lightScene );

/** Korean name of a scene of a wave screen. */
function sceneName( m ) {
  const sc = m.sceneProperty.value;
  return sc === m.lightScene ? '빛' : sc === m.waterScene ? '물' : sc === m.soundScene ? '소리' : '';
}

const constants = () => ( window.phet && phet.waveInterference && phet.waveInterference.WaveInterferenceConstants ) || null;

/** x (scene units) of the screen column read by the intensity sample. */
function screenX( sc ) {
  const L = sc.lattice;
  return sc.modelToLatticeTransform.viewToModelX( L.width - L.dampX - 1.5 );
}

/** Fringe spacing in lattice cells from an intensity profile, or null. */
function fringeCells( I ) {
  const n = I.length;
  if ( n < 2 * EDGE_CELLS + 3 ) { return null; }
  let max = 0;
  for ( const v of I ) { if ( v > max ) { max = v; } }
  if ( !( max > 0 ) ) { return null; }
  const peaks = [];
  for ( let i = Math.max( 1, EDGE_CELLS ); i < n - Math.max( 1, EDGE_CELLS ); i++ ) {
    if ( I[ i ] >= I[ i - 1 ] && I[ i ] > I[ i + 1 ] && I[ i ] > MIN_PEAK * max ) {
      const den = I[ i - 1 ] - 2 * I[ i ] + I[ i + 1 ];
      peaks.push( i + ( den !== 0 ? 0.5 * ( I[ i - 1 ] - I[ i + 1 ] ) / den : 0 ) );
    }
  }
  const centre = ( n - 1 ) / 2;
  let k = -1;
  peaks.forEach( ( x, j ) => { if ( k < 0 || Math.abs( x - centre ) < Math.abs( peaks[ k ] - centre ) ) { k = j; } } );
  if ( k < 1 || k > peaks.length - 2 || Math.abs( peaks[ k ] - centre ) > 2 ) { return null; }
  return ( peaks[ k + 1 ] - peaks[ k - 1 ] ) / 2;
}

function read() {
  const screen = currentScreen();
  const m = screen && screen.model;
  if ( !m ) { return {}; }
  if ( !isWaveModel( m ) ) {
    // Diffraction screen: only the laser wavelength (nm) is comparable.
    return m.wavelengthProperty ? { wavelength: m.wavelengthProperty.value } : {};
  }
  const sc = m.sceneProperty.value;
  const toNm = NM_PER[ sc.positionUnits ] || null;
  if ( toNm === null ) { return {}; }
  const T = sc.modelToLatticeTransform;
  const out = { wavelength: sc.getWavelength() * toNm };
  let sourceX = null;
  let twoSources = false;
  if ( sc.barrierTypeProperty ) { // Slits screen
    const type = String( sc.barrierTypeProperty.value );
    if ( type !== 'NO_BARRIER' ) {
      sourceX = T.viewToModelX( sc.barrierLatticeCoordinateProperty.value );
      out.slitWidth = sc.slitWidthProperty.value * toNm;
    }
    if ( type === 'TWO_SLITS' ) {
      twoSources = true;
      out.slitSeparation = sc.slitSeparationProperty.value * toNm;
    }
  }
  else if ( sc.numberOfSources === 2 ) { // Interference screen
    const c = constants();
    twoSources = true;
    out.slitSeparation = sc.sourceSeparationProperty.value * toNm;
    if ( c ) { sourceX = T.viewToModelX( c.POINT_SOURCE_HORIZONTAL_COORDINATE ); }
  }
  if ( sourceX !== null ) { out.screenDistance = ( screenX( sc ) - sourceX ) * toNm; }
  if ( twoSources && sc.intensitySample ) {
    const cells = fringeCells( sc.intensitySample.getIntensityValues() );
    if ( cells !== null ) { out.fringeSpacing = cells * ( sc.waveAreaWidth / ( sc.lattice.width - 2 * sc.lattice.dampX ) ) * toNm; }
  }
  return out;
}

drawer.register( {
  simId: 'wave-interference',
  screenName() {
    if ( isHome() ) { return '홈 화면'; }
    const screen = currentScreen();
    if ( !screen ) { return ''; }
    const base = drawer.helpers.cleanName( typeof screen.name === 'string' ? screen.name :
                                           ( screen.nameProperty && screen.nameProperty.value ) || '' );
    const m = screen.model;
    return isWaveModel( m ) && sceneName( m ) ? `${base} · ${sceneName( m )}` : base;
  },
  read,
  /**
   * V3 only. params: { screen: 'slits'|'interference' (default slits), wavelength (nm) or frequency (1/fs),
   * slitSeparation (nm; Interference: source separation), slitWidth (nm), screenDistance (nm, Slits: moves
   * the barrier to the nearest lattice column), steps (default 700) }. Uses the light scene, two slits,
   * turns the light on, advances the model's own time step `steps` times, then leaves it paused.
   */
  apply( params ) {
    const s = sim();
    const index = s.screens.findIndex( x => x.model && ( params.screen === 'interference' ?
                                                         x.model.lightScene && x.model.lightScene.numberOfSources === 2 :
                                                         x.model.lightScene && x.model.lightScene.barrierTypeProperty ) );
    if ( index < 0 ) { throw new Error( 'wave-interference: screen not found' ); }
    if ( s.showHomeScreenProperty ) { s.showHomeScreenProperty.value = false; }
    if ( s.selectedScreenProperty ) { s.selectedScreenProperty.value = s.screens[ index ]; }
    else { s.screenIndexProperty.value = index; }
    const m = s.screens[ index ].model;
    const sc = m.lightScene;
    m.sceneProperty.value = sc;
    m.isRunningProperty.value = false;
    if ( sc.barrierTypeProperty ) {
      sc.barrierTypeProperty.value = sc.barrierTypeProperty.validValues.find( v => String( v ) === 'TWO_SLITS' );
      if ( 'slitSeparation' in params ) { sc.slitSeparationProperty.value = params.slitSeparation; }
      if ( 'slitWidth' in params ) { sc.slitWidthProperty.value = params.slitWidth; }
      if ( 'screenDistance' in params ) {
        const x = sc.modelToLatticeTransform.modelToViewX( screenX( sc ) - params.screenDistance );
        const p = sc.barrierLocationProperty.value;
        sc.barrierLocationProperty.value = new p.constructor( Math.round( x ), p.y );
      }
    }
    else if ( 'slitSeparation' in params ) { sc.sourceSeparationProperty.value = params.slitSeparation; }
    if ( 'frequency' in params ) { sc.frequencyProperty.value = params.frequency; }
    if ( 'wavelength' in params ) { sc.frequencyProperty.value = sc.waveSpeed / params.wavelength; }
    sc.clear();
    sc.button1PressedProperty.value = true;
    if ( sc.numberOfSources === 2 && !sc.barrierTypeProperty ) { sc.button2PressedProperty.value = true; }
    const steps = params.steps || 700;
    for ( let i = 0; i < steps; i++ ) { m.advanceTime( m.eventTimer.period, true ); }
  }
} );
