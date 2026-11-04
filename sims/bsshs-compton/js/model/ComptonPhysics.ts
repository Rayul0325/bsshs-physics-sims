// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Exact (relativistic) Compton scattering of one photon off a free electron at rest, in the units the sim shows:
 * wavelengths in pm, energies in keV, momenta in keV/c, angles in degrees.
 *
 * Inputs: incident wavelength λ and photon scattering angle θ (the detector angle). Outputs, with no approximation:
 *   - λ′ = λ + λ_C (1 − cos θ), λ_C = h/(mₑc) (the Compton formula, which follows from energy and momentum
 *     conservation with the relativistic electron energy E² = (pc)² + (mₑc²)²);
 *   - photon energies E = hc/λ, E′ = hc/λ′ and momenta p = E/c, p′ = E′/c;
 *   - electron momentum from momentum conservation by components: pₑ = p − p′ (vector), so
 *     pₑx = p − p′ cos θ, pₑy = −p′ sin θ, |pₑ| and the recoil angle φ below the incident axis;
 *   - electron kinetic energy from the relativistic energy-momentum relation, Kₑ = √((pₑc)² + (mₑc²)²) − mₑc²,
 *     computed in a cancellation-free form. Kₑ is NOT computed as E − E′: the sim shows E′ + Kₑ next to E, so
 *     energy conservation is a check, not an identity;
 *   - electron total energy and speed v/c = pₑc / (Kₑ + mₑc²).
 *
 * Constants: SI 2019 exact h, c, e and CODATA 2022 mₑ (same values as data/lessons/bsshs-compton.json).
 */

import bsshsCompton from '../bsshsCompton.js';

// SI / CODATA constants
const PLANCK = 6.62607015e-34; // J·s
const SPEED_OF_LIGHT = 299792458; // m/s
const ELEMENTARY_CHARGE = 1.602176634e-19; // C
const ELECTRON_MASS = 9.1093837139e-31; // kg

const JOULES_PER_KEV = ELEMENTARY_CHARGE * 1e3;
const METERS_PER_PM = 1e-12;

export type ComptonResult = {
  incidentWavelength: number; // λ, pm
  scatteringAngle: number; // θ, °
  oneMinusCosTheta: number; // 1 − cos θ
  wavelengthShift: number; // Δλ, pm
  scatteredWavelength: number; // λ′, pm
  incidentEnergy: number; // E, keV
  scatteredEnergy: number; // E′, keV
  incidentMomentum: number; // p, keV/c
  scatteredMomentum: number; // p′, keV/c
  electronMomentumX: number; // pₑx along the incident direction, keV/c
  electronMomentumY: number; // pₑy (positive = the side the photon went to), keV/c
  electronMomentum: number; // |pₑ|, keV/c
  recoilAngle: number; // φ, ° below the incident axis, on the opposite side from the photon
  electronKineticEnergy: number; // Kₑ, keV
  electronTotalEnergy: number; // Kₑ + mₑc², keV
  electronSpeed: number; // v/c
  energyAfter: number; // E′ + Kₑ, keV
};

const ComptonPhysics = {

  /** Compton wavelength h/(mₑc), pm. */
  COMPTON_WAVELENGTH: PLANCK / ( ELECTRON_MASS * SPEED_OF_LIGHT ) / METERS_PER_PM,

  /** Electron rest energy mₑc², keV. */
  ELECTRON_REST_ENERGY: ELECTRON_MASS * SPEED_OF_LIGHT * SPEED_OF_LIGHT / JOULES_PER_KEV,

  /** hc, keV·pm (E in keV = HC / λ in pm). */
  HC: PLANCK * SPEED_OF_LIGHT / JOULES_PER_KEV / METERS_PER_PM,

  /** Photon energy (keV) of a wavelength (pm). */
  energyFromWavelength( wavelength: number ): number {
    return ComptonPhysics.HC / wavelength;
  },

  /** Photon wavelength (pm) of an energy (keV). */
  wavelengthFromEnergy( energy: number ): number {
    return ComptonPhysics.HC / energy;
  },

  /**
   * Solves the collision.
   * @param wavelength - incident wavelength λ, pm (> 0)
   * @param angle - photon scattering angle θ, degrees in [0, 180]
   */
  solve( wavelength: number, angle: number ): ComptonResult {
    const theta = angle * Math.PI / 180;
    const cosTheta = Math.cos( theta );
    const sinTheta = Math.sin( theta );
    const oneMinusCos = 1 - cosTheta;

    const shift = ComptonPhysics.COMPTON_WAVELENGTH * oneMinusCos;
    const scatteredWavelength = wavelength + shift;

    const E = ComptonPhysics.HC / wavelength;
    const E2 = ComptonPhysics.HC / scatteredWavelength;

    // momentum conservation by components (units keV/c, so p = E for a photon)
    const px = E - E2 * cosTheta;
    const py = -E2 * sinTheta;
    const pe = Math.sqrt( px * px + py * py );

    // Kₑ = √(pₑ² + m²) − m = pₑ² / (√(pₑ² + m²) + m), with c = 1 in these units
    const m = ComptonPhysics.ELECTRON_REST_ENERGY;
    const totalEnergy = Math.sqrt( pe * pe + m * m );
    const kinetic = ( pe * pe ) / ( totalEnergy + m );

    // φ: the electron leaves on the other side of the axis from the photon. At θ = 0 nothing is transferred; the
    // reported angle is then the θ → 0 limit, 90°.
    const recoil = pe === 0 ? 90 : Math.atan2( -py, px ) * 180 / Math.PI;

    return {
      incidentWavelength: wavelength,
      scatteringAngle: angle,
      oneMinusCosTheta: oneMinusCos,
      wavelengthShift: shift,
      scatteredWavelength: scatteredWavelength,
      incidentEnergy: E,
      scatteredEnergy: E2,
      incidentMomentum: E,
      scatteredMomentum: E2,
      electronMomentumX: px,
      electronMomentumY: py,
      electronMomentum: pe,
      recoilAngle: recoil,
      electronKineticEnergy: kinetic,
      electronTotalEnergy: kinetic + m,
      electronSpeed: pe / ( kinetic + m ),
      energyAfter: E2 + kinetic
    };
  }
};

bsshsCompton.register( 'ComptonPhysics', ComptonPhysics );

export default ComptonPhysics;
