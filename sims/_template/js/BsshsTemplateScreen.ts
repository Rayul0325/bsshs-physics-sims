// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The single screen: binds the model to its view. With one screen there is no home screen.
 */

import Screen from '../../joist/js/Screen.js';
import Tandem from '../../tandem/js/Tandem.js';
import bsshsTemplate from './bsshsTemplate.js';
import BsshsTemplateStrings from './BsshsTemplateStrings.js';
import BsshsTemplateModel from './model/BsshsTemplateModel.js';
import BsshsTemplateScreenView from './view/BsshsTemplateScreenView.js';

export default class BsshsTemplateScreen extends Screen<BsshsTemplateModel, BsshsTemplateScreenView> {

  public constructor( tandem: Tandem ) {
    super(
      () => new BsshsTemplateModel( tandem.createTandem( 'model' ) ),
      model => new BsshsTemplateScreenView( model, tandem.createTandem( 'view' ) ),
      {
        name: BsshsTemplateStrings.screen.mainStringProperty,
        tandem: tandem
      }
    );
  }
}

bsshsTemplate.register( 'BsshsTemplateScreen', BsshsTemplateScreen );
