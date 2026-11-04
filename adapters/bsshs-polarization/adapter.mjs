// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only
//
// Drawer adapter for bsshs-polarization (original sim, sims/bsshs-polarization). Reads and sets state only; the
// physics lives in the sim's js/model/. Every value is a public Property of the selected screen's model:
//   - 「편광판」 (PolarizerModel): source intensity and type, up to three polarizers in series, the detector
//     intensity, and Malus's law quantities at the LAST inserted polarizer (the light entering it, I₀; the light
//     leaving it, I; and θ, the angle between the arriving polarization and its axis, folded into 0–90°).
//     θ, cos²θ and I/I₀ are null when the light reaching that polarizer is unpolarized or blocked.
//   - 「반사와 브루스터각」 (ReflectionModel): n₁ = 1, adjustable n₂ and θ₁; Snell's law and the Fresnel
//     reflectances Rₛ, Rₚ; θ_B = atan(n₂/n₁); the angle between the reflected and refracted rays.
// Angles are in degrees, intensities in W/m², reflectances are fractions (0–1), as the sim shows them.
const drawer = globalThis.bsshsDrawer;

const POLARIZER_KEYS = [ 'sourceIntensity', 'polarizerCount', 'incidentIntensity', 'transmittedIntensity',
  'polarizerAngle', 'cosSquared', 'intensityRatio', 'transmittedFraction' ];
const REFLECTION_KEYS = [ 'incidentAngle', 'refractionAngle', 'refractiveIndex1', 'refractiveIndex2', 'reflectanceS',
  'reflectanceP', 'reflectance', 'brewsterAngle', 'tanBrewster', 'raysAngle', 'reflectedPolarization' ];
const EMPTY = () => Object.fromEntries( [ ...POLARIZER_KEYS, ...REFLECTION_KEYS ].map( k => [ k, null ] ) );

/** Which screen a model belongs to. */
function kind( m ) {
  if ( !m ) { return null; }
  if ( m.polarizers && m.transmittedIntensityProperty ) { return 'polarizers'; }
  if ( m.refractiveIndex2Property && m.reflectanceSProperty ) { return 'reflection'; }
  return null;
}

/** Copies `<key>Property.value` of every key into out. */
function copy( m, keys, out ) {
  for ( const k of keys ) {
    const p = m[ `${k}Property` ];
    out[ k ] = p ? p.value : null;
  }
}

const frames = n => new Promise( r => {
  const tick = () => ( --n <= 0 ? r() : requestAnimationFrame( tick ) );
  requestAnimationFrame( tick );
} );

drawer.register( {
  simId: 'bsshs-polarization',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const out = EMPTY();
    const m = drawer.helpers.model();
    const k = kind( m );
    if ( k === 'polarizers' ) { copy( m, POLARIZER_KEYS, out ); }
    else if ( k === 'reflection' ) { copy( m, REFLECTION_KEYS, out ); }
    return out;
  },
  /**
   * Automated checks only. Resets the chosen screen's model, then sets:
   *   'polarizers' { light: 'unpolarized'|'polarized', sourceAngle, sourceIntensity, p1, p2, p3 } — pN is the axis
   *     angle (degrees from vertical) of polarizer N, or null to take it out of the beam;
   *   'reflection' { light: 'unpolarized'|'s'|'p', incidentAngle, refractiveIndex2 }.
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
    m.reset();
    if ( params.screen === 'polarizers' ) {
      if ( params.light ) { m.lightTypeProperty.value = params.light; }
      if ( 'sourceAngle' in params ) { m.sourceAngleProperty.value = params.sourceAngle; }
      if ( 'sourceIntensity' in params ) { m.sourceIntensityProperty.value = params.sourceIntensity; }
      [ 'p1', 'p2', 'p3' ].forEach( ( key, i ) => {
        if ( !( key in params ) ) { return; }
        const p = m.polarizers[ i ];
        if ( params[ key ] === null ) { p.insertedProperty.value = false; }
        else {
          p.angleProperty.value = params[ key ];
          p.insertedProperty.value = true;
        }
      } );
    }
    else {
      if ( params.light ) { m.lightTypeProperty.value = params.light; }
      if ( 'refractiveIndex2' in params ) { m.refractiveIndex2Property.value = params.refractiveIndex2; }
      if ( 'incidentAngle' in params ) { m.incidentAngleProperty.value = params.incidentAngle; }
    }
    await frames( 2 );
  }
} );
