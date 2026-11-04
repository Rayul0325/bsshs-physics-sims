// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only
//
// Drawer adapter for the original sim bsshs-semiconductor (two screens). Reads and sets model state only; the
// physics lives in sims/bsshs-semiconductor/js/model/. Model units → drawer.json units:
//   - JunctionModel ('PN 접합'): currents A → mA, widths m → μm, densities stay cm⁻³, energies eV, voltages V;
//   - RectifierModel ('정류 회로'): voltages V, capacitance μF, frequency Hz, resistance Ω, cursor time ms,
//     current A → mA. Steady-state quantities (peak, ripple, average) come from the model's periodic solution,
//     so they do not drift while the oscilloscope animates.
// Each model carries modelKind ('junction' | 'rectifier'); every key of the other screen reads null.
const drawer = globalThis.bsshsDrawer;

const KEYS = [
  'temperature', 'bandGap', 'acceptorDensity', 'donorDensity', 'intrinsicDensity', 'permittivity', 'thermalVoltage',
  'builtInVoltage', 'sourceVoltage', 'diodeVoltage', 'diodeCurrent', 'lnCurrent', 'saturationCurrent',
  'idealityFactor', 'barrierHeight', 'depletionWidth', 'depletionWidthSquared',
  'inputAmplitude', 'signalFrequency', 'loadResistance', 'capacitance', 'inverseCapacitance', 'turnOnVoltage',
  'diodeResistance', 'peakVoltage', 'rippleVoltage', 'averageOutputVoltage', 'cursorTime', 'inputVoltage',
  'outputVoltage'
];

const MA_PER_A = 1e3;
const UM_PER_M = 1e6;

/** The selected screen's model, or null on the home screen / before the sim starts. */
const model = () => {
  const m = drawer.helpers.model();
  return m && ( m.modelKind === 'junction' || m.modelKind === 'rectifier' ) ? m : null;
};

/** Every key null, then the selected screen's values filled in. */
function readJunction( m, out ) {
  const i = m.diodeCurrentProperty.value;
  const w = m.depletionWidthProperty.value;
  out.temperature = m.temperatureProperty.value;
  out.bandGap = m.bandGapProperty.value;
  out.acceptorDensity = m.acceptorDensityProperty.value;
  out.donorDensity = m.donorDensityProperty.value;
  out.intrinsicDensity = m.intrinsicDensityProperty.value;
  out.permittivity = m.permittivityProperty.value;
  out.thermalVoltage = m.thermalVoltageProperty.value;
  out.builtInVoltage = m.builtInVoltageProperty.value;
  out.sourceVoltage = m.sourceVoltageProperty.value;
  out.diodeVoltage = m.diodeVoltageProperty.value;
  out.diodeCurrent = i * MA_PER_A;
  out.lnCurrent = i > 0 ? Math.log( i * MA_PER_A ) : null;
  out.saturationCurrent = m.saturationCurrentProperty.value * MA_PER_A;
  out.idealityFactor = m.idealityFactorProperty.value;
  out.barrierHeight = m.barrierHeightProperty.value;
  out.depletionWidth = w * UM_PER_M;
  out.depletionWidthSquared = ( w * UM_PER_M ) * ( w * UM_PER_M );
}

function readRectifier( m, out ) {
  const hasC = m.capacitorConnectedProperty.value;
  const c = m.capacitanceProperty.value;
  out.inputAmplitude = m.inputAmplitudeProperty.value;
  out.signalFrequency = m.signalFrequencyProperty.value;
  out.loadResistance = m.loadResistanceProperty.value;
  out.capacitance = hasC ? c : null;
  out.inverseCapacitance = hasC ? 1 / c : null;
  out.turnOnVoltage = m.turnOnVoltageProperty.value;
  out.diodeResistance = m.diodeResistanceProperty.value;
  out.peakVoltage = m.peakVoltageProperty.value;
  out.rippleVoltage = m.rippleVoltageProperty.value;
  out.averageOutputVoltage = m.averageOutputVoltageProperty.value;
  out.cursorTime = m.cursorTimeProperty.value;
  out.inputVoltage = m.cursorInputVoltageProperty.value;
  out.outputVoltage = m.cursorOutputVoltageProperty.value;
  out.diodeVoltage = m.cursorDiodeVoltageProperty.value;
  out.diodeCurrent = m.cursorDiodeCurrentProperty.value * MA_PER_A;
}

const nextFrame = () => new Promise( r => requestAnimationFrame( () => r() ) );

drawer.register( {
  simId: 'bsshs-semiconductor',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const out = {};
    for ( const k of KEYS ) { out[ k ] = null; }
    const m = model();
    if ( m && m.modelKind === 'junction' ) { readJunction( m, out ); }
    else if ( m && m.modelKind === 'rectifier' ) { readRectifier( m, out ); }
    return out;
  },

  /**
   * Automated checks only. params.screen: 'junction' { material, sourceVoltage, acceptorDensity, donorDensity
   * (cm⁻³), temperature, idealityFactor } | 'rectifier' { circuit, diodeModel, inputAmplitude, signalFrequency,
   * loadResistance, capacitance (μF; 0 = no capacitor), cursorTime (ms) }. The model is reset first.
   */
  async apply( params ) {
    const sim = drawer.helpers.sim();
    if ( !sim ) { throw new Error( 'sim not ready' ); }
    const sc = sim.screens.find( s => s.model && s.model.modelKind === params.screen );
    if ( !sc ) { throw new Error( `screen ${params.screen} not found` ); }
    sim.selectedScreenProperty.value = sc;
    await nextFrame();
    const m = sc.model;
    m.reset();
    if ( params.screen === 'junction' ) {
      if ( 'material' in params ) { m.materialProperty.value = params.material; }
      if ( 'temperature' in params ) { m.temperatureProperty.value = params.temperature; }
      if ( 'idealityFactor' in params ) { m.idealityFactorProperty.value = params.idealityFactor; }
      if ( 'acceptorDensity' in params ) { m.acceptorExponentProperty.value = Math.log10( params.acceptorDensity ); }
      if ( 'donorDensity' in params ) { m.donorExponentProperty.value = Math.log10( params.donorDensity ); }
      if ( 'sourceVoltage' in params ) { m.sourceVoltageProperty.value = params.sourceVoltage; }
    }
    else {
      if ( 'circuit' in params ) { m.circuitProperty.value = params.circuit; }
      if ( 'diodeModel' in params ) { m.diodeModelProperty.value = params.diodeModel; }
      if ( 'inputAmplitude' in params ) { m.inputAmplitudeProperty.value = params.inputAmplitude; }
      if ( 'signalFrequency' in params ) { m.signalFrequencyProperty.value = params.signalFrequency; }
      if ( 'loadResistance' in params ) { m.loadResistanceProperty.value = params.loadResistance; }
      if ( 'capacitance' in params ) {
        m.capacitorConnectedProperty.value = !!params.capacitance;
        if ( params.capacitance ) { m.capacitanceProperty.value = params.capacitance; }
      }
      if ( 'cursorTime' in params ) { m.cursorTimeProperty.value = params.cursorTime; }
    }
    await nextFrame();
  }
} );
