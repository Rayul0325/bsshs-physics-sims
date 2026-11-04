// Test-only adapter for the real faradays-electromagnetic-lab build: checks that switching PhET
// screens appends to the same log with the right 화면 value.
const drawer = globalThis.bsshsDrawer;

drawer.register( {
  simId: 'faradays-electromagnetic-lab',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const sim = drawer.helpers.sim();
    const model = drawer.helpers.model();
    const magnet = model && ( model.barMagnet || model.electromagnet || ( model.compass && model.compass.magnet ) );
    return {
      magneticField: magnet && magnet.strengthProperty ? magnet.strengthProperty.value : null,
      screenIndex: sim ? sim.screens.indexOf( sim.selectedScreenProperty.value ) : null
    };
  }
} );
