// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The 「편광판」 screen: Malus's law through up to three polarizers.
 */

import Screen from '../../joist/js/Screen.js';
import ScreenIcon from '../../joist/js/ScreenIcon.js';
import Tandem from '../../tandem/js/Tandem.js';
import bsshsPolarization from './bsshsPolarization.js';
import BsshsPolarizationStrings from './BsshsPolarizationStrings.js';
import PolarizerModel from './model/PolarizerModel.js';
import PolarizerDiscNode from './view/PolarizerDiscNode.js';
import PolarizerScreenView from './view/PolarizerScreenView.js';

export default class PolarizerScreen extends Screen<PolarizerModel, PolarizerScreenView> {

  public constructor( tandem: Tandem ) {
    super(
      () => new PolarizerModel( tandem.createTandem( 'model' ) ),
      model => new PolarizerScreenView( model, tandem.createTandem( 'view' ) ),
      {
        name: BsshsPolarizationStrings.screen.polarizersStringProperty,
        homeScreenIcon: new ScreenIcon( PolarizerDiscNode.createIcon(), { maxIconWidthProportion: 0.8, maxIconHeightProportion: 0.85 } ),
        tandem: tandem
      }
    );
  }
}

bsshsPolarization.register( 'PolarizerScreen', PolarizerScreen );
