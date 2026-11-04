// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * What the detector and the electron give: λ′, Δλ, the Compton wavelength, E before and E′ + Kₑ after (energy
 * conservation), E′, Kₑ, the recoil angle φ and the electron speed v (as a fraction of c).
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Panel from '../../../sun/js/Panel.js';
import bsshsCompton from '../bsshsCompton.js';
import BsshsComptonStrings from '../BsshsComptonStrings.js';
import type BsshsComptonModel from '../model/BsshsComptonModel.js';
import ComptonViewConstants from './ComptonViewConstants.js';

const C = ComptonViewConstants;
const ROW_SPACING = 5;

/** A value formatted into a pattern ("{{value}} pm" etc.). */
function formatted( pattern: TReadOnlyProperty<string> | string, value: TReadOnlyProperty<number>, decimals: number ): TReadOnlyProperty<string> {
  const patternProperty = typeof pattern === 'string' ? null : pattern;
  return patternProperty ?
         new DerivedProperty( [ patternProperty, value ], ( p, v ) => p.replace( '{{value}}', toFixed( v, decimals ) ) ) :
         new DerivedProperty( [ value ], v => ( pattern as string ).replace( '{{value}}', toFixed( v, decimals ) ) );
}

export default class ReadoutPanel extends Panel {

  public constructor( model: BsshsComptonModel ) {
    const keV = '{{value}} keV'; // kept out of the strings file (see ComptonControlPanel)
    const comptonWavelength = new DerivedProperty( [ model.incidentWavelengthProperty ], () => model.comptonWavelength );

    const rows: [ TReadOnlyProperty<string>, TReadOnlyProperty<string> ][] = [
      [ BsshsComptonStrings.scatteredWavelengthStringProperty, formatted( BsshsComptonStrings.picometersPatternStringProperty, model.scatteredWavelengthProperty, 3 ) ],
      [ BsshsComptonStrings.wavelengthShiftStringProperty, formatted( BsshsComptonStrings.picometersPatternStringProperty, model.wavelengthShiftProperty, 3 ) ],
      [ BsshsComptonStrings.comptonWavelengthStringProperty, formatted( BsshsComptonStrings.picometersPatternStringProperty, comptonWavelength, 3 ) ],
      [ BsshsComptonStrings.scatteredEnergyStringProperty, formatted( keV, model.scatteredEnergyProperty, 3 ) ],
      [ BsshsComptonStrings.electronKineticEnergyStringProperty, formatted( keV, model.electronKineticEnergyProperty, 3 ) ],
      [ BsshsComptonStrings.incidentEnergyStringProperty, formatted( keV, model.incidentEnergyProperty, 3 ) ],
      [ BsshsComptonStrings.energyAfterStringProperty, formatted( keV, model.energyAfterProperty, 3 ) ],
      [ BsshsComptonStrings.recoilAngleStringProperty, formatted( BsshsComptonStrings.degreesPatternStringProperty, model.recoilAngleProperty, 1 ) ],
      [ BsshsComptonStrings.electronSpeedStringProperty, formatted( BsshsComptonStrings.speedPatternStringProperty, model.electronSpeedProperty, 4 ) ]
    ];

    const labels = new VBox( {
      spacing: ROW_SPACING, align: 'left',
      children: rows.map( ( [ label ] ) => new Text( label, { font: C.LABEL_FONT, maxWidth: 190 } ) )
    } );
    const values = new VBox( {
      spacing: ROW_SPACING, align: 'right',
      children: rows.map( ( [ , value ] ) => new Text( value, { font: C.VALUE_FONT, maxWidth: 110 } ) )
    } );

    super( new VBox( {
      spacing: 8, align: 'left',
      children: [
        new Text( BsshsComptonStrings.readoutsTitleStringProperty, { font: C.TITLE_FONT, maxWidth: 300 } ),
        new HBox( { spacing: 16, align: 'top', children: [ labels, values ] } )
      ]
    } ), {
      xMargin: 14,
      yMargin: C.PANEL_MARGIN,
      cornerRadius: C.PANEL_CORNER_RADIUS
    } );
  }
}

bsshsCompton.register( 'ReadoutPanel', ReadoutPanel );
