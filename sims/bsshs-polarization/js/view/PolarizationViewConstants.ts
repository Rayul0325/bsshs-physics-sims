// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Shared view constants: font sizes, layout sizes, touch-area margins and the physically meaningful light color.
 * No design colors here: panels, buttons, sliders and checkboxes keep the stock defaults that the build's theme
 * patches recolor; the beam color is computed from a wavelength.
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Color from '../../../scenery/js/util/Color.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import VisibleColor from '../../../scenery-phet/js/VisibleColor.js';
import bsshsPolarization from '../bsshsPolarization.js';

const PolarizationViewConstants = {

  // Text
  FONT: new PhetFont( 16 ),
  SMALL_FONT: new PhetFont( 14 ),
  TITLE_FONT: new PhetFont( { size: 17, weight: 'bold' } ),
  CONTROL_FONT: new PhetFont( 16 ),

  // Labels inside the drawings (bench, ray diagram, chart): larger, because the drawings are scaled down to fit a
  // phone's width in the portrait layout.
  DRAWING_FONT: new PhetFont( 20 ),
  DRAWING_SMALL_FONT: new PhetFont( 18 ),

  // Landscape: the stock 1024 × 618 layout. The drawer's open button sits at the middle of the right window edge,
  // so the right column ends RIGHT_MARGIN short of the layout edge.
  MARGIN: 16,
  RIGHT_MARGIN: 52,
  SPACING: 12,

  // Portrait (phones held upright): content is laid out in a PORTRAIT_WIDTH-wide column and scaled to the window
  // width, so controls stay large on a 390 px screen. TOP_BAND keeps the top strip free for the drawer button.
  PORTRAIT_WIDTH: 500,
  PORTRAIT_TOP_BAND: 96,
  PORTRAIT_ASPECT: 0.9, // width / height below which the portrait layout is used

  // Touch: dilations (view units) that bring every control to ≥ 44 CSS px even in the portrait layout.
  TOUCH_DILATION: 23,
  SLIDER_THUMB_TOUCH_X: 25,
  SLIDER_THUMB_TOUCH_Y: 20,

  // Light: a green laser line (532 nm), as a physical color.
  BEAM_COLOR: VisibleColor.wavelengthToColor( 532 ) as Color,

  /** Portrait content bounds for a given content height. */
  portraitBounds( height: number ): Bounds2 {
    return new Bounds2( 0, 0, PolarizationViewConstants.PORTRAIT_WIDTH, height );
  }
};

bsshsPolarization.register( 'PolarizationViewConstants', PolarizationViewConstants );

export default PolarizationViewConstants;
