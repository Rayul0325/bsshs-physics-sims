// Fake adapter for the drawer fixture page (tests/fixtures/drawer/fake-sim.html).
// Shape of every adapter: no imports; call bsshsDrawer.register({ simId, screenName, read, apply? }).
const fake = () => window.fakeSim;

globalThis.bsshsDrawer.register( {
  simId: 'fake-sim',
  screenName: () => fake().screens[ fake().selected ].name,
  read() {
    const m = fake().screens[ fake().selected ].model;
    const hc = 1239.84198; // eV·nm
    const E = hc / m.wavelength;
    return {
      wavelength: m.wavelength,
      frequency: 299792458 / ( m.wavelength * 1e-9 ),
      photonEnergy: E,
      stoppingVoltage: Math.max( 0, E - m.workFunction )
    };
  },
  apply( params ) {
    const m = fake().screens[ fake().selected ].model;
    if ( 'wavelength' in params ) { m.wavelength = params.wavelength; }
  }
} );
