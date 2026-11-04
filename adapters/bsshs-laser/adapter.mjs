// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

// Drawer adapter for the original 레이저 sim (sims/bsshs-laser). Reads the public Properties of
// LaserModel (sims/bsshs-laser/js/model/LaserModel.ts) in the units drawer.json declares:
//   - inputs: pumpRateProperty (/s), upperLevelLifetimeProperty (ms), mirrorReflectivityProperty (%),
//     upperLevelEnergyProperty (eV; E₁ = 0 eV, E₃ = E₂ + 0.5 eV);
//   - outputs: populations in % of all atoms, gain in 1/m, rates in photons per second, output power in W.
// apply() sets the inputs and calls model.settle(), which jumps to the exact steady state of the rate
// equations. That state is a fixed point of the model's time step, so the values stay put while the
// sim keeps running.
const drawer = globalThis.bsshsDrawer;

/** The laser screen model (the sim has a single screen, so no home screen). */
const model = () => {
  const m = drawer.helpers.model();
  if ( m && m.pumpRateProperty ) { return m; }
  const sim = drawer.helpers.sim();
  const sc = sim && sim.screens && sim.screens[ 0 ];
  const m0 = sc && ( sc.model || sc._model );
  return m0 && m0.pumpRateProperty ? m0 : null;
};

/** Value of a Property, or null when it is not a finite number (e.g. an unreachable threshold). */
const v = p => ( p && Number.isFinite( p.value ) ? p.value : null );

const INPUTS = {
  pumpRate: 'pumpRateProperty',
  upperLevelLifetime: 'upperLevelLifetimeProperty',
  mirrorReflectivity: 'mirrorReflectivityProperty',
  upperLevelEnergy: 'upperLevelEnergyProperty'
};

const nextFrame = () => new Promise( r => requestAnimationFrame( () => r() ) );

drawer.register( {
  simId: 'bsshs-laser',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const m = model();
    if ( !m ) { return {}; }
    return {
      pumpRate: v( m.pumpRateProperty ),
      upperLevelLifetime: v( m.upperLevelLifetimeProperty ),
      mirrorReflectivity: v( m.mirrorReflectivityProperty ),
      lowerLevelEnergy: v( m.lowerLevelEnergyProperty ),
      upperLevelEnergy: v( m.upperLevelEnergyProperty ),
      pumpLevelEnergy: v( m.pumpLevelEnergyProperty ),
      photonEnergy: v( m.photonEnergyProperty ),
      frequency: v( m.frequencyProperty ),
      wavelength: v( m.wavelengthProperty ),
      pumpFrequency: v( m.pumpFrequencyProperty ),
      lowerPopulation: v( m.lowerPopulationProperty ),
      upperPopulation: v( m.upperPopulationProperty ),
      populationDifference: v( m.populationDifferenceProperty ),
      gainCoefficient: v( m.gainCoefficientProperty ),
      thresholdGain: v( m.thresholdGainProperty ),
      thresholdPumpRate: v( m.thresholdPumpRateProperty ),
      spontaneousRate: v( m.spontaneousRateProperty ),
      stimulatedRate: v( m.stimulatedRateProperty ),
      outputPower: v( m.outputPowerProperty )
    };
  },
  async apply( params ) {
    const m = model();
    if ( !m ) { throw new Error( 'laser model not ready' ); }
    for ( const [ key, prop ] of Object.entries( INPUTS ) ) {
      if ( key in params ) { m[ prop ].value = params[ key ]; }
    }
    m.settle();
    await nextFrame();
  }
} );
