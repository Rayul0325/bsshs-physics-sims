// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Entry point (chipper bundles js/<repo>-main.ts).
 */

import Sim from '../../joist/js/Sim.js';
import simLauncher from '../../joist/js/simLauncher.js';
import Tandem from '../../tandem/js/Tandem.js';
import BsshsTemplateScreen from './BsshsTemplateScreen.js';
import BsshsTemplateStrings from './BsshsTemplateStrings.js';

simLauncher.launch( () => {
  const screens = [ new BsshsTemplateScreen( Tandem.ROOT.createTandem( 'mainScreen' ) ) ];
  const sim = new Sim( BsshsTemplateStrings[ 'bsshs-template' ].titleStringProperty, screens );
  sim.start();
} );
