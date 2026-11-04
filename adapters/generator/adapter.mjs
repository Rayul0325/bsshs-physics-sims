// Class-drawer adapter for generator (PhET 1.0, built from faradays-electromagnetic-lab; docs/drawer.md).
// It only reads the model, except apply(), which automated checks (tools/run-cases.mjs) use to put the
// model into a fixed state.
//
// Model facts (faradays-electromagnetic-lab/js/generator/model and common/model, verified against the
// source the 1.0.6 build uses):
//   - ConstantDtClock: one step (DT = 1) per 1/25 s of real time. clock.elapsedTime is only the
//     remainder towards the next step (not elapsed time), so time here counts clock steps.
//   - Turbine.step: the magnet turns by (flow % / 100) · 2π/25 rad per step, i.e. 100 % = 60 rpm. The
//     drag factor (up to 0.2, from the coil) is applied only to rpmProperty, the number on the screen's
//     rpm gauge; the magnet itself turns at the undragged rate. The drawer therefore reports the speed
//     measured from the magnet's rotation angle, and the gauge value separately.
//   - PickupCoil.fluxProperty is the TOTAL flux N·Φ(one loop) (a model value); emfProperty = −Δ(N·Φ)/DT
//     per step. The drawer shows Φ per loop and the EMF per second (× 25), so ε = −N ΔΦ/Δt with Δt in s.
const drawer = globalThis.bsshsDrawer;

const FPS = 25; // ConstantDtClock.FRAMES_PER_SECOND
const TICK = 1 / FPS; // s per clock step
const TWO_PI = 2 * Math.PI;
const RPM_PER_RAD_PER_S = 60 / TWO_PI;

/** The generator screen model (the sim has one screen). */
const generatorModel = () => {
  const m = drawer.helpers.model();
  return m && m.generator && m.clock ? m : null;
};

const st = { hooked: false, ticks: 0, prevRotation: null, omega: null, prevLoopFlux: null, prevTurns: null, rate: null, peak: 0, sig: '' };

/** Settings whose change starts a new peak record (the EMF of a turning generator never rests). */
function settingsSignature( m ) {
  const g = m.generator;
  return [ g.turbine.waterFaucet.flowRatePercentProperty.value, g.turbine.barMagnet.strengthPercentProperty.value,
    g.pickupCoil.coil.numberOfLoopsProperty.value, g.pickupCoil.coil.loopAreaPercentProperty.value ].join( '|' );
}

/** Takes the current state as the "previous" sample (start, or after apply() sets a state). */
function seed( m ) {
  const g = m.generator;
  st.prevRotation = g.turbine.barMagnet.rotationProperty.value;
  st.prevTurns = g.pickupCoil.coil.numberOfLoopsProperty.value;
  st.prevLoopFlux = g.pickupCoil.fluxProperty.value / st.prevTurns;
  st.omega = null;
  st.rate = null;
  st.peak = 0;
  st.sig = settingsSignature( m );
}

/** Called after every clock step. */
function sample( m ) {
  const g = m.generator;
  st.ticks++;
  // The turbine subtracts the angle (counterclockwise) and keeps it within ±2π.
  const rotation = g.turbine.barMagnet.rotationProperty.value;
  let turned = ( ( st.prevRotation - rotation ) % TWO_PI + TWO_PI ) % TWO_PI;
  if ( turned > Math.PI ) { turned -= TWO_PI; }
  st.omega = turned / TICK;
  st.prevRotation = rotation;
  const n = g.pickupCoil.coil.numberOfLoopsProperty.value;
  const loopFlux = g.pickupCoil.fluxProperty.value / n;
  st.rate = st.prevTurns !== n ? null : ( loopFlux - st.prevLoopFlux ) / TICK;
  st.prevLoopFlux = loopFlux;
  st.prevTurns = n;
  const sig = settingsSignature( m );
  if ( sig !== st.sig ) { st.peak = 0; st.sig = sig; }
  st.peak = Math.max( st.peak, Math.abs( g.pickupCoil.emfProperty.value * FPS ) );
}

/** Attaches the sampler to the model's clock once the sim exists. @returns {boolean} */
function hook() {
  if ( st.hooked ) { return true; }
  const m = generatorModel();
  if ( !m ) { return false; }
  st.hooked = true;
  seed( m );
  m.clock.addListener( () => sample( m ) );
  return true;
}
const hookTimer = setInterval( () => { if ( hook() ) { clearInterval( hookTimer ); } }, 250 );

drawer.register( {
  simId: 'generator',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const m = generatorModel();
    if ( !m ) { return {}; }
    hook();
    const g = m.generator;
    const coil = g.pickupCoil;
    const n = coil.coil.numberOfLoopsProperty.value;
    const emf = coil.emfProperty.value * FPS;
    return {
      time: st.ticks * TICK,
      waterFlow: g.turbine.waterFaucet.flowRatePercentProperty.value,
      angularSpeed: st.omega === null ? null : st.omega * RPM_PER_RAD_PER_S,
      rotationFrequency: st.omega === null ? null : st.omega / TWO_PI,
      rpmGauge: g.turbine.rpmProperty.value,
      magneticField: g.turbine.barMagnet.strengthProperty.value,
      coilTurns: n,
      loopArea: coil.coil.loopAreaPercentProperty.value,
      magneticFlux: coil.fluxProperty.value / n,
      fluxChangeRate: st.rate,
      emf: emf,
      emfPerFluxRate: st.rate ? emf / st.rate : null,
      peakEmf: st.peak
    };
  },
  /**
   * Automated checks only. Stops the animation loop (sim.activeProperty) so nothing moves afterwards,
   * sets the controls, settles with one clock step, then runs `ticks` clock steps.
   * params: { waterFlow?, coilTurns?, loopAreaPercent?, magnetStrengthPercent?, ticks? }.
   */
  apply( params ) {
    const sim = drawer.helpers.sim();
    const m = generatorModel();
    if ( !m ) { throw new Error( 'generator model not ready' ); }
    sim.activeProperty.value = false;
    hook();
    const g = m.generator;
    if ( 'waterFlow' in params ) { g.turbine.waterFaucet.flowRatePercentProperty.value = params.waterFlow; }
    if ( 'coilTurns' in params ) { g.pickupCoil.coil.numberOfLoopsProperty.value = params.coilTurns; }
    if ( 'loopAreaPercent' in params ) { g.pickupCoil.coil.loopAreaPercentProperty.value = params.loopAreaPercent; }
    if ( 'magnetStrengthPercent' in params ) { g.turbine.barMagnet.strengthPercentProperty.value = params.magnetStrengthPercent; }
    m.clock.stepOnce();
    seed( m );
    for ( let i = 0; i < ( params.ticks || 1 ); i++ ) { m.clock.stepOnce(); }
  }
} );
