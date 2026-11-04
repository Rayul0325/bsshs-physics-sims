// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Physical constants (CODATA) and the material and device parameters both screens use.
 *
 * Material values are standard room-temperature textbook values. The minority-carrier diffusion
 * coefficients D and diffusion lengths L only set the size of the reverse saturation current I_s
 * (long-diode formula); they are held constant with temperature, which is a stated simplification.
 */

import bsshsSemiconductor from '../bsshsSemiconductor.js';

export type Material = 'silicon' | 'germanium';
export const MATERIALS: readonly Material[] = [ 'silicon', 'germanium' ];

export type MaterialParameters = {
  bandGap: number;          // E_g, eV (held at its 300 K value)
  relativePermittivity: number;
  intrinsicDensity300: number;  // n_i at 300 K, cm⁻³
  electronDiffusionRate: number; // D_n / L_n of minority electrons in the p side, m/s
  holeDiffusionRate: number;     // D_p / L_p of minority holes in the n side, m/s
};

const SemiconductorConstants = {

  // CODATA 2018/2022
  BOLTZMANN: 1.380649e-23,        // J/K
  ELEMENTARY_CHARGE: 1.602176634e-19, // C
  VACUUM_PERMITTIVITY: 8.8541878188e-12, // F/m

  MATERIAL_PARAMETERS: {
    silicon: {
      bandGap: 1.12,
      relativePermittivity: 11.7,
      intrinsicDensity300: 1.0e10,
      electronDiffusionRate: 30e-4 / 20e-6, // D_n = 30 cm²/s, L_n = 20 μm
      holeDiffusionRate: 12e-4 / 20e-6      // D_p = 12 cm²/s, L_p = 20 μm
    },
    germanium: {
      bandGap: 0.67,
      relativePermittivity: 16.0,
      intrinsicDensity300: 2.0e13,
      electronDiffusionRate: 90e-4 / 50e-6, // D_n = 90 cm²/s, L_n = 50 μm
      holeDiffusionRate: 45e-4 / 50e-6      // D_p = 45 cm²/s, L_p = 50 μm
    }
  } as Record<Material, MaterialParameters>,

  /** Junction cross-section area, m² (0.1 mm²). */
  JUNCTION_AREA: 1e-7,

  /** Protective series resistor of the junction screen's circuit, Ω. */
  SERIES_RESISTANCE: 1000,

  /** Rectifier diode models: turn-on voltage (constant-drop and piecewise-linear), V. */
  TURN_ON_VOLTAGE: 0.7,

  /** Piecewise-linear model: slope resistance after turn-on, Ω. */
  SLOPE_RESISTANCE: 10,

  /** Per cubic centimetre → per cubic metre. */
  CM3_TO_M3: 1e6
};

bsshsSemiconductor.register( 'SemiconductorConstants', SemiconductorConstants );

export default SemiconductorConstants;
