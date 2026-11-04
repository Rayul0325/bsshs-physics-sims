// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * View of the template: a slider control for the input and a numeric readout of the derived value, inside
 * the shared Panel, plus the Reset All button. Only stock PhET components with their default (themed) colors
 * are used, so the bsshs theme applies without any color or font value here.
 */

import NumberControl from '../../../scenery-phet/js/NumberControl.js';
import NumberDisplay from '../../../scenery-phet/js/NumberDisplay.js';
import ResetAllButton from '../../../scenery-phet/js/buttons/ResetAllButton.js';
import ScreenView from '../../../joist/js/ScreenView.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Range from '../../../dot/js/Range.js';
import Panel from '../../../sun/js/Panel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsTemplate from '../bsshsTemplate.js';
import BsshsTemplateStrings from '../BsshsTemplateStrings.js';
import BsshsTemplateModel from '../model/BsshsTemplateModel.js';

// Layout only (spacing in view units); colors and fonts come from the shared components.
const MARGIN = 20;
const SPACING = 16;

export default class BsshsTemplateScreenView extends ScreenView {

  public constructor( model: BsshsTemplateModel, tandem: Tandem ) {
    super( { tandem: tandem } );

    const sideLengthControl = new NumberControl( BsshsTemplateStrings.sideLengthStringProperty, model.sideLengthProperty,
      BsshsTemplateModel.SIDE_LENGTH_RANGE, {
        delta: 0.1,
        numberDisplayOptions: {
          decimalPlaces: 1,
          valuePattern: BsshsTemplateStrings.valueCentimetersPatternStringProperty
        },
        tandem: tandem.createTandem( 'sideLengthControl' )
      } );

    const max = BsshsTemplateModel.SIDE_LENGTH_RANGE.max;
    const areaReadout = new HBox( {
      spacing: SPACING / 2,
      children: [
        new Text( BsshsTemplateStrings.areaStringProperty ),
        new NumberDisplay( model.areaProperty, new Range( 0, max * max ), {
          decimalPlaces: 2,
          valuePattern: BsshsTemplateStrings.valueSquareCentimetersPatternStringProperty
        } )
      ]
    } );

    const panel = new Panel( new VBox( { spacing: SPACING, children: [ sideLengthControl, areaReadout ] } ) );
    panel.center = this.layoutBounds.center;
    this.addChild( panel );

    const resetAllButton = new ResetAllButton( {
      listener: () => {
        this.interruptSubtreeInput();
        model.reset();
      },
      right: this.layoutBounds.maxX - MARGIN,
      bottom: this.layoutBounds.maxY - MARGIN,
      tandem: tandem.createTandem( 'resetAllButton' )
    } );
    this.addChild( resetAllButton );
  }
}

bsshsTemplate.register( 'BsshsTemplateScreenView', BsshsTemplateScreenView );
