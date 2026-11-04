// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Energy conservation as two bars on the same scale: before the collision the photon energy E; after it, the
 * scattered photon energy E′ with the electron kinetic energy Kₑ stacked on top. Kₑ comes from the electron's
 * momentum (relativistic), so the equal heights are a check of conservation, not a construction.
 */

import Multilink from '../../../axon/js/Multilink.js';
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
const BAR_WIDTH = 38;
const BAR_HEIGHT = 104;
const BEFORE_X = 8;
const AFTER_X = 76;
const WIDTH = 140;

export default class EnergyBarsNode extends InsetPanel {

  public constructor( model: BsshsComptonModel ) {
    const before = new Rectangle( BEFORE_X, 0, BAR_WIDTH, BAR_HEIGHT, { fill: C.PHOTON_COLOR } );
    const afterPhoton = new Rectangle( AFTER_X, 0, BAR_WIDTH, 1, { fill: C.SCATTERED_PHOTON_COLOR } );
    const afterElectron = new Rectangle( AFTER_X, 0, BAR_WIDTH, 1, { fill: C.ELECTRON_COLOR } );
    const topLine = new Line( 0, 0, WIDTH, 0, { stroke: C.GUIDE_COLOR, lineDash: [ 4, 3 ] } );
    const eLabel = new Text( 'E', { font: C.LABEL_FONT, fill: C.ON_DEVICE_TEXT_COLOR } );
    const e2Label = new Text( 'E′', { font: C.LABEL_FONT, fill: C.ON_DEVICE_TEXT_COLOR } );
    const kLabel = new Text( 'Kₑ', { font: C.LABEL_FONT, fill: C.ELECTRON_COLOR } );
    eLabel.center = before.center;
    const beforeText = new Text( BsshsComptonStrings.beforeStringProperty, { font: C.SMALL_FONT, maxWidth: 64 } );
    const afterText = new Text( BsshsComptonStrings.afterStringProperty, { font: C.SMALL_FONT, maxWidth: 64 } );
    beforeText.boundsProperty.link( () => { beforeText.centerX = BEFORE_X + BAR_WIDTH / 2; beforeText.top = BAR_HEIGHT + 4; } );
    afterText.boundsProperty.link( () => { afterText.centerX = AFTER_X + BAR_WIDTH / 2; afterText.top = BAR_HEIGHT + 4; } );

    const content = new Node( {
      children: [ new Rectangle( 0, 0, WIDTH, BAR_HEIGHT + 22, { pickable: false } ),
        before, afterPhoton, afterElectron, topLine, eLabel, e2Label, kLabel, beforeText, afterText ]
    } );

    super( BsshsComptonStrings.energyTitleStringProperty, content, WIDTH );

    Multilink.multilink( [ model.resultProperty ], r => {
      const s = BAR_HEIGHT / r.incidentEnergy;
      const photonHeight = r.scatteredEnergy * s;
      const electronHeight = r.electronKineticEnergy * s;
      afterPhoton.setRect( AFTER_X, BAR_HEIGHT - photonHeight, BAR_WIDTH, photonHeight );
      afterElectron.visible = electronHeight > 0.05;
      afterElectron.setRect( AFTER_X, BAR_HEIGHT - photonHeight - electronHeight, BAR_WIDTH, Math.max( electronHeight, 0.05 ) );
      e2Label.center = afterPhoton.center;
      kLabel.visible = afterElectron.visible;
      kLabel.left = AFTER_X + BAR_WIDTH + 3;
      kLabel.centerY = Math.max( BAR_HEIGHT - photonHeight - electronHeight / 2, kLabel.height / 2 );
    } );
  }
}

bsshsCompton.register( 'EnergyBarsNode', EnergyBarsNode );
