// Drawer adapter for quantum-measurement (PhET 1.0). Reads and sets state only. Conventions verified in the
// PhET source (release branch 1.0):
//   - Photons: the laser's polarization angle θ is measured from the horizontal (0° = horizontal, 90° =
//     vertical). PolarizingBeamSplitter reflects to the vertical detector with probability 1 − cos²θ, so a
//     photon reaches the horizontal detector with probability cos²θ. The sim's own value is
//     normalizedExpectationValueProperty = P(V) − P(H) = 1 − 2cos²θ, and passProbability = (1 − that) / 2.
//   - Spin (Stern–Gerlach): SternGerlach.calculateProbability = (s·m + 1) / 2 = cos²(θ/2), with θ the angle
//     between the prepared spin (Bloch vector in the x–z plane) and the apparatus axis. probabilityUp is the
//     first apparatus' upProbabilityProperty. α, β are in the z basis as the preparation panel shows them:
//     α = √((s_z + 1) / 2).
//   - Bloch sphere: ComplexBlochSphere.measure() gives "up" with probability (1 + s·m) / 2 = cos²(θ/2). The model
//     stores no probability, so the adapter evaluates that same rule from the prepared angles (it is null while
//     the magnetic field is on, because the state then precesses before the measurement). α, |β| are in the
//     equation basis, as BlochSphereNumericalEquationNode shows them.
//   - Coins: upProbabilityProperty is the bias (classical) or |α|² (quantum coins).
const drawer = globalThis.bsshsDrawer;

const DEG = 180 / Math.PI;
const ns = () => ( window.phet && window.phet.quantumMeasurement ) || {};
const clamp1 = x => Math.max( -1, Math.min( 1, x ) );
const sqrt0 = x => Math.sqrt( Math.max( 0, x ) );
const fraction = ( a, b ) => ( a + b > 0 ? a / ( a + b ) : null );
/** Unit vector from Bloch polar/azimuthal angles (StateDirection.anglesToVector). */
const blochVector = ( polar, azimuth ) => [ Math.sin( polar ) * Math.cos( azimuth ), Math.sin( polar ) * Math.sin( azimuth ), Math.cos( polar ) ];
const dot3 = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];

const KEYS = [ 'probabilityUp', 'probabilityDown', 'upCount', 'downCount', 'measuredUpFraction', 'probabilityZero',
  'probabilityOne', 'amplitudeZero', 'amplitudeOne', 'measurementAngle', 'polarizationAngle', 'passProbability',
  'horizontalDetections', 'verticalDetections', 'measuredPassFraction' ];
const EMPTY = () => Object.fromEntries( KEYS.map( k => [ k, null ] ) );

/** Which screen a model belongs to. */
function kind( m ) {
  if ( !m ) { return null; }
  if ( m.quantumCoinExperimentSceneModel ) { return 'coins'; }
  if ( m.singlePhotonSceneModel ) { return 'photons'; }
  if ( m.sternGerlachs ) { return 'spin'; }
  if ( m.preparationBlochSphere ) { return 'bloch'; }
  return null;
}

function setAmplitudes( out, p0 ) {
  out.probabilityZero = p0;
  out.probabilityOne = 1 - p0;
  out.amplitudeZero = sqrt0( p0 );
  out.amplitudeOne = sqrt0( 1 - p0 );
}

function readCoins( m, out ) {
  const quantum = m.experimentModeProperty.value === m.quantumCoinExperimentSceneModel.systemType;
  const scene = quantum ? m.quantumCoinExperimentSceneModel : m.classicalCoinExperimentSceneModel;
  const p = scene.upProbabilityProperty.value;
  out.probabilityUp = p;
  out.probabilityDown = 1 - p;
  if ( quantum ) { setAmplitudes( out, p ); }
  const set = scene.coinSet;
  if ( set.measurementStateProperty.value === 'revealed' ) {
    const n = set.numberOfCoinsProperty.value;
    let up = 0;
    for ( let i = 0; i < n; i++ ) {
      const v = set.measuredValues[ i ];
      if ( v === 'heads' || v === 'up' ) { up++; }
    }
    out.upCount = up;
    out.downCount = n - up;
    out.measuredUpFraction = fraction( up, n - up );
  }
}

function photonScene( m ) {
  return m.experimentModeProperty.value === m.singlePhotonSceneModel.laser.emissionMode ?
         m.singlePhotonSceneModel : m.manyPhotonsExperimentSceneModel;
}

function readPhotons( m, out ) {
  const scene = photonScene( m );
  out.polarizationAngle = scene.laser.polarizationAngleProperty.value;
  const e = scene.normalizedExpectationValueProperty.value;
  out.passProbability = e === null ? null : ( 1 - e ) / 2;
  const single = scene === m.singlePhotonSceneModel;
  const val = d => ( single ? d.detectionCountProperty.value : d.detectionRateProperty.value );
  const h = val( scene.horizontalPolarizationDetector );
  const v = val( scene.verticalPolarizationDetector );
  out.horizontalDetections = h;
  out.verticalDetections = v;
  out.measuredPassFraction = fraction( h, v );
}

function readSpin( m, out ) {
  const sg = m.sternGerlachs[ 0 ];
  const s = m.derivedSpinStateProperty.value; // ( x, z ) components of the Bloch vector
  const len = Math.hypot( s.x, s.y ) || 1;
  const axis = sg.isZOrientedProperty.value ? [ 0, 1 ] : [ 1, 0 ];
  out.measurementAngle = Math.acos( clamp1( ( s.x * axis[ 0 ] + s.y * axis[ 1 ] ) / len ) ) * DEG;
  out.probabilityUp = sg.upProbabilityProperty.value;
  out.probabilityDown = 1 - out.probabilityUp;
  out.upCount = sg.upCounterProperty.value;
  out.downCount = sg.downCounterProperty.value;
  out.measuredUpFraction = fraction( out.upCount, out.downCount );
  setAmplitudes( out, ( s.y / len + 1 ) / 2 );
}

function readBloch( m, out ) {
  const sphere = m.preparationBlochSphere;
  const state = blochVector( sphere.polarAngleProperty.value, sphere.azimuthalAngleProperty.value );
  const ax = m.measurementAxisProperty.value;
  if ( !m.magneticFieldEnabledProperty.value ) {
    const d = clamp1( dot3( state, blochVector( ax.polarAngle, ax.azimuthalAngle ) ) );
    out.measurementAngle = Math.acos( d ) * DEG;
    out.probabilityUp = ( 1 + d ) / 2;
    out.probabilityDown = 1 - out.probabilityUp;
  }
  const basis = m.equationBasisProperty.value;
  if ( basis && typeof basis.polarAngle === 'number' ) {
    setAmplitudes( out, ( 1 + clamp1( dot3( state, blochVector( basis.polarAngle, basis.azimuthalAngle ) ) ) ) / 2 );
  }
  out.upCount = m.upMeasurementCountProperty.value;
  out.downCount = m.downMeasurementCountProperty.value;
  out.measuredUpFraction = fraction( out.upCount, out.downCount );
}

const frames = n => new Promise( r => {
  const tick = () => ( --n <= 0 ? r() : requestAnimationFrame( tick ) );
  requestAnimationFrame( tick );
} );

drawer.register( {
  simId: 'quantum-measurement',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const out = EMPTY();
    const m = drawer.helpers.model();
    const k = kind( m );
    if ( k === 'coins' ) { readCoins( m, out ); }
    else if ( k === 'photons' ) { readPhotons( m, out ); }
    else if ( k === 'spin' ) { readSpin( m, out ); }
    else if ( k === 'bloch' ) { readBloch( m, out ); }
    return out;
  },
  /**
   * Automated checks only. params.screen: 'coins' { quantum, upProbability } | 'photons' { polarizationAngle
   * (custom preset) or preset } | 'spin' { experiment: 1–6 | 'custom', spin: 'Z_PLUS'|'X_PLUS'|'Z_MINUS',
   * alphaSquared } | 'bloch' { polarAngle, azimuthalAngle (degrees), axis: 'X'|'Y'|'Z' }.
   */
  async apply( params ) {
    const sim = drawer.helpers.sim();
    if ( !sim ) { throw new Error( 'sim not ready' ); }
    const sc = sim.screens.find( s => {
      let m = null;
      try { m = s.model; }
      catch ( e ) { m = null; }
      return kind( m ) === params.screen;
    } );
    if ( !sc ) { throw new Error( `screen ${params.screen} not found` ); }
    sim.selectedScreenProperty.value = sc;
    await frames( 3 );
    const m = sc.model;
    const Q = ns();
    if ( params.screen === 'coins' ) {
      const scene = params.quantum ? m.quantumCoinExperimentSceneModel : m.classicalCoinExperimentSceneModel;
      m.experimentModeProperty.value = scene.systemType;
      if ( 'upProbability' in params ) { scene.upProbabilityProperty.value = params.upProbability; }
    }
    else if ( params.screen === 'photons' ) {
      const scene = photonScene( m );
      scene.isPlayingProperty.value = false;
      if ( 'polarizationAngle' in params ) {
        scene.laser.presetPolarizationDirectionProperty.value = 'custom';
        scene.laser.customPolarizationAngleProperty.value = params.polarizationAngle;
      }
      else if ( params.preset ) { scene.laser.presetPolarizationDirectionProperty.value = params.preset; }
    }
    else if ( params.screen === 'spin' ) {
      if ( 'experiment' in params ) {
        const name = params.experiment === 'custom' ? 'CUSTOM' : `EXPERIMENT_${params.experiment}`;
        if ( !Q.SpinExperiment || !Q.SpinExperiment[ name ] ) { throw new Error( `no SpinExperiment.${name}` ); }
        m.experimentProperty.value = Q.SpinExperiment[ name ];
      }
      if ( params.spin ) { m.particleSourceModel.spinStateProperty.value = Q.SpinDirection[ params.spin ]; }
      if ( 'alphaSquared' in params ) { m.alphaSquaredProperty.value = params.alphaSquared; }
    }
    else if ( params.screen === 'bloch' ) {
      if ( 'polarAngle' in params ) { m.preparationBlochSphere.polarAngleProperty.value = params.polarAngle / DEG; }
      if ( 'azimuthalAngle' in params ) { m.preparationBlochSphere.azimuthalAngleProperty.value = params.azimuthalAngle / DEG; }
      if ( params.axis ) { m.measurementAxisProperty.value = Q.MeasurementAxis[ `${params.axis}_PLUS` ]; }
    }
    await frames( 2 );
  }
} );
