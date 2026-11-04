// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The single screen: binds the model to its view. With one screen there is no home screen.
 */

import Screen from '../../joist/js/Screen.js';
import Tandem from '../../tandem/js/Tandem.js';
import bsshsLaser from './bsshsLaser.js';
import BsshsLaserStrings from './BsshsLaserStrings.js';
import LaserModel from './model/LaserModel.js';
import LaserScreenView from './view/LaserScreenView.js';

export default class BsshsLaserScreen extends Screen<LaserModel, LaserScreenView> {

  public constructor( tandem: Tandem ) {
    super(
      () => new LaserModel( tandem.createTandem( 'model' ) ),
      model => new LaserScreenView( model, tandem.createTandem( 'view' ) ),
      {
        name: BsshsLaserStrings.screen.mainStringProperty,
        tandem: tandem
      }
    );
  }
}

bsshsLaser.register( 'BsshsLaserScreen', BsshsLaserScreen );
