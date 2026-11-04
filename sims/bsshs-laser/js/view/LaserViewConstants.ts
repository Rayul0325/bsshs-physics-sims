// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Sizes and physically meaningful colors shared by the laser view. Fonts are PhetFont sizes only (the theme
 * sets the family). Colors that carry physics come from the light itself (VisibleColor) or from scenery's
 * named colors; panels, buttons and sliders keep their stock (themed) colors.
 */

import Color from '../../../scenery/js/util/Color.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import PhetColorScheme from '../../../scenery-phet/js/PhetColorScheme.js';
import VisibleColor from '../../../scenery-phet/js/VisibleColor.js';
import bsshsLaser from '../bsshsLaser.js';

const LaserViewConstants = {

  TITLE_FONT: new PhetFont( { size: 17, weight: 'bold' } ),
  LABEL_FONT: new PhetFont( 15 ),
  SMALL_FONT: new PhetFont( 14 ),
  VALUE_FONT: new PhetFont( { size: 16, weight: 'bold' } ),

  // Minimum finger size in view units for the narrowest (portrait, scale ≈ 0.75) layout: 44 px / 0.75.
  TOUCH_SIZE: 60,

  // The dark inside of the cavity, so that emitted light shows (darkness is the physics here).
  CAVITY_BACKGROUND: Color.BLACK,
  GROUND_ATOM: Color.GRAY,
  MIRROR: Color.LIGHT_GRAY,
  GAIN: PhetColorScheme.GREEN_COLORBLIND,
  LOSS: PhetColorScheme.RED_COLORBLIND,

  /** Color of light with this wavelength (nm); invisible UV/IR is drawn light gray. */
  lightColor( wavelength: number ): Color {
    return VisibleColor.wavelengthToColor( wavelength, { uvColor: Color.LIGHT_GRAY, irColor: Color.LIGHT_GRAY } );
  }
};

bsshsLaser.register( 'LaserViewConstants', LaserViewConstants );

export default LaserViewConstants;
