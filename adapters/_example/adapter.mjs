// EXAMPLE adapter (throwaway; the real one for `generator` is written by its own task).
// Inject it with: node tools/inject-drawer.mjs build/bsshs-theme/generator/generator_ko.html generator --adapter-dir adapters/_example
//
// Rules for every adapters/<id>/adapter.mjs (see docs/drawer.md):
//   - no `import`: the file is inlined into the built HTML as an inline module script;
//   - call bsshsDrawer.register(...) exactly once, synchronously;
//   - read() must be cheap (it runs twice a second while the drawer is open) and return a value or
//     null for EVERY key in drawer.json, in the drawer.json (sim) unit;
//   - apply() is only for automated checks.
const drawer = globalThis.bsshsDrawer;

/** The generator screen model (the sim has one screen). */
const generatorModel = () => {
  const m = drawer.helpers.model();
  return m && m.generator ? m : null;
};

drawer.register( {
  simId: 'generator',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const m = generatorModel();
    if ( !m ) { return {}; }
    const turbine = m.generator.turbine;
    const coil = m.generator.pickupCoil;
    return {
      time: m.clock.elapsedTime,
      waterFlow: turbine.waterFaucet.flowRatePercentProperty.value,
      angularSpeed: turbine.rpmProperty.value,
      magneticField: turbine.barMagnet.strengthProperty.value,
      coilTurns: coil.coil.numberOfLoopsProperty.value,
      magneticFlux: coil.fluxProperty.value,
      emf: coil.emfProperty.value
    };
  },
  apply( params ) {
    const m = generatorModel();
    if ( !m ) { throw new Error( 'generator model not ready' ); }
    if ( 'waterFlow' in params ) { m.generator.turbine.waterFaucet.flowRatePercentProperty.value = params.waterFlow; }
    if ( 'coilTurns' in params ) { m.generator.pickupCoil.coil.numberOfLoopsProperty.value = params.coilTurns; }
  }
} );
