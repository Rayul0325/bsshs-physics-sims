// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Energy-level diagram of the 3-level atom drawn to scale (E₁ = 0 eV at the bottom): pump E₁ → E₃, fast
 * non-radiative E₃ → E₂, lasing E₂ → E₁ in the color of the emitted light. Next to E₁ and E₂ a bar shows the
 * share of atoms in that level, so the inversion N₂ > N₁ can be seen directly.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
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

// Columns: pump label | pump arrow | level lines with their labels | decay arrows | population bars.
const PUMP_X = 44;
const LINE_LEFT = 38;
const LABEL_LEFT = 54;
const DECAY_X = 218;
const LINE_RIGHT = 232;
const E1_Y = 278;
const PIXELS_PER_EV = 62; // E₃ at most 3.6 eV → 223 px above E₁
const BAR_LEFT = LINE_RIGHT + 10;
const BAR_MAX = 76; // px for 100 %
const BAR_HEIGHT = 16;
const HC_EV_NM = 1239.84198; // h·c in eV·nm

export default class EnergyLevelNode extends Node {

  public constructor( model: LaserModel ) {
    super();
    const lightColorProperty = new DerivedProperty( [ model.wavelengthProperty ], nm => LaserViewConstants.lightColor( nm ) );
    const pumpColorProperty = new DerivedProperty( [ model.pumpLevelEnergyProperty ], e3 => LaserViewConstants.lightColor( HC_EV_NM / e3 ) );

    const title = new Text( BsshsLaserStrings.levels.titleStringProperty, { font: LaserViewConstants.TITLE_FONT, maxWidth: 280, left: 0, top: 0 } );

    const levelLine = () => new Line( LINE_LEFT, 0, LINE_RIGHT, 0, { stroke: Color.BLACK, lineWidth: 2.5 } );
    const e1Line = levelLine();
    const e2Line = levelLine();
    const e3Line = levelLine();
    const labelOptions = { font: LaserViewConstants.SMALL_FONT, maxWidth: DECAY_X - LABEL_LEFT - 12 };
    const energyText = ( nameProperty: TReadOnlyProperty<string>, energyProperty: TReadOnlyProperty<number> ) =>
      new Text( new DerivedProperty( [ nameProperty, energyProperty, BsshsLaserStrings.units.electronVoltsPatternStringProperty ],
        ( name, e, pattern ) => `${name} · ${StringUtils.fillIn( pattern, { value: toFixed( e, 2 ) } )}` ), labelOptions );
    const e1Label = energyText( BsshsLaserStrings.levels.lowerLevelStringProperty, model.lowerLevelEnergyProperty );
    const e2Label = energyText( BsshsLaserStrings.levels.upperLevelStringProperty, model.upperLevelEnergyProperty );
    const e3Label = energyText( BsshsLaserStrings.levels.pumpLevelStringProperty, model.pumpLevelEnergyProperty );

    // Transitions.
    const pumpArrow = new ArrowNode( 0, 0, 0, -10, { headHeight: 9, headWidth: 12, tailWidth: 4, fill: pumpColorProperty, stroke: Color.GRAY, lineWidth: 0.5 } );
    const fastArrow = new ArrowNode( 0, 0, 0, 10, { headHeight: 7, headWidth: 10, tailWidth: 2, fill: Color.GRAY, stroke: null } );
    const laserArrow = new ArrowNode( 0, 0, 0, 10, { headHeight: 9, headWidth: 12, tailWidth: 4, fill: lightColorProperty, stroke: Color.GRAY, lineWidth: 0.5 } );
    const pumpLabel = new Text( BsshsLaserStrings.levels.pumpStringProperty, { font: LaserViewConstants.SMALL_FONT, maxWidth: 50 } );
    const fastLabel = new Text( BsshsLaserStrings.levels.fastDecayStringProperty, { font: LaserViewConstants.SMALL_FONT, maxWidth: 80 } );
    const laserLabel = new Text( BsshsLaserStrings.levels.laserLightStringProperty, { font: LaserViewConstants.SMALL_FONT, maxWidth: 80 } );

    // Population bars (share of all atoms).
    const bar = ( fill: Color | TReadOnlyProperty<Color> ) =>
      new Rectangle( BAR_LEFT, 0, BAR_MAX, BAR_HEIGHT, { fill: fill, stroke: Color.DARK_GRAY, lineWidth: 1 } );
    const frame = () => new Rectangle( BAR_LEFT, 0, BAR_MAX, BAR_HEIGHT, { stroke: Color.GRAY, lineWidth: 1 } );
    const n1Bar = bar( LaserViewConstants.GROUND_ATOM );
    const n2Bar = bar( lightColorProperty );
    const n1Frame = frame();
    const n2Frame = frame();
    const percent = ( p: number ) => StringUtils.fillIn( BsshsLaserStrings.levels.populationPatternStringProperty.value, { value: toFixed( p, 1 ) } );
    const n1Text = new Text( '', { font: LaserViewConstants.SMALL_FONT, maxWidth: 90 } );
    const n2Text = new Text( '', { font: LaserViewConstants.SMALL_FONT, maxWidth: 90 } );
    const n1Name = new Text( 'N₁', { font: LaserViewConstants.LABEL_FONT } );
    const n2Name = new Text( 'N₂', { font: LaserViewConstants.LABEL_FONT } );

    this.children = [ title, e3Line, e2Line, e1Line, e3Label, e2Label, e1Label, pumpArrow, fastArrow, laserArrow,
      pumpLabel, fastLabel, laserLabel, n1Frame, n2Frame, n1Bar, n2Bar, n1Text, n2Text, n1Name, n2Name ];

    Multilink.multilink( [ model.upperLevelEnergyProperty, model.pumpLevelEnergyProperty ], ( e2, e3 ) => {
      const y2 = E1_Y - e2 * PIXELS_PER_EV;
      const y3 = E1_Y - e3 * PIXELS_PER_EV;
      e1Line.y = E1_Y;
      e2Line.y = y2;
      e3Line.y = y3;
      // E₃ is labeled above its line, E₂ and E₁ below theirs, so the narrow E₃–E₂ gap only holds the fast decay.
      e1Label.left = LABEL_LEFT;
      e1Label.top = E1_Y + 4;
      e2Label.left = LABEL_LEFT;
      e2Label.top = y2 + 4;
      e3Label.left = LABEL_LEFT;
      e3Label.bottom = y3 - 4;

      pumpArrow.setTailAndTip( PUMP_X, E1_Y - 2, PUMP_X, y3 + 2 );
      pumpLabel.right = pumpArrow.left - 4;
      pumpLabel.centerY = ( E1_Y + y3 ) / 2;
      fastArrow.setTailAndTip( DECAY_X, y3 + 2, DECAY_X, y2 - 2 );
      fastLabel.right = fastArrow.left - 6;
      fastLabel.centerY = ( y3 + y2 ) / 2;
      laserArrow.setTailAndTip( DECAY_X, y2 + 2, DECAY_X, E1_Y - 2 );
      laserLabel.right = laserArrow.left - 6;
      laserLabel.centerY = ( y2 + E1_Y ) / 2 + 8;

      n1Bar.y = n1Frame.y = E1_Y - BAR_HEIGHT - 3;
      n2Bar.y = n2Frame.y = y2 - BAR_HEIGHT - 3;
    } );

    Multilink.multilink( [ model.lowerPopulationProperty, model.upperPopulationProperty, model.pumpRateProperty ], ( n1, n2, w ) => {
      n1Bar.setRectWidth( Math.max( 0.001, BAR_MAX * n1 / 100 ) );
      n2Bar.setRectWidth( Math.max( 0.001, BAR_MAX * n2 / 100 ) );
      n1Bar.visible = n1 > 0.05;
      n2Bar.visible = n2 > 0.05;
      n1Text.string = percent( n1 );
      n2Text.string = percent( n2 );
      n1Name.left = n2Name.left = BAR_LEFT;
      n1Name.bottom = n1Bar.y - 2;
      n2Name.bottom = n2Bar.y - 2;
      n1Text.left = n1Name.right + 6;
      n2Text.left = n2Name.right + 6;
      n1Text.centerY = n1Name.centerY;
      n2Text.centerY = n2Name.centerY;
      pumpArrow.opacity = w > 0 ? 1 : 0.3;
    } );
    model.isLasingProperty.link( lasing => { laserArrow.opacity = lasing ? 1 : 0.45; } );
  }
}

bsshsLaser.register( 'EnergyLevelNode', EnergyLevelNode );
