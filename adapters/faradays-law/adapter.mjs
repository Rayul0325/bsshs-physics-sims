// Class-drawer adapter for faradays-law (PhET 1.4, docs/drawer.md). It only reads the model, except
// apply(), which automated checks (tools/run-cases.mjs) use to put the model into a fixed state.
//
// Model facts (faradays-law/js/faradays-law/model, verified against the 1.4.24 source):
//   - Coil.magneticFieldProperty is the (relative, unitless) field through the coil; it is the flux
//     through one turn up to a constant, so the drawer shows it as Φ per turn.
//   - Coil.step(dt): emf = (numberOfSpirals / 2) · ΔB / dt. The model's N is half the loops drawn
//     (bottom coil 4 spirals → N = 2, top coil 2 spirals → N = 1), and its sign is +N ΔΦ/Δt: the
//     model takes the opposite loop orientation from ε = −N ΔΦ/Δt (same magnitude).
//   - Inside the near field (distance < 50 px) the field is saturated at ±2 (sign = magnet
//     orientation), so flipping the magnet there changes Φ by exactly 4.
//   - The model has no clock; joist calls model.step(dt) once per frame and adds dt to
//     phet.joist.elapsedTime (ms) just before, then fires frameEndedEmitter.
// This joist has screenProperty instead of selectedScreenProperty; drawer.helpers.model() handles that.
const drawer = globalThis.bsshsDrawer;

const REST_TIME = 0.5; // s without motion or flux change before a new motion starts a new peak record

const sim = () => drawer.helpers.sim();

/** The one screen's model, or null before the sim is built. */
const model = () => {
  const m = drawer.helpers.model();
  return m && m.bottomCoil && m.magnet ? m : null;
};

// Values the model does not keep, derived from its own state frame by frame.
const st = {
  hooked: false,
  t: 0, // s of simulated time since the page loaded
  lastElapsed: 0,
  prevFlux: null,
  prevPos: null,
  rate: 0,
  speed: 0,
  rest: Infinity,
  peakEmf: 0,
  peakSpeed: 0
};

/** Total EMF the voltmeter adds up (bottom + top coil). */
const totalEmf = m => m.bottomCoil.emfProperty.value + m.topCoil.emfProperty.value;

/** Forgets the previous sample (after Reset All or a jump set by apply()). */
function forgetPrevious( m ) {
  st.prevFlux = m ? m.bottomCoil.magneticFieldProperty.value : null;
  const p = m && m.magnet.positionProperty.value;
  st.prevPos = p ? { x: p.x, y: p.y } : null;
  st.rate = 0;
  st.speed = 0;
}

/** Called once after every model step of dt seconds. */
function sample( m, dt ) {
  st.t += dt;
  const flux = m.bottomCoil.magneticFieldProperty.value;
  st.rate = st.prevFlux === null ? 0 : ( flux - st.prevFlux ) / dt;
  st.prevFlux = flux;
  const p = m.magnet.positionProperty.value;
  st.speed = st.prevPos === null ? 0 : Math.hypot( p.x - st.prevPos.x, p.y - st.prevPos.y ) / dt;
  st.prevPos = { x: p.x, y: p.y };
  const active = st.speed > 0 || st.rate !== 0 || totalEmf( m ) !== 0;
  if ( active ) {
    if ( st.rest >= REST_TIME ) { st.peakEmf = 0; st.peakSpeed = 0; }
    st.rest = 0;
  }
  else { st.rest += dt; }
  st.peakEmf = Math.max( st.peakEmf, Math.abs( totalEmf( m ) ) );
  st.peakSpeed = Math.max( st.peakSpeed, st.speed );
}

/** Attaches the per-frame sampler once the sim exists. @returns {boolean} */
function hook() {
  if ( st.hooked ) { return true; }
  const s = sim();
  const m = model();
  if ( !s || !m || !s.frameEndedEmitter || !window.phet.joist ) { return false; }
  st.hooked = true;
  st.lastElapsed = window.phet.joist.elapsedTime || 0;
  forgetPrevious( m );
  s.frameEndedEmitter.addListener( () => {
    const now = window.phet.joist.elapsedTime || 0;
    const dt = ( now - st.lastElapsed ) / 1000;
    st.lastElapsed = now;
    const mm = model();
    if ( dt > 0 && mm ) { sample( mm, dt ); }
  } );
  m.resetInProgressProperty.lazyLink( inProgress => { if ( !inProgress ) { forgetPrevious( model() ); } } );
  return true;
}
const hookTimer = setInterval( () => { if ( hook() ) { clearInterval( hookTimer ); } }, 250 );

/** The orientation value with the given name ('NS' or 'SN'). */
function orientation( m, name ) {
  const v = m.magnet.orientationProperty.validValues.find( o => String( o ) === name );
  if ( !v ) { throw new Error( `unknown orientation ${name}` ); }
  return v;
}

/** Moves the magnet center to (x, y) in model (view) coordinates, bypassing the drag limits. */
function placeMagnet( m, x, y ) {
  const p = m.magnet.positionProperty.value.copy();
  p.x = x;
  p.y = y;
  m.magnet.positionProperty.value = p;
}

drawer.register( {
  simId: 'faradays-law',
  screenName: () => {
    const s = sim();
    const n = s && s.simNameProperty ? s.simNameProperty.value : document.title;
    return drawer.helpers.cleanName( n );
  },
  read() {
    const m = model();
    if ( !m ) { return {}; }
    hook();
    const two = m.topCoilVisibleProperty.value;
    return {
      time: st.t,
      coilCount: two ? 2 : 1,
      coilTurns: m.bottomCoil.numberOfSpirals / 2,
      magnetSpeed: st.speed,
      magneticFlux: m.bottomCoil.magneticFieldProperty.value,
      fluxChangeRate: st.rate,
      emf: m.bottomCoil.emfProperty.value,
      topEmf: two ? m.topCoil.emfProperty.value : null,
      totalEmf: totalEmf( m ),
      peakSpeed: st.peakSpeed,
      peakEmf: st.peakEmf
    };
  },
  /**
   * Automated checks only. Stops the animation loop (sim.activeProperty) so nothing moves afterwards,
   * places the magnet, lets the coils settle, then runs `actions` as manual model steps:
   * { twoCoils?, x, y, orientation: 'NS'|'SN', actions: [ { dt, flip?, x?, y? } ] }.
   */
  apply( params ) {
    const s = sim();
    const m = model();
    if ( !m ) { throw new Error( 'faradays-law model not ready' ); }
    hook();
    s.activeProperty.value = false;
    m.topCoilVisibleProperty.value = !!params.twoCoils;
    m.magnet.orientationProperty.value = orientation( m, params.orientation || 'NS' );
    if ( 'x' in params ) { placeMagnet( m, params.x, params.y ); }
    m.step( 0.1 ); // new field values
    m.step( 0.1 ); // previous = current: no EMF left over from the jump
    forgetPrevious( m );
    st.rest = Infinity;
    st.peakEmf = 0;
    st.peakSpeed = 0;
    for ( const a of params.actions || [] ) {
      if ( a.flip ) { m.magnet.orientationProperty.value = orientation( m, String( m.magnet.orientationProperty.value ) === 'NS' ? 'SN' : 'NS' ); }
      if ( 'x' in a ) { placeMagnet( m, a.x, a.y ); }
      m.step( a.dt );
      sample( m, a.dt );
    }
  }
} );
