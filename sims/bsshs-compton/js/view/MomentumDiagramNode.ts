// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Momentum conservation as a closed vector triangle: p (incident photon) = p′ (scattered photon) + pₑ (electron).
 * p′ starts at the origin and pₑ starts at the tip of p′, so their sum ends at the tip of p. The whole triangle is
 * scaled to fit the box, keeping the true length ratios and directions (θ above, φ below the incident axis).
 */

import Multilink from '../../../axon/js/Multilink.js';
import Vector2 from '../../../dot/js/Vector2.js';
import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import bsshsCompton from '../bsshsCompton.js';
import BsshsComptonStrings from '../BsshsComptonStrings.js';
import type BsshsComptonModel from '../model/BsshsComptonModel.js';
import ComptonViewConstants from './ComptonViewConstants.js';
import InsetPanel from './InsetPanel.js';

const C = ComptonViewConstants;
const BOX_WIDTH = 200;
const BOX_HEIGHT = 112;
const PAD = 14; // room for labels around the triangle
const ARROW_OPTIONS = { stroke: null, tailWidth: 3.5, headWidth: 12, headHeight: 10 };

export default class MomentumDiagramNode extends InsetPanel {

  public constructor( model: BsshsComptonModel ) {
    const pArrow = new ArrowNode( 0, 0, 1, 0, { ...ARROW_OPTIONS, fill: C.PHOTON_COLOR } );
    const p2Arrow = new ArrowNode( 0, 0, 1, 0, { ...ARROW_OPTIONS, fill: C.SCATTERED_PHOTON_COLOR } );
    const peArrow = new ArrowNode( 0, 0, 1, 0, { ...ARROW_OPTIONS, fill: C.ELECTRON_COLOR } );
    const pLabel = new Text( 'p', { font: C.LABEL_FONT, fill: C.PHOTON_COLOR } );
    const p2Label = new Text( 'p′', { font: C.LABEL_FONT, fill: C.SCATTERED_PHOTON_COLOR } );
    const peLabel = new Text( 'pₑ', { font: C.LABEL_FONT, fill: C.ELECTRON_COLOR } );

    const drawing = new Node( {
      children: [ new Rectangle( 0, 0, BOX_WIDTH, BOX_HEIGHT, { pickable: false } ), pArrow, p2Arrow, peArrow, pLabel, p2Label, peLabel ]
    } );
    const note = new Text( BsshsComptonStrings.momentumNoteStringProperty, { font: C.SMALL_FONT, maxWidth: BOX_WIDTH } );

    super( BsshsComptonStrings.momentumTitleStringProperty, new VBox( { spacing: 4, align: 'left', children: [ drawing, note ] } ), BOX_WIDTH );

    Multilink.multilink( [ model.resultProperty ], r => {
      const theta = r.scatteringAngle * Math.PI / 180;
      const p = r.incidentMomentum;
      const ax = r.scatteredMomentum * Math.cos( theta ); // tip of p′
      const ay = -r.scatteredMomentum * Math.sin( theta ); // screen y is down
      const minX = Math.min( 0, ax );
      const maxX = Math.max( p, ax );
      const minY = Math.min( 0, ay );
      const maxY = 0;
      const w = maxX - minX;
      const h = maxY - minY;
      const s = Math.min( ( BOX_WIDTH - 2 * PAD ) / w, h > 1e-9 ? ( BOX_HEIGHT - 2 * PAD ) / h : Infinity );
      const ox = ( BOX_WIDTH - w * s ) / 2 - minX * s;
      const oy = ( BOX_HEIGHT - h * s ) / 2 - minY * s;
      const X = ( x: number ) => ox + x * s;
      const Y = ( y: number ) => oy + y * s;

      pArrow.setTailAndTip( X( 0 ), Y( 0 ), X( p ), Y( 0 ) );
      p2Arrow.setTailAndTip( X( 0 ), Y( 0 ), X( ax ), Y( ay ) );
      const electronVisible = r.electronMomentum / p > 1e-6;
      peArrow.visible = electronVisible;
      peLabel.visible = electronVisible;
      if ( electronVisible ) { peArrow.setTailAndTip( X( ax ), Y( ay ), X( p ), Y( 0 ) ); }

      pLabel.centerX = X( p / 2 );
      pLabel.top = Y( 0 ) + 3;
      // each label sits beside the middle of its arrow, on the side away from the triangle's third corner
      const outside = ( x1: number, y1: number, x2: number, y2: number, ox: number, oy: number, label: Node ) => {
        const mx = ( x1 + x2 ) / 2;
        const my = ( y1 + y2 ) / 2;
        const len = Math.hypot( x2 - x1, y2 - y1 ) || 1;
        let nx = -( y2 - y1 ) / len;
        let ny = ( x2 - x1 ) / len;
        if ( nx * ( ox - mx ) + ny * ( oy - my ) > 0 ) { nx = -nx; ny = -ny; }
        if ( Math.abs( nx * ( ox - mx ) + ny * ( oy - my ) ) < 1e-6 ) { nx = 0; ny = -1; } // flat triangle: above
        label.center = new Vector2( mx + nx * 13, my + ny * 13 );
      };
      outside( X( 0 ), Y( 0 ), X( ax ), Y( ay ), X( p ), Y( 0 ), p2Label );
      outside( X( ax ), Y( ay ), X( p ), Y( 0 ), X( 0 ), Y( 0 ), peLabel );
      if ( Math.abs( Y( ay ) - Y( 0 ) ) < 8 ) { peLabel.centerY = Y( 0 ) - 26; } // flat triangle: stack above p′
    } );
  }
}

bsshsCompton.register( 'MomentumDiagramNode', MomentumDiagramNode );
