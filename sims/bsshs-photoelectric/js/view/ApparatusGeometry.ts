// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Positions of the apparatus parts, in the apparatus Node's own coordinates (about 560 × 400 view units). The
 * phototube lies horizontally: the metal cathode plate on the left, the anode plate on the right, and the lamp above
 * the tube shines down onto the cathode's inner face. The wires leave through the tube's end caps and close the
 * circuit through the power supply and the ammeter below.
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Vector2 from '../../../dot/js/Vector2.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';

const TUBE = new Bounds2( 140, 112, 520, 288 );
const CATHODE = new Bounds2( 180, 140, 194, 260 );
const ANODE = new Bounds2( 466, 150, 476, 250 );
const LAMP_CENTER = new Vector2( 330, 46 );
const LAMP_LENGTH = 96;
const LAMP_HEIGHT = 44;
const LAMP_APERTURE = 15; // half-width of the light leaving the lamp

// The lamp points at the middle of the cathode's inner face.
const CATHODE_FACE_CENTER = new Vector2( CATHODE.maxX, CATHODE.centerY );
const LAMP_DIRECTION = CATHODE_FACE_CENTER.minus( LAMP_CENTER ).normalized();
const LAMP_FACE_CENTER = LAMP_CENTER.plus( LAMP_DIRECTION.timesScalar( LAMP_LENGTH / 2 ) );

const ApparatusGeometry = {
  BOUNDS: new Bounds2( 0, 0, 560, 400 ),
  TUBE: TUBE,
  TUBE_CORNER_RADIUS: TUBE.height / 2,
  CATHODE: CATHODE,
  ANODE: ANODE,
  LAMP_CENTER: LAMP_CENTER,
  LAMP_LENGTH: LAMP_LENGTH,
  LAMP_HEIGHT: LAMP_HEIGHT,
  LAMP_ANGLE: LAMP_DIRECTION.angle,
  LAMP_DIRECTION: LAMP_DIRECTION,
  LAMP_FACE_CENTER: LAMP_FACE_CENTER,
  LAMP_APERTURE: LAMP_APERTURE,

  /** Where the light lands: the cathode's inner face, slightly inside its ends. */
  BEAM_TARGET_TOP: new Vector2( CATHODE.maxX, CATHODE.minY + 6 ),
  BEAM_TARGET_BOTTOM: new Vector2( CATHODE.maxX, CATHODE.maxY - 6 ),

  // Circuit (wire corners and the two instrument boxes).
  WIRE_LEFT_X: 100,
  WIRE_RIGHT_X: 545,
  WIRE_Y: 360,
  POWER_SUPPLY: new Bounds2( 165, 328, 325, 392 ),
  AMMETER: new Bounds2( 350, 328, 500, 392 )
};

bsshsPhotoelectric.register( 'ApparatusGeometry', ApparatusGeometry );

export default ApparatusGeometry;
