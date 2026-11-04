// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Physical constants (exact SI 2019 values) and the fixed parameters of the apparatus model.
 */

import bsshsPhotoelectric from '../bsshsPhotoelectric.js';

const PhotoelectricConstants = {

  /** Planck constant h, in J·s. */
  PLANCK_CONSTANT: 6.62607015e-34,

  /** Speed of light in vacuum c, in m/s. */
  SPEED_OF_LIGHT: 299792458,

  /** Elementary charge e, in C (also the J per eV). */
  ELEMENTARY_CHARGE: 1.602176634e-19,

  /** Photons per second reaching the cathode at 100 % intensity. */
  MAX_PHOTON_RATE: 1.0e13,

  /**
   * Photoelectrons per absorbed photon above the threshold. Simplification: every photon with hf > W frees one
   * electron (one photon interacts with one electron). Real metals free far fewer, but the count only scales
   * the current, never K_max.
   */
  QUANTUM_YIELD: 1,

  /**
   * Fraction of the emitted electrons that reach the anode at 0 V. Electrons leave the cathode in many directions,
   * so without an accelerating field some miss the anode; a positive voltage gathers them (saturation).
   */
  COLLECTION_AT_ZERO_VOLTAGE: 0.7,

  /** Voltage scale (V) over which a positive voltage gathers the remaining electrons. */
  COLLECTION_VOLTAGE_SCALE: 0.6
};

bsshsPhotoelectric.register( 'PhotoelectricConstants', PhotoelectricConstants );

export default PhotoelectricConstants;
