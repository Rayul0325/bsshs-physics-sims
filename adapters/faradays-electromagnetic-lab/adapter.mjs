// Class-drawer adapter for faradays-electromagnetic-lab (PhET 1.0, docs/drawer.md). It only reads the
// model, except apply(), which automated checks (tools/run-cases.mjs) use to put a screen into a fixed state.
//
// Model facts (faradays-electromagnetic-lab/js, verified against the 1.0.6 source):
//   - Each screen model has a ConstantDtClock: one step (DT = 1) per 1/25 s of real time; the
//     screen's parts listen to it. This adapter adds its own listener after them.
//   - PickupCoil.fluxProperty is the TOTAL flux N·Φ(one loop) (B in G × area in model units², a model
//     value); emfProperty = −Δ(N·Φ)/DT per step. The drawer shows Φ per loop and turns the EMF into a
//     per-second value (× 25) so that ε = −N ΔΦ/Δt holds with Δt in seconds.
//   - Electromagnet: strength (G) = (N / 4) · |normalized current| · 300 G, and the field inside the coil
//     equals that strength; normalized current = source voltage / maximum voltage (DC 10 V, AC 110 V).
//   - The light bulb and voltmeter show the normalized current emf/maxEMF, clamped to ±1.
const drawer = globalThis.bsshsDrawer;

const FPS = 25; // ConstantDtClock.FRAMES_PER_SECOND
const TICK = 1 / FPS; // s per clock step
const REST_TICKS = 25; // clock steps (1 s) without EMF before new EMF starts a new peak record

/** The induction (pickup) coil of a screen model, if it has one. */
const pickupOf = m => ( m && ( m.pickupCoil || ( m.transformer && m.transformer.pickupCoil ) ||
                               ( m.generator && m.generator.pickupCoil ) ) ) || null;
/** The electromagnet of a screen model, if it has one. */
const electromagnetOf = m => ( m && ( m.electromagnet || ( m.transformer && m.transformer.electromagnet ) ) ) || null;
/** The magnet whose strength the screen shows. */
const magnetOf = m => ( m && ( electromagnetOf( m ) || m.barMagnet || ( m.generator && m.generator.turbine.barMagnet ) ) ) || null;

/** Per-screen-model values the model does not keep, updated after every clock step. */
const states = new Map();
const stateOf = m => {
  let s = states.get( m );
  if ( !s ) {
    s = { ticks: 0, prevLoopFlux: null, prevTurns: null, rate: null, peak: 0, restTicks: Infinity, sig: '' };
    states.set( m, s );
  }
  return s;
};

/**
 * Settings that, when changed, start a new peak record on screens whose EMF never rests
 * (AC source, generator). Motion-driven screens start a new record when EMF resumes after a rest.
 */
function settingsSignature( m ) {
  const pc = pickupOf( m );
  const parts = pc ? [ pc.coil.numberOfLoopsProperty.value, pc.coil.loopAreaPercentProperty.value ] : [];
  const em = electromagnetOf( m );
  if ( em && em.currentSourceProperty.value === em.acPowerSupply ) {
    parts.push( 'ac', em.acPowerSupply.maxVoltagePercentProperty.value, em.acPowerSupply.frequencyPercentProperty.value,
      em.coil.numberOfLoopsProperty.value );
  }
  if ( m.generator ) {
    parts.push( 'gen', m.generator.turbine.waterFaucet.flowRatePercentProperty.value, m.generator.turbine.barMagnet.strengthPercentProperty.value );
  }
  return parts.join( '|' );
}

/** Seeds the "previous" sample so the next step yields a rate (after apply() sets a state). */
function seed( m ) {
  const s = stateOf( m );
  const pc = pickupOf( m );
  if ( pc ) {
    s.prevTurns = pc.coil.numberOfLoopsProperty.value;
    s.prevLoopFlux = pc.fluxProperty.value / s.prevTurns;
  }
  s.rate = null;
  s.peak = 0;
  s.restTicks = Infinity;
  s.sig = settingsSignature( m );
}

/** Called after every clock step of a screen model. */
function sample( m ) {
  const s = stateOf( m );
  s.ticks++;
  const pc = pickupOf( m );
  if ( !pc ) { return; }
  const n = pc.coil.numberOfLoopsProperty.value;
  const loopFlux = pc.fluxProperty.value / n;
  s.rate = ( s.prevLoopFlux === null || s.prevTurns !== n ) ? null : ( loopFlux - s.prevLoopFlux ) / TICK;
  s.prevLoopFlux = loopFlux;
  s.prevTurns = n;
  const emf = pc.emfProperty.value * FPS;
  const sig = settingsSignature( m );
  const continuous = !!m.generator || ( electromagnetOf( m ) && electromagnetOf( m ).currentSourceProperty.value === electromagnetOf( m ).acPowerSupply );
  if ( ( continuous && sig !== s.sig ) || ( emf !== 0 && s.restTicks >= REST_TICKS ) ) { s.peak = 0; }
  s.sig = sig;
  s.restTicks = emf !== 0 ? 0 : s.restTicks + 1;
  s.peak = Math.max( s.peak, Math.abs( emf ) );
}

let hooked = false;
/** Attaches a sampler to every screen's clock once the sim exists. @returns {boolean} */
function hook() {
  if ( hooked ) { return true; }
  const sim = drawer.helpers.sim();
  if ( !sim || !sim.screens || ( sim.isConstructionCompleteProperty && !sim.isConstructionCompleteProperty.value ) ) { return false; }
  const models = sim.screens.map( sc => sc.model ).filter( m => m && m.clock && m.clock.addListener );
  if ( !models.length ) { return false; }
  hooked = true;
  for ( const m of models ) {
    seed( m );
    m.clock.addListener( () => sample( m ) );
  }
  return true;
}
const hookTimer = setInterval( () => { if ( hook() ) { clearInterval( hookTimer ); } }, 250 );

drawer.register( {
  simId: 'faradays-electromagnetic-lab',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const m = drawer.helpers.model();
    if ( !m || !m.clock ) { return {}; }
    hook();
    const s = stateOf( m );
    const out = { time: s.ticks * TICK };
    const magnet = magnetOf( m );
    if ( magnet ) { out.magneticField = magnet.strengthProperty.value; }
    const em = electromagnetOf( m );
    if ( em ) {
      out.electromagnetTurns = em.coil.numberOfLoopsProperty.value;
      out.sourceVoltage = em.currentSourceProperty.value.voltageProperty.value;
      out.coilCurrent = em.coil.normalizedCurrentProperty.value;
    }
    const pc = pickupOf( m );
    if ( pc ) {
      const n = pc.coil.numberOfLoopsProperty.value;
      const emf = pc.emfProperty.value * FPS;
      out.coilTurns = n;
      out.loopArea = pc.coil.loopAreaPercentProperty.value;
      out.magneticFlux = pc.fluxProperty.value / n;
      out.fluxChangeRate = s.rate;
      out.emf = emf;
      out.emfPerFluxRate = s.rate ? emf / s.rate : null;
      out.inducedCurrent = pc.normalizedCurrentProperty.value;
      out.peakEmf = s.peak;
    }
    return out;
  },
  /**
   * Automated checks only. Selects a screen, stops the animation loop (sim.activeProperty) so nothing
   * moves afterwards, sets the state, settles it with two clock steps, then makes one change and one
   * more clock step. params: { screen: 'electromagnet'|'pickup'|'transformer', voltage?, thenVoltage?,
   * electromagnetTurns?, coilTurns?, magnetStrengthPercent?, thenMagnetStrengthPercent? }.
   */
  apply( params ) {
    const sim = drawer.helpers.sim();
    const want = { electromagnet: m => !!m.electromagnet, pickup: m => !!m.pickupCoil, transformer: m => !!m.transformer }[ params.screen ];
    if ( !want ) { throw new Error( `unknown screen ${params.screen}` ); }
    const screen = sim.screens.find( sc => sc.model && want( sc.model ) );
    sim.selectedScreenProperty.value = screen;
    sim.activeProperty.value = false;
    hook();
    const m = screen.model;
    const em = electromagnetOf( m );
    const pc = pickupOf( m );
    if ( em ) {
      em.currentSourceProperty.value = em.dcPowerSupply;
      if ( 'voltage' in params ) { em.dcPowerSupply.voltageProperty.value = params.voltage; }
      if ( 'electromagnetTurns' in params ) { em.coil.numberOfLoopsProperty.value = params.electromagnetTurns; }
    }
    if ( pc && 'coilTurns' in params ) { pc.coil.numberOfLoopsProperty.value = params.coilTurns; }
    if ( m.barMagnet && 'magnetStrengthPercent' in params ) { m.barMagnet.strengthPercentProperty.value = params.magnetStrengthPercent; }
    m.clock.stepOnce();
    m.clock.stepOnce();
    seed( m );
    if ( em && 'thenVoltage' in params ) { em.dcPowerSupply.voltageProperty.value = params.thenVoltage; }
    if ( m.barMagnet && 'thenMagnetStrengthPercent' in params ) { m.barMagnet.strengthPercentProperty.value = params.thenMagnetStrengthPercent; }
    m.clock.stepOnce();
  }
} );
