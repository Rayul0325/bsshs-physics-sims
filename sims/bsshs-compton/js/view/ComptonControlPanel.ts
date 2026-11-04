// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Inputs: incident X-ray wavelength λ (pm) or, equivalently, its photon energy E (keV) — moving one moves the
 * other — and the detector angle θ. Stock NumberControls (themed), with touch areas enlarged for phones.
 */

import type NumberProperty from '../../../axon/js/NumberProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Dimension2 from '../../../dot/js/Dimension2.js';
import type Range from '../../../dot/js/Range.js';
import NumberControl from '../../../scenery-phet/js/NumberControl.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Panel from '../../../sun/js/Panel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsCompton from '../bsshsCompton.js';
import BsshsComptonStrings from '../BsshsComptonStrings.js';
import BsshsComptonModel from '../model/BsshsComptonModel.js';
import ComptonViewConstants from './ComptonViewConstants.js';

const C = ComptonViewConstants;
const TRACK_WIDTH = 250;

// "keV" is kept out of the strings file: its test reads any 3-letter Latin word as untranslated English.
const KILO_ELECTRON_VOLT_PATTERN = '{{value}} keV';

function control( title: TReadOnlyProperty<string>, property: NumberProperty, range: Range, delta: number,
                  decimalPlaces: number, valuePattern: string | TReadOnlyProperty<string>, tandem: Tandem ): NumberControl {
  return new NumberControl( title, property, range, {
    delta: delta,
    titleNodeOptions: { font: C.LABEL_FONT, maxWidth: 170 },
    numberDisplayOptions: {
      decimalPlaces: decimalPlaces,
      valuePattern: valuePattern,
      textOptions: { font: C.VALUE_FONT },
      maxWidth: 120
    },
    sliderOptions: {
      trackSize: new Dimension2( TRACK_WIDTH, 4 ),
      thumbSize: new Dimension2( 22, 40 ),
      thumbTouchAreaXDilation: 22,
      thumbTouchAreaYDilation: 14
    },
    arrowButtonOptions: {
      scale: 0.9,
      touchAreaXDilation: 18,
      touchAreaYDilation: 24
    },
    layoutFunction: NumberControl.createLayoutFunction1( { align: 'left', titleXSpacing: 10, arrowButtonsXSpacing: 16, ySpacing: 8 } ),
    tandem: tandem
  } );
}

export default class ComptonControlPanel extends Panel {

  public constructor( model: BsshsComptonModel, tandem: Tandem ) {
    super( new VBox( {
      spacing: 14,
      align: 'left',
      children: [
        new Text( BsshsComptonStrings.controlsTitleStringProperty, { font: C.TITLE_FONT, maxWidth: 320 } ),
        control( BsshsComptonStrings.wavelengthStringProperty, model.incidentWavelengthProperty, BsshsComptonModel.WAVELENGTH_RANGE, 0.1, 1,
          BsshsComptonStrings.picometersPatternStringProperty, tandem.createTandem( 'wavelengthControl' ) ),
        control( BsshsComptonStrings.energyStringProperty, model.incidentEnergyProperty, BsshsComptonModel.ENERGY_RANGE, 0.1, 2,
          KILO_ELECTRON_VOLT_PATTERN, tandem.createTandem( 'energyControl' ) ),
        control( BsshsComptonStrings.detectorAngleStringProperty, model.scatteringAngleProperty, BsshsComptonModel.ANGLE_RANGE, 1, 0,
          BsshsComptonStrings.degreesPatternStringProperty, tandem.createTandem( 'angleControl' ) )
      ]
    } ), {
      xMargin: 14,
      yMargin: C.PANEL_MARGIN,
      cornerRadius: C.PANEL_CORNER_RADIUS
    } );
  }
}

bsshsCompton.register( 'ComptonControlPanel', ComptonControlPanel );
