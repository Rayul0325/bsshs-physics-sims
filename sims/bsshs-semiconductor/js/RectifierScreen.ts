// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The 「정류 회로」 screen: binds RectifierModel to RectifierScreenView, with a home-screen icon of an input sine
 * wave and its smoothed, rectified output on an oscilloscope screen.
 */

import Screen from '../../joist/js/Screen.js';
import ScreenIcon from '../../joist/js/ScreenIcon.js';
import Shape from '../../kite/js/Shape.js';
import Node from '../../scenery/js/nodes/Node.js';
import Path from '../../scenery/js/nodes/Path.js';
import Rectangle from '../../scenery/js/nodes/Rectangle.js';
import Tandem from '../../tandem/js/Tandem.js';
import bsshsSemiconductor from './bsshsSemiconductor.js';
import BsshsSemiconductorStrings from './BsshsSemiconductorStrings.js';
import RectifierModel from './model/RectifierModel.js';
import RectifierScreenView from './view/RectifierScreenView.js';
import SemiconductorColors from './view/SemiconductorColors.js';

function createIcon(): ScreenIcon {
  const w = 120;
  const h = 80;
  const input = new Shape();
  const output = new Shape();
  let v = 0;
  for ( let i = 0; i <= 120; i++ ) {
    const s = Math.sin( 2 * Math.PI * i / 60 );
    v = Math.max( v * 0.985, Math.abs( s ) );
    const x = i;
    if ( i === 0 ) { input.moveTo( x, h / 2 - 30 * s ); output.moveTo( x, h / 2 - 30 * v ); }
    else { input.lineTo( x, h / 2 - 30 * s ); output.lineTo( x, h / 2 - 30 * v ); }
  }
  return new ScreenIcon( new Node( {
    children: [
      new Rectangle( 0, 0, w, h, 6, 6, { fill: SemiconductorColors.scopeScreen } ),
      new Path( input, { stroke: SemiconductorColors.scopeInput, lineWidth: 3 } ),
      new Path( output, { stroke: SemiconductorColors.scopeOutput, lineWidth: 4 } )
    ]
  } ), { fill: SemiconductorColors.idle, maxIconWidthProportion: 0.85, maxIconHeightProportion: 0.85 } );
}

export default class RectifierScreen extends Screen<RectifierModel, RectifierScreenView> {

  public constructor( tandem: Tandem ) {
    super(
      () => new RectifierModel( tandem.createTandem( 'model' ) ),
      model => new RectifierScreenView( model, tandem.createTandem( 'view' ) ),
      {
        name: BsshsSemiconductorStrings.screen.rectifierStringProperty,
        homeScreenIcon: createIcon(),
        tandem: tandem
      }
    );
  }
}

bsshsSemiconductor.register( 'RectifierScreen', RectifierScreen );
