// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Entry point (chipper bundles js/<repo>-main.ts). Two screens: polarizers (Malus's law) and reflection (Fresnel,
 * Brewster's angle).
 */

import Sim from '../../joist/js/Sim.js';
import simLauncher from '../../joist/js/simLauncher.js';
import Tandem from '../../tandem/js/Tandem.js';
import BsshsPolarizationStrings from './BsshsPolarizationStrings.js';
import PolarizerScreen from './PolarizerScreen.js';
import ReflectionScreen from './ReflectionScreen.js';

simLauncher.launch( () => {
  const screens = [
    new PolarizerScreen( Tandem.ROOT.createTandem( 'polarizerScreen' ) ),
    new ReflectionScreen( Tandem.ROOT.createTandem( 'reflectionScreen' ) )
  ];
  const sim = new Sim( BsshsPolarizationStrings[ 'bsshs-polarization' ].titleStringProperty, screens );
  sim.start();
} );
