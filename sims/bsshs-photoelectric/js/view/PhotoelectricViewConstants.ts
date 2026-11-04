// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Layout numbers, fonts and the few physically meaningful colors of the view. Fonts are stock PhetFont sizes (the
 * theme patch supplies the family); colors are scenery Color constants or computed from the wavelength.
 */

import Color from '../../../scenery/js/util/Color.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import VisibleColor from '../../../scenery-phet/js/VisibleColor.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';

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

  // Electrons are drawn in the conventional electron blue; glass and metal in neutral grays.
  ELECTRON_COLOR: Color.BLUE,
  GLASS_STROKE: Color.GRAY,
  GLASS_FILL: Color.LIGHT_GRAY.withAlpha( 0.18 ),
  CATHODE_FILL: Color.GRAY,
  ANODE_FILL: Color.DARK_GRAY,
  WIRE_STROKE: Color.DARK_GRAY,
  LAMP_FILL: Color.DARK_GRAY,
  INVISIBLE_LIGHT_COLOR: Color.GRAY, // ultraviolet / infrared: drawn gray because the eye cannot see them

  /** Color of light of this wavelength (nm); gray outside the visible band. */
  lightColor( wavelength: number ): Color {
    return VisibleColor.wavelengthToColor( wavelength, {
      uvColor: Color.GRAY,
      irColor: Color.GRAY
    } );
  },

  isVisible( wavelength: number ): boolean {
    return wavelength >= VisibleColor.MIN_WAVELENGTH && wavelength <= VisibleColor.MAX_WAVELENGTH;
  }
};

bsshsPhotoelectric.register( 'PhotoelectricViewConstants', PhotoelectricViewConstants );

export default PhotoelectricViewConstants;
