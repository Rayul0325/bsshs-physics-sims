// Drawer adapter for blackbody-spectrum (PhET 1.0, 2019 joist). Reads and sets state only; the physics
// is PhET's BlackbodyBodyModel. Units follow the sim's display (see docs/drawer.md):
//   - temperature: K (temperatureProperty);
//   - peak wavelength: model nm (getPeakWavelength) → μm as on the graph axis;
//   - total intensity: W/m² (getTotalIntensity, the intensity box shows "… W/m²");
//   - graph point: the draggable "graph values" point (view, GraphValuesPointNode.wavelengthProperty, nm) → μm,
//     and its spectral power density getSpectralPowerDensityAt(nm) × 1e33 → MW/m²/μm, exactly the sim's readout.
// This joist has screenIndexProperty instead of selectedScreenProperty; drawer.helpers.screen()/model()
// handle that (the sim has one screen and no home screen).
const drawer = globalThis.bsshsDrawer;

const SPD_TO_MW_PER_M2_PER_UM = 1e33; // same factor as GraphValuesPointNode / ZoomableAxesView
const NM_PER_UM = 1000;

/** The only screen. */
const screen = () => drawer.helpers.screen();
/** The screen model (BlackbodySpectrumModel). */
const model = () => {
  const m = drawer.helpers.model();
  return m && m.mainBody ? m : null;
};

let pointNode = null;
/** The draggable graph-values point (view node with wavelengthProperty in nm), found once. */
function graphPoint() {
  if ( pointNode ) { return pointNode; }
  const sc = screen();
  const view = sc && ( sc._view || sc.view );
  if ( !view ) { return null; }
  const stack = [ view ];
  while ( stack.length ) {
    const n = stack.pop();
    if ( n.draggablePointNode && n.draggablePointNode.wavelengthProperty ) {
      pointNode = n.draggablePointNode;
      return pointNode;
    }
    const kids = n.children || n._children || [];
    for ( let i = 0; i < kids.length; i++ ) { stack.push( kids[ i ] ); }
  }
  return null;
}

const nextFrame = () => new Promise( r => requestAnimationFrame( () => r() ) );

drawer.register( {
  simId: 'blackbody-spectrum',
  screenName: () => '흑체 스펙트럼',
  read() {
    const m = model();
    if ( !m ) { return {}; }
    const body = m.mainBody;
    const T = body.temperatureProperty.value;
    const out = {
      temperature: T,
      peakWavelength: body.getPeakWavelength() / NM_PER_UM,
      totalIntensity: body.getTotalIntensity(),
      inverseTemperature: 1 / T,
      temperatureFourth: Math.pow( T, 4 ),
      wavelength: null,
      spectralIntensity: null
    };
    // The point (and its readout) is only on screen while 「그래프 값」 is checked.
    const p = m.graphValuesVisibleProperty.value ? graphPoint() : null;
    if ( p ) {
      const nm = p.wavelengthProperty.value;
      out.wavelength = nm / NM_PER_UM;
      out.spectralIntensity = body.getSpectralPowerDensityAt( nm ) * SPD_TO_MW_PER_M2_PER_UM;
    }
    return out;
  },
  async apply( params ) {
    const m = model();
    if ( !m ) { throw new Error( 'blackbody model not ready' ); }
    if ( 'temperature' in params ) { m.mainBody.temperatureProperty.value = params.temperature; }
    if ( 'wavelength' in params || params.showGraphValues ) { m.graphValuesVisibleProperty.value = true; }
    await nextFrame();
    if ( 'wavelength' in params ) {
      const p = graphPoint();
      if ( !p ) { throw new Error( 'graph point not found' ); }
      // Changing the temperature moves the point to the peak, so the wavelength is set afterwards.
      p.wavelengthProperty.value = params.wavelength * NM_PER_UM;
    }
  }
} );
