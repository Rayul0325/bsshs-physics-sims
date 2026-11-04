// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Shared view constants. Colors are scenery's named constants with a physical role (not design values): X-ray
 * photons are invisible, so one fixed named color marks "photon" and a darker shade of it marks the scattered
 * photon; blue marks the electron. Panels, buttons and sliders keep their stock (themed) colors.
 */

import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import Color from '../../../scenery/js/util/Color.js';
import bsshsCompton from '../bsshsCompton.js';

const ComptonViewConstants = {
  PHOTON_COLOR: Color.MAGENTA,
  SCATTERED_PHOTON_COLOR: Color.MAGENTA.darkerColor( 0.6 ),
  ELECTRON_COLOR: Color.BLUE,
  DEVICE_COLOR: Color.DARK_GRAY,
  DEVICE_BODY_COLOR: Color.GRAY,
  GUIDE_COLOR: Color.GRAY,
  TRACK_COLOR: Color.LIGHT_GRAY,
  ON_DEVICE_TEXT_COLOR: Color.WHITE,

  TITLE_FONT: new PhetFont( { size: 17, weight: 'bold' } ),
  LABEL_FONT: new PhetFont( 15 ),
  VALUE_FONT: new PhetFont( { size: 15, weight: 'bold' } ),
  SMALL_FONT: new PhetFont( 13 ),

  PANEL_MARGIN: 10,
  PANEL_CORNER_RADIUS: 8
};

bsshsCompton.register( 'ComptonViewConstants', ComptonViewConstants );

export default ComptonViewConstants;
