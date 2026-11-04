// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The 「PN 접합」 screen: binds JunctionModel to JunctionScreenView, with a home-screen icon drawn from the same
 * picture (a p region with holes, an n region with electrons, and the ion layer between them).
 */

import Screen from '../../joist/js/Screen.js';
import ScreenIcon from '../../joist/js/ScreenIcon.js';
import Circle from '../../scenery/js/nodes/Circle.js';
import Node from '../../scenery/js/nodes/Node.js';
import Rectangle from '../../scenery/js/nodes/Rectangle.js';
import Tandem from '../../tandem/js/Tandem.js';
import bsshsSemiconductor from './bsshsSemiconductor.js';
import BsshsSemiconductorStrings from './BsshsSemiconductorStrings.js';
import JunctionModel from './model/JunctionModel.js';
import JunctionScreenView from './view/JunctionScreenView.js';
import SemiconductorColors from './view/SemiconductorColors.js';

function createIcon(): ScreenIcon {
  const w = 120;
  const h = 80;
  const children: Node[] = [
    new Rectangle( 0, 0, w / 2, h, { fill: SemiconductorColors.pRegion } ),
    new Rectangle( w / 2, 0, w / 2, h, { fill: SemiconductorColors.nRegion } ),
    new Rectangle( w / 2 - 14, 0, 28, h, { fill: SemiconductorColors.depletionRegion } )
  ];
  for ( let i = 0; i < 3; i++ ) {
    for ( let j = 0; j < 3; j++ ) {
      children.push( new Circle( 6, { fill: SemiconductorColors.idle, stroke: SemiconductorColors.hole, lineWidth: 3, x: 10 + i * 14, y: 16 + j * 24 } ) );
      children.push( new Circle( 6, { fill: SemiconductorColors.electron, x: w - 10 - i * 14, y: 16 + j * 24 } ) );
    }
  }
  children.push( new Rectangle( 0, 0, w, h, { stroke: SemiconductorColors.outline, lineWidth: 2 } ) );
  return new ScreenIcon( new Node( { children: children } ), { fill: SemiconductorColors.idle, maxIconWidthProportion: 0.85, maxIconHeightProportion: 0.85 } );
}

export default class JunctionScreen extends Screen<JunctionModel, JunctionScreenView> {

  public constructor( tandem: Tandem ) {
    super(
      () => new JunctionModel( tandem.createTandem( 'model' ) ),
      model => new JunctionScreenView( model, tandem.createTandem( 'view' ) ),
      {
        name: BsshsSemiconductorStrings.screen.junctionStringProperty,
        homeScreenIcon: createIcon(),
        tandem: tandem
      }
    );
  }
}

bsshsSemiconductor.register( 'JunctionScreen', JunctionScreen );
