// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Factories for the stock controls used on both screens, with the same fonts and enlarged touch areas: a compact
 * NumberControl (title and value on one row, arrows and slider below), and a measurement table (label · value rows).
 */

import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Dimension2 from '../../../dot/js/Dimension2.js';
import Range from '../../../dot/js/Range.js';
import NumberControl from '../../../scenery-phet/js/NumberControl.js';
import NumberDisplay from '../../../scenery-phet/js/NumberDisplay.js';
import GridBox from '../../../scenery/js/layout/nodes/GridBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Text from '../../../scenery/js/nodes/Text.js';
import type PhetioProperty from '../../../axon/js/PhetioProperty.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';

const C = PolarizationViewConstants;

export type ControlSpec = {
  delta: number;
  decimalPlaces: number;
  valuePattern?: TReadOnlyProperty<string>;
  trackWidth: number;
  enabledProperty?: TReadOnlyProperty<boolean>;
};

export type ReadoutRow = {
  label: TReadOnlyProperty<string>;
  property: TReadOnlyProperty<number | null>;
  range: Range;
  decimalPlaces: number;
  valuePattern?: TReadOnlyProperty<string>;
};

const PolarizationControls = {

  /** A NumberControl whose title may be a string or a Node (e.g. a checkbox). */
  numberControl( title: TReadOnlyProperty<string> | Node, property: PhetioProperty<number>, range: Range, spec: ControlSpec,
                 tandem: Tandem ): NumberControl {
    const control = new NumberControl( title, property, range, {
      delta: spec.delta,
      layoutFunction: NumberControl.createLayoutFunction4( { verticalSpacing: 6, arrowButtonSpacing: 8 } ),
      titleNodeOptions: { font: C.CONTROL_FONT, maxWidth: spec.trackWidth },
      numberDisplayOptions: {
        decimalPlaces: spec.decimalPlaces,
        ...( spec.valuePattern ? { valuePattern: spec.valuePattern } : {} ), // undefined would replace the default
        textOptions: { font: C.CONTROL_FONT },
        maxWidth: 120
      },
      sliderOptions: {
        trackSize: new Dimension2( spec.trackWidth, 4 ),
        thumbSize: new Dimension2( 18, 30 ),
        thumbTouchAreaXDilation: C.SLIDER_THUMB_TOUCH_X,
        thumbTouchAreaYDilation: C.SLIDER_THUMB_TOUCH_Y,
        thumbMouseAreaXDilation: 4,
        thumbMouseAreaYDilation: 4
      },
      arrowButtonOptions: {
        scale: 0.85,
        touchAreaXDilation: C.TOUCH_DILATION,
        touchAreaYDilation: C.TOUCH_DILATION
      },
      tandem: tandem
    } );
    spec.enabledProperty && spec.enabledProperty.link( enabled => { control.enabled = enabled; } );
    return control;
  },

  /** Rows of "label   value" with right-aligned values. */
  readoutTable( title: TReadOnlyProperty<string>, rows: ReadoutRow[] ): Node {
    const rowNodes: Node[][] = rows.map( row => [
      new Text( row.label, { font: C.FONT, maxWidth: 250 } ),
      new NumberDisplay( row.property, row.range, {
        decimalPlaces: row.decimalPlaces,
        ...( row.valuePattern ? { valuePattern: row.valuePattern } : {} ),
        textOptions: { font: C.FONT },
        align: 'right',
        maxWidth: 140
      } )
    ] );
    const grid = new GridBox( {
      rows: rowNodes,
      xSpacing: 12,
      ySpacing: 6,
      xAlign: 'left'
    } );
    rowNodes.forEach( r => r[ 1 ].mutateLayoutOptions( { xAlign: 'right' } ) );
    return new VBox( {
      spacing: 8,
      align: 'left',
      children: [ new Text( title, { font: C.TITLE_FONT, maxWidth: 300 } ), grid ]
    } );
  }
};

bsshsPolarization.register( 'PolarizationControls', PolarizationControls );

export default PolarizationControls;
