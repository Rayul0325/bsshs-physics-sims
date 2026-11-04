// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Entry point (chipper bundles js/<repo>-main.ts).
 */

import Sim from '../../joist/js/Sim.js';
import simLauncher from '../../joist/js/simLauncher.js';
import Tandem from '../../tandem/js/Tandem.js';
import JunctionScreen from './JunctionScreen.js';
import RectifierScreen from './RectifierScreen.js';
import BsshsSemiconductorStrings from './BsshsSemiconductorStrings.js';

simLauncher.launch( () => {
  const screens = [
    new JunctionScreen( Tandem.ROOT.createTandem( 'junctionScreen' ) ),
    new RectifierScreen( Tandem.ROOT.createTandem( 'rectifierScreen' ) )
  ];
  const sim = new Sim( BsshsSemiconductorStrings[ 'bsshs-semiconductor' ].titleStringProperty, screens );
  sim.start();
} );
