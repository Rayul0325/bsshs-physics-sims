// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The detector's wavelength scale: a pm axis that starts just below the incident wavelength and spans the largest
 * possible shift (2 h/mₑc ≈ 4.85 pm), with a marker at λ (incident) and at λ′ (scattered) and the gap Δλ between.
 * The axis moves with λ, so the shift is read on the same scale for every incident wavelength.
 */

import Multilink from '../../../axon/js/Multilink.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import bsshsCompton from '../bsshsCompton.js';
import BsshsComptonStrings from '../BsshsComptonStrings.js';
import type BsshsComptonModel from '../model/BsshsComptonModel.js';
import ComptonViewConstants from './ComptonViewConstants.js';
import InsetPanel from './InsetPanel.js';

const C = ComptonViewConstants;
const WIDTH = 210;
const AXIS_Y = 74;
const BELOW = 0.7; // pm shown below λ
const SPAN = 6.2; // pm shown in total
const TICK_COUNT = 7;

export default class DetectorScaleNode extends InsetPanel {

  public constructor( model: BsshsComptonModel ) {
    const axis = new Line( 0, AXIS_Y, WIDTH, AXIS_Y, { stroke: C.DEVICE_COLOR, lineWidth: 1.5 } );
    const ticks = new Node();
    const incidentMarker = new Line( 0, 22, 0, AXIS_Y, { stroke: C.PHOTON_COLOR, lineWidth: 3, lineDash: [ 4, 3 ] } );
    const scatteredMarker = new Line( 0, 22, 0, AXIS_Y, { stroke: C.SCATTERED_PHOTON_COLOR, lineWidth: 3 } );
    const incidentLabel = new Text( 'λ', { font: C.LABEL_FONT, fill: C.PHOTON_COLOR } );
    const scatteredLabel = new Text( 'λ′', { font: C.LABEL_FONT, fill: C.SCATTERED_PHOTON_COLOR } );
    const shiftArrow = new ArrowNode( 0, 48, 1, 48, {
      doubleHead: true, fill: C.GUIDE_COLOR, stroke: null, tailWidth: 1.5, headWidth: 8, headHeight: 6
    } );
    const shiftLabel = new Text( 'Δλ', { font: C.SMALL_FONT } );
    const axisLabel = new Text( BsshsComptonStrings.scaleAxisStringProperty, { font: C.SMALL_FONT, maxWidth: WIDTH } );
    axisLabel.boundsProperty.link( () => { axisLabel.centerX = WIDTH / 2; axisLabel.top = AXIS_Y + 22; } );

    const content = new Node( {
      children: [ new Rectangle( 0, 0, WIDTH, AXIS_Y + 40, { pickable: false } ),
        axis, ticks, incidentMarker, scatteredMarker, shiftArrow, shiftLabel, incidentLabel, scatteredLabel, axisLabel ]
    } );

    super( BsshsComptonStrings.scaleTitleStringProperty, content, WIDTH );

    Multilink.multilink( [ model.resultProperty ], r => {
      const lo = r.incidentWavelength - BELOW;
      const X = ( lambda: number ) => ( lambda - lo ) / SPAN * WIDTH;

      const children: Node[] = [];
      const first = Math.ceil( lo );
      for ( let i = 0; i < TICK_COUNT; i++ ) {
        const t = first + i;
        if ( t > lo + SPAN ) { break; }
        const x = X( t );
        children.push( new Line( x, AXIS_Y, x, AXIS_Y + 6, { stroke: C.DEVICE_COLOR } ) );
        const label = new Text( toFixed( t, 0 ), { font: C.SMALL_FONT } );
        label.centerX = x;
        label.top = AXIS_Y + 7;
        children.push( label );
      }
      ticks.children = children;

      const x1 = X( r.incidentWavelength );
      const x2 = X( r.scatteredWavelength );
      incidentMarker.setLine( x1, 22, x1, AXIS_Y );
      scatteredMarker.setLine( x2, 22, x2, AXIS_Y );
      incidentLabel.right = x1 - 2;
      incidentLabel.bottom = 22;
      scatteredLabel.left = x2 + 2;
      scatteredLabel.bottom = 22;
      const showShift = x2 - x1 > 14;
      shiftArrow.visible = showShift;
      shiftLabel.visible = showShift;
      if ( showShift ) {
        shiftArrow.setTailAndTip( x1 + 2, 48, x2 - 2, 48 );
        shiftLabel.centerX = ( x1 + x2 ) / 2;
        shiftLabel.bottom = 44;
      }
    } );
  }
}

bsshsCompton.register( 'DetectorScaleNode', DetectorScaleNode );
