// Drawer adapter for bsshs-photoelectric (original sim, sims/bsshs-photoelectric). Reads and sets state only; the
// physics is the sim's PhotoelectricModel (js/model/BsshsPhotoelectricModel.ts). Units follow the sim's display:
//   - wavelength nm, frequency Hz, photon energy / work function / K_max eV, voltages V, photocurrent μA;
//   - kineticEnergyMax and stoppingVoltage are null below the threshold (no photoelectrons, K_max is not negative);
//   - photonRate / electronRate are per second.
// apply() params: wavelength (nm) or frequency (Hz), metal ('Cs' | 'Na' | 'Zn' | 'Cu' | 'Pt'), intensity (%),
// voltage (V), lightOn (default true, so a case measures with the light switched on).
const drawer = globalThis.bsshsDrawer;

const SPEED_OF_LIGHT = 299792458; // m/s, only to turn a frequency param into the sim's wavelength input

/** The only screen's model (one screen, no home screen). */
const model = () => {
  const sim = drawer.helpers.sim();
  const screen = sim && sim.screens && sim.screens[ 0 ];
  const m = screen && ( screen.model || screen._model );
  return m && m.wavelengthProperty ? m : null;
};

const nextFrame = () => new Promise( r => requestAnimationFrame( () => r() ) );

drawer.register( {
  simId: 'bsshs-photoelectric',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const m = model();
    if ( !m ) { return {}; }
    return {
      wavelength: m.wavelengthProperty.value,
      frequency: m.frequencyProperty.value,
      photonEnergy: m.photonEnergyProperty.value,
      workFunction: m.workFunctionProperty.value,
      thresholdFrequency: m.thresholdFrequencyProperty.value,
      kineticEnergyMax: m.kineticEnergyMaxProperty.value,
      stoppingVoltage: m.stoppingVoltageProperty.value,
      intensity: m.intensityProperty.value,
      photonRate: m.photonRateProperty.value,
      electronRate: m.electronRateProperty.value,
      voltage: m.voltageProperty.value,
      photocurrent: m.photocurrentProperty.value
    };
  },
  async apply( params ) {
    const m = model();
    if ( !m ) { throw new Error( 'photoelectric model not ready' ); }
    if ( 'metal' in params ) {
      const metal = m.metals.find( x => x.symbol === params.metal );
      if ( !metal ) { throw new Error( `unknown metal ${params.metal}` ); }
      m.metalProperty.value = metal;
    }
    if ( 'frequency' in params ) { m.wavelengthProperty.value = SPEED_OF_LIGHT / params.frequency * 1e9; }
    if ( 'wavelength' in params ) { m.wavelengthProperty.value = params.wavelength; }
    if ( 'intensity' in params ) { m.intensityProperty.value = params.intensity; }
    if ( 'voltage' in params ) { m.voltageProperty.value = params.voltage; }
    m.lightOnProperty.value = params.lightOn !== false;
    await nextFrame();
  }
} );
