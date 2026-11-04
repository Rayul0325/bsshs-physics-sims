// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Gain against loss: a bar for the gain coefficient g = σn(N₂ − N₁)/N (negative = net absorption) and a line
 * for the loss the cavity must make up (the threshold gain). Lasing starts when the bar reaches the line, and
 * then the bar stays there (gain clamping) however hard the medium is pumped.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Color from '../../../scenery/js/util/Color.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import bsshsLaser from '../bsshsLaser.js';
import BsshsLaserStrings from '../BsshsLaserStrings.js';
import LaserModel from '../model/LaserModel.js';
import LaserViewConstants from './LaserViewConstants.js';

const AXIS_X = 18;
const BAR_WIDTH = 34;
const TOP = 30; // y of the top of the scale
const HEIGHT = 250;
const G_MAX = 3.6; // 1/m at the top (the largest threshold, R = 50 %, is 3.52 1/m)
const G_MIN = -2; // 1/m at the bottom (no atom excited)
const yOf = ( g: number ) => TOP + ( G_MAX - g ) / ( G_MAX - G_MIN ) * HEIGHT;

export default class GainMeterNode extends Node {

  public constructor( model: LaserModel ) {
    super();
    const title = new Text( BsshsLaserStrings.gain.titleStringProperty, { font: LaserViewConstants.TITLE_FONT, maxWidth: 150, left: 0, top: 0 } );

    const frame = new Rectangle( AXIS_X, TOP, BAR_WIDTH, HEIGHT, { stroke: Color.GRAY, lineWidth: 1 } );
    const zero = new Line( AXIS_X - 6, yOf( 0 ), AXIS_X + BAR_WIDTH + 6, yOf( 0 ), { stroke: Color.DARK_GRAY, lineWidth: 1.5 } );
    const zeroLabel = new Text( '0', { font: LaserViewConstants.SMALL_FONT, right: AXIS_X - 8, centerY: yOf( 0 ) } );
    const bar = new Rectangle( AXIS_X + 4, 0, BAR_WIDTH - 8, 1, { fill: LaserViewConstants.GAIN } );
    const lossLine = new Line( AXIS_X - 8, 0, AXIS_X + BAR_WIDTH + 8, 0, { stroke: LaserViewConstants.LOSS, lineWidth: 3.5 } );

    // Each mark is labeled with its name and value on two lines, so the meter stays narrow.
    const label = ( name: TReadOnlyProperty<string>, value: TReadOnlyProperty<number>, fill: Color ) => new VBox( {
      align: 'left',
      spacing: 1,
      children: [
        new Text( name, { font: LaserViewConstants.SMALL_FONT, fill: fill, maxWidth: 96 } ),
        new Text( new DerivedProperty( [ value, BsshsLaserStrings.units.perMeterPatternStringProperty ],
          ( g, p ) => StringUtils.fillIn( p, { value: toFixed( g, 3 ) } ) ), { font: LaserViewConstants.SMALL_FONT, fill: fill, maxWidth: 96 } )
      ]
    } );
    const gainText = label( BsshsLaserStrings.gain.gainStringProperty, model.gainCoefficientProperty, LaserViewConstants.GAIN );
    const lossText = label( BsshsLaserStrings.gain.lossStringProperty, model.thresholdGainProperty, LaserViewConstants.LOSS );
    const textLeft = AXIS_X + BAR_WIDTH + 12;

    this.children = [ title, frame, bar, zero, zeroLabel, lossLine, gainText, lossText ];

    Multilink.multilink( [ model.gainCoefficientProperty, model.thresholdGainProperty ], ( g, gth ) => {
      const y0 = yOf( 0 );
      const yg = yOf( Math.max( G_MIN, Math.min( G_MAX, g ) ) );
      bar.setRect( AXIS_X + 4, Math.min( y0, yg ), BAR_WIDTH - 8, Math.max( 0.001, Math.abs( yg - y0 ) ) );
      bar.visible = Math.abs( yg - y0 ) > 0.2;
      const yl = yOf( Math.min( G_MAX, gth ) );
      lossLine.y = yl;
      // Labels next to their marks, kept apart and inside the scale.
      let lossY = yl;
      let gainY = yg;
      if ( Math.abs( lossY - gainY ) < 42 ) {
        const mid = ( lossY + gainY ) / 2;
        lossY = mid - 21;
        gainY = mid + 21;
      }
      lossText.left = gainText.left = textLeft;
      lossText.centerY = Math.max( TOP + 18, Math.min( TOP + HEIGHT - 18, lossY ) );
      gainText.centerY = Math.max( TOP + 18, Math.min( TOP + HEIGHT - 18, gainY ) );
    } );
  }
}

bsshsLaser.register( 'GainMeterNode', GainMeterNode );
