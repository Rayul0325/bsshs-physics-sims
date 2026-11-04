// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The 「반사와 브루스터각」 screen: Fresnel reflection at a dielectric surface and Brewster's angle.
 */

import Screen from '../../joist/js/Screen.js';
import ScreenIcon from '../../joist/js/ScreenIcon.js';
import Tandem from '../../tandem/js/Tandem.js';
import bsshsPolarization from './bsshsPolarization.js';
import BsshsPolarizationStrings from './BsshsPolarizationStrings.js';
import ReflectionModel from './model/ReflectionModel.js';
import RayDiagramNode from './view/RayDiagramNode.js';
import ReflectionScreenView from './view/ReflectionScreenView.js';

export default class ReflectionScreen extends Screen<ReflectionModel, ReflectionScreenView> {

  public constructor( tandem: Tandem ) {
    super(
      () => new ReflectionModel( tandem.createTandem( 'model' ) ),
      model => new ReflectionScreenView( model, tandem.createTandem( 'view' ) ),
      {
        name: BsshsPolarizationStrings.screen.reflectionStringProperty,
        homeScreenIcon: new ScreenIcon( RayDiagramNode.createIcon(), { maxIconWidthProportion: 0.85, maxIconHeightProportion: 0.85 } ),
        tandem: tandem
      }
    );
  }
}

bsshsPolarization.register( 'ReflectionScreen', ReflectionScreen );
