// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Colors with a physical meaning, taken from PhET library constants (no design values here; panels, buttons and
 * sliders use the stock components so the bsshs theme recolors them).
 *   - electrons (negative carriers, conduction band): scenery Color.BLUE;
 *   - holes (positive carriers, valence band): PhetColorScheme.RED_COLORBLIND;
 *   - oscilloscope: black screen with the conventional channel colors (CH1 yellow, CH2 cyan);
 *   - a conducting diode glows Color.ORANGE.
 */

import PhetColorScheme from '../../../scenery-phet/js/PhetColorScheme.js';
import Color from '../../../scenery/js/util/Color.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';

const ELECTRON = Color.BLUE;
const HOLE = PhetColorScheme.RED_COLORBLIND;

const SemiconductorColors = {
  electron: ELECTRON,
  hole: HOLE,
  nRegion: ELECTRON.withAlpha( 0.10 ),
  pRegion: HOLE.withAlpha( 0.12 ),
  depletionRegion: Color.WHITE,
  conductionBandFill: ELECTRON.withAlpha( 0.14 ),
  valenceBandFill: HOLE.withAlpha( 0.16 ),
  bandEdge: Color.BLACK,
  fermiLevel: Color.DARK_GRAY,
  ion: Color.DARK_GRAY,
  wire: Color.DARK_GRAY,
  contact: Color.GRAY,
  outline: Color.BLACK,
  muted: Color.GRAY,
  conducting: Color.ORANGE,
  idle: Color.WHITE,
  plotCurve: ELECTRON,
  operatingPoint: HOLE,
  gridLine: Color.LIGHT_GRAY,
  scopeScreen: Color.BLACK,
  scopeGrid: Color.DARK_GRAY,
  scopeInput: Color.YELLOW,
  scopeOutput: Color.CYAN,
  scopeCursor: Color.WHITE,
  scopeText: Color.WHITE
};

bsshsSemiconductor.register( 'SemiconductorColors', SemiconductorColors );

export default SemiconductorColors;
