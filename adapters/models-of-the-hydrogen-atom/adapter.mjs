// Drawer adapter for models-of-the-hydrogen-atom (PhET 1.0). Reads and sets state only; the physics is PhET's:
//   - level energy: QuantumElectron.energyProperty (eV, E1 / n² with E1 = −13.6 eV);
//   - transition wavelength: PhotonAbsorptionModel.getTransitionWavelength(n1, n2) (nm), the same table the
//     sim uses for every photon it absorbs or emits (1240 / (13.6 (1/n1² − 1/n2²)), rounded to 1 nm).
// "Last transition" = the last change of n of the selected quantum atom (photon absorption, spontaneous or
// stimulated emission, or the Schrödinger "excite" button). Changes made by a reset are ignored and clear it.
// Classical models (billiard ball, plum pudding, classical solar system) and the hidden "experiment" have no
// n, so their atom quantities read null. The frequency is c / λ of PhET's wavelength (derived, shown only here).
const drawer = globalThis.bsshsDrawer;

const SPEED_OF_LIGHT = 299792458; // m/s
const M_PER_NM = 1e-9;

/** @type {Map<object, {from:number,to:number,eFrom:number,eTo:number}>} last n change per atomic model */
const lastTransition = new Map();
/** @type {Map<object, number>} level energy before the current n, per atomic model */
const prevEnergy = new Map();
const attachedAtoms = new Set();

const absorptionModel = () => {
  const ns = window.phet && window.phet.modelsOfTheHydrogenAtom;
  return ns && ns.PhotonAbsorptionModel ? ns.PhotonAbsorptionModel.instance : null;
};

/** Listens to n of every quantum atomic model on every screen (once per atom). */
function attach() {
  const sim = drawer.helpers.sim();
  if ( !sim || !sim.screens ) { return; }
  for ( const sc of sim.screens ) {
    let m = null;
    try { m = sc.model; }
    catch ( e ) { m = null; }
    if ( !m || !m.atomicModels ) { continue; }
    for ( const atom of m.atomicModels ) {
      const e = atom.electron;
      if ( attachedAtoms.has( atom ) || !atom.isQuantum || !e || !e.nProperty || !e.energyProperty ) { continue; }
      attachedAtoms.add( atom );
      prevEnergy.set( atom, e.energyProperty.value );
      // energyProperty derives from nProperty and was linked first, so it already holds the new energy here.
      e.nProperty.lazyLink( ( nNew, nOld ) => {
        const eNew = e.energyProperty.value;
        const eOld = prevEnergy.get( atom );
        prevEnergy.set( atom, eNew );
        if ( typeof atom.isResetting === 'function' && atom.isResetting() ) { lastTransition.delete( atom ); return; }
        if ( nNew !== nOld ) { lastTransition.set( atom, { from: nOld, to: nNew, eFrom: eOld, eTo: eNew } ); }
      } );
      if ( atom.resetEmitter ) {
        atom.resetEmitter.addListener( () => {
          lastTransition.delete( atom );
          prevEnergy.set( atom, e.energyProperty.value );
        } );
      }
    }
  }
}

// Attach as soon as the sim exists, so transitions before the drawer is first opened are kept.
const attachTimer = setInterval( () => {
  try {
    attach();
    if ( attachedAtoms.size ) { clearInterval( attachTimer ); }
  }
  catch ( e ) { /* sim still constructing */ }
}, 200 );

/** The selected screen's model, or null on the home screen. */
const model = () => {
  const m = drawer.helpers.model();
  return m && m.hydrogenAtomProperty ? m : null;
};

const frames = n => new Promise( r => {
  const tick = () => ( --n <= 0 ? r() : requestAnimationFrame( tick ) );
  requestAnimationFrame( tick );
} );

const EMPTY = () => ( {
  principalQuantumNumber: null, levelEnergy: null, inverseNSquared: null,
  upperQuantumNumber: null, lowerQuantumNumber: null, upperLevelEnergy: null, lowerLevelEnergy: null,
  photonEnergy: null, wavelength: null, frequency: null, rydbergTerm: null, lightWavelength: null
} );

drawer.register( {
  simId: 'models-of-the-hydrogen-atom',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const out = EMPTY();
    const m = model();
    if ( !m ) { return out; }
    attach();
    const ls = m.lightSource;
    if ( ls && ls.lightModeProperty.value === 'monochromatic' ) { out.lightWavelength = ls.monochromaticWavelengthProperty.value; }
    if ( m.modelOrExperimentProperty.value !== 'model' ) { return out; }
    const atom = m.atomicModelProperty.value;
    const e = atom && atom.electron;
    if ( !atom || !atom.isQuantum || !e || !e.nProperty || !e.energyProperty ) { return out; }
    const n = e.nProperty.value;
    out.principalQuantumNumber = n;
    out.levelEnergy = e.energyProperty.value;
    out.inverseNSquared = 1 / ( n * n );
    const t = lastTransition.get( atom );
    if ( t ) {
      const up = Math.max( t.from, t.to );
      const lo = Math.min( t.from, t.to );
      const eUp = t.from > t.to ? t.eFrom : t.eTo;
      const eLo = t.from > t.to ? t.eTo : t.eFrom;
      out.upperQuantumNumber = up;
      out.lowerQuantumNumber = lo;
      out.upperLevelEnergy = eUp;
      out.lowerLevelEnergy = eLo;
      out.photonEnergy = eUp - eLo;
      out.rydbergTerm = 1 / ( lo * lo ) - 1 / ( up * up );
      const pam = absorptionModel();
      if ( pam ) {
        const lambda = pam.getTransitionWavelength( t.from, t.to );
        out.wavelength = lambda;
        out.frequency = SPEED_OF_LIGHT / ( lambda * M_PER_NM );
      }
    }
    return out;
  },
  /**
   * Automated checks only. params: screen ('spectra'|'energyLevels'), atom ('bohr'|'deBroglie'|'schrodinger'),
   * and one of n (set the level), from + to (two level changes, recorded as the transition from → to) or
   * spontaneousFrom (set that level, run the sim until PhET's own spontaneous emission lowers it, pause).
   */
  async apply( params ) {
    const sim = drawer.helpers.sim();
    if ( !sim ) { throw new Error( 'sim not ready' ); }
    attach();
    const wantSpectra = params.screen === 'spectra';
    const sc = sim.screens.find( s => {
      let m = null;
      try { m = s.model; }
      catch ( e ) { m = null; }
      return m && m.bohrModel && ( wantSpectra ? !!m.billiardBallModel : !m.billiardBallModel );
    } );
    if ( !sc ) { throw new Error( `screen ${params.screen} not found` ); }
    sim.selectedScreenProperty.value = sc;
    await frames( 3 );
    const m = sc.model;
    m.isPlayingProperty.value = false;
    m.modelOrExperimentProperty.value = 'model';
    const atom = m[ `${params.atom || 'bohr'}Model` ];
    if ( !atom ) { throw new Error( `atomic model ${params.atom} not found` ); }
    m.atomicModelProperty.value = atom;
    await frames( 2 );
    const e = atom.electron;
    if ( 'n' in params && e.nProperty.value !== params.n ) { e.set_n( params.n ); }
    if ( 'from' in params ) {
      if ( e.nProperty.value !== params.from ) { e.set_n( params.from ); }
      e.set_n( params.to );
    }
    if ( 'spontaneousFrom' in params ) {
      if ( e.nProperty.value !== params.spontaneousFrom ) { e.set_n( params.spontaneousFrom ); }
      m.isPlayingProperty.value = true;
      const t0 = performance.now();
      while ( e.nProperty.value >= params.spontaneousFrom ) {
        if ( performance.now() - t0 > 20000 ) { throw new Error( 'no spontaneous emission within 20 s' ); }
        await frames( 1 );
      }
      m.isPlayingProperty.value = false;
    }
    await frames( 2 );
  }
} );
