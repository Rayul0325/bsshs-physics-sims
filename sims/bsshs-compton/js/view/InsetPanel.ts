// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * A stock Panel (themed colors) with a bold title above its content.
 */

import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import type Node from '../../../scenery/js/nodes/Node.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Panel from '../../../sun/js/Panel.js';
import bsshsCompton from '../bsshsCompton.js';
import ComptonViewConstants from './ComptonViewConstants.js';

export default class InsetPanel extends Panel {
  public constructor( title: TReadOnlyProperty<string>, content: Node, titleMaxWidth: number ) {
    super( new VBox( {
      spacing: 6,
      align: 'left',
      children: [ new Text( title, { font: ComptonViewConstants.TITLE_FONT, maxWidth: titleMaxWidth } ), content ]
    } ), {
      xMargin: ComptonViewConstants.PANEL_MARGIN,
      yMargin: ComptonViewConstants.PANEL_MARGIN,
      cornerRadius: ComptonViewConstants.PANEL_CORNER_RADIUS
    } );
  }
}

bsshsCompton.register( 'InsetPanel', InsetPanel );
