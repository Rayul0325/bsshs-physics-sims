// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only
//
// Drawer adapter for bsshs-compton (original sim, sims/bsshs-compton). Reads the public Properties of
// BsshsComptonModel (phet.joist.sim.screens[0].model); units are the sim's display units (docs/drawer.md):
// wavelengths in pm, energies in keV, momenta in keV/c, angles in degrees, electron speed as a fraction of c.
// apply() sets the inputs: incidentWavelength (pm) or photonEnergy (keV), and scatteringAngle (°).
const drawer = globalThis.bsshsDrawer;

/** The screen model (one screen, no home screen). */
const model = () => {
  const m = drawer.helpers.model();
  if ( m && m.incidentWavelengthProperty ) { return m; }
  const sim = drawer.helpers.sim();
  const s = sim && sim.screens && sim.screens[ 0 ];
  const sm = s && ( s.model || s._model );
  return sm && sm.incidentWavelengthProperty ? sm : null;
};

const nextFrame = () => new Promise( r => requestAnimationFrame( () => r() ) );

drawer.register( {
  simId: 'bsshs-compton',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const m = model();
    if ( !m ) { return {}; }
    return {
      incidentWavelength: m.incidentWavelengthProperty.value,
      photonEnergy: m.incidentEnergyProperty.value,
      scatteringAngle: m.scatteringAngleProperty.value,
      oneMinusCosTheta: m.oneMinusCosThetaProperty.value,
      scatteredWavelength: m.scatteredWavelengthProperty.value,
      wavelengthShift: m.wavelengthShiftProperty.value,
      comptonWavelength: m.comptonWavelength,
      scatteredPhotonEnergy: m.scatteredEnergyProperty.value,
      inverseScatteredEnergy: 1 / m.scatteredEnergyProperty.value,
      electronKineticEnergy: m.electronKineticEnergyProperty.value,
      energyAfter: m.energyAfterProperty.value,
      recoilAngle: m.recoilAngleProperty.value,
      photonMomentum: m.incidentMomentumProperty.value,
      electronMomentum: m.electronMomentumProperty.value,
      electronTotalEnergy: m.electronTotalEnergyProperty.value,
      electronSpeed: m.electronSpeedProperty.value
    };
  },
  async apply( params ) {
    const m = model();
    if ( !m ) { throw new Error( 'compton model not ready' ); }
    if ( 'incidentWavelength' in params ) { m.incidentWavelengthProperty.value = params.incidentWavelength; }
    if ( 'photonEnergy' in params ) { m.incidentEnergyProperty.value = params.photonEnergy; }
    if ( 'scatteringAngle' in params ) { m.scatteringAngleProperty.value = params.scatteringAngle; }
    await nextFrame();
  }
} );
