// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Layout numbers, fonts and the few physically meaningful colors of the view. Fonts are stock PhetFont sizes (the
 * theme patch supplies the family); colors come from the design tokens (SimTokens, generated at staging time from
 * theme/tokens.json) or are computed from the wavelength.
 */

import Color from '../../../scenery/js/util/Color.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import VisibleColor from '../../../scenery-phet/js/VisibleColor.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';
import SimTokens from './SimTokens.js';

const PhotoelectricViewConstants = {
  MARGIN: 15,
  PANEL_SPACING: 10,
  PANEL_WIDTH: 380,
  TITLE_FONT: new PhetFont( { size: 17, weight: 'bold' } ),
  LABEL_FONT: new PhetFont( 15 ),
  SMALL_FONT: new PhetFont( 13 ),
  READOUT_FONT: new PhetFont( 15 ),

  // Pointer areas reach the 44 px touch-target minimum on a 390 px phone (scale ≈ 0.68 → about 65 view units).
  TOUCH_DILATION: 12,

  // Electrons are drawn in the token electron blue; glass and metal in the neutral tokens.
  ELECTRON_COLOR: new Color( SimTokens.physics.electron ),
  GLASS_STROKE: new Color( SimTokens.color.borderStrong ),
  GLASS_FILL: new Color( SimTokens.physics.glass ).withAlpha( 0.18 ),
  CATHODE_FILL: new Color( SimTokens.physics.conductor ),
  ANODE_FILL: new Color( SimTokens.color.textMuted ),
  WIRE_STROKE: new Color( SimTokens.color.textMuted ),
  LAMP_FILL: new Color( SimTokens.color.inverseSurface ),
  LAMP_TEXT: new Color( SimTokens.textOnDark ),
  LAMP_WINDOW_OFF: new Color( SimTokens.color.textSubtle ),
  CARD_FILL: new Color( SimTokens.surface ),
  GRID_STROKE: new Color( SimTokens.line ),
  AXIS_STROKE: new Color( SimTokens.text ),
  MARKER_FILL: new Color( SimTokens.physics.positive ),
  CUTOFF_STROKE: new Color( SimTokens.color.textMuted ),
  INVISIBLE_LIGHT_COLOR: new Color( SimTokens.color.textSubtle ), // ultraviolet / infrared: drawn gray because the eye cannot see them

  /** Color of light of this wavelength (nm); gray outside the visible band. */
  lightColor( wavelength: number ): Color {
    return VisibleColor.wavelengthToColor( wavelength, {
      uvColor: new Color( SimTokens.color.textSubtle ),
      irColor: new Color( SimTokens.color.textSubtle )
    } );
  },

  isVisible( wavelength: number ): boolean {
    return wavelength >= VisibleColor.MIN_WAVELENGTH && wavelength <= VisibleColor.MAX_WAVELENGTH;
  }
};

bsshsPhotoelectric.register( 'PhotoelectricViewConstants', PhotoelectricViewConstants );

export default PhotoelectricViewConstants;
