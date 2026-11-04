// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The single screen: binds the model to its view. With one screen there is no home screen.
 */

import Screen from '../../joist/js/Screen.js';
import Tandem from '../../tandem/js/Tandem.js';
import bsshsCompton from './bsshsCompton.js';
import BsshsComptonStrings from './BsshsComptonStrings.js';
import BsshsComptonModel from './model/BsshsComptonModel.js';
import BsshsComptonScreenView from './view/BsshsComptonScreenView.js';

export default class BsshsComptonScreen extends Screen<BsshsComptonModel, BsshsComptonScreenView> {

  public constructor( tandem: Tandem ) {
    super(
      () => new BsshsComptonModel( tandem.createTandem( 'model' ) ),
      model => new BsshsComptonScreenView( model, tandem.createTandem( 'view' ) ),
      {
        name: BsshsComptonStrings.screen.mainStringProperty,
        tandem: tandem
      }
    );
  }
}

bsshsCompton.register( 'BsshsComptonScreen', BsshsComptonScreen );
