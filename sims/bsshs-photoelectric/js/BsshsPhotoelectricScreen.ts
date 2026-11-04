// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The single screen: binds the model to its view. With one screen there is no home screen.
 */

import Screen from '../../joist/js/Screen.js';
import Tandem from '../../tandem/js/Tandem.js';
import bsshsPhotoelectric from './bsshsPhotoelectric.js';
import BsshsPhotoelectricStrings from './BsshsPhotoelectricStrings.js';
import BsshsPhotoelectricModel from './model/BsshsPhotoelectricModel.js';
import BsshsPhotoelectricScreenView from './view/BsshsPhotoelectricScreenView.js';

export default class BsshsPhotoelectricScreen extends Screen<BsshsPhotoelectricModel, BsshsPhotoelectricScreenView> {

  public constructor( tandem: Tandem ) {
    super(
      () => new BsshsPhotoelectricModel( tandem.createTandem( 'model' ) ),
      model => new BsshsPhotoelectricScreenView( model, tandem.createTandem( 'view' ) ),
      {
        name: BsshsPhotoelectricStrings.screen.mainStringProperty,
        tandem: tandem
      }
    );
  }
}

bsshsPhotoelectric.register( 'BsshsPhotoelectricScreen', BsshsPhotoelectricScreen );
