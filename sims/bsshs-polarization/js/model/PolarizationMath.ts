// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Pure physics of this sim (no Properties, no view):
 *   - Malus's law through a series of ideal polarizers, I = I₀ cos²θ, with unpolarized light giving I₀/2 at the
 *     first polarizer;
 *   - reflection at a flat boundary between two non-absorbing dielectrics: Snell's law n₁ sin θ₁ = n₂ sin θ₂ and the
 *     Fresnel power reflectances Rₛ, Rₚ, plus Brewster's angle tan θ_B = n₂/n₁.
 *
 * Polarizer axes and polarization directions are angles in degrees measured from the vertical, in the plane
 * perpendicular to the beam. Ideal polarizers: the component along the axis passes completely, the perpendicular
 * component is absorbed completely.
 */

import bsshsPolarization from '../bsshsPolarization.js';

const RAD = Math.PI / 180;

/** Light leaving a stage of the polarizer chain. direction is null for unpolarized light. */
export type BeamState = {
  intensity: number; // W/m²
  direction: number | null; // polarization direction (degrees from vertical) or null when unpolarized
};

/** What happens at one polarizer. */
export type PolarizerStage = {
  axis: number; // degrees from vertical
  incoming: BeamState;
  outgoing: BeamState;
  theta: number | null; // angle between the incoming polarization and the axis, folded into [0, 90]; null if unpolarized
};

const PolarizationMath = {

  /**
   * Angle between two directions in the transverse plane (a polarization direction and an axis), folded into
   * [0°, 90°]. Directions repeat every 180°, so 120° and 60° apart are the same physical angle.
   */
  foldedAngle( a: number, b: number ): number {
    const d = ( ( ( a - b ) % 180 ) + 180 ) % 180;
    return d > 90 ? 180 - d : d;
  },

  /** cos² of the angle between two transverse directions, in degrees. */
  cosSquared( a: number, b: number ): number {
    const c = Math.cos( ( a - b ) * RAD );
    return c * c;
  },

  /** One ideal polarizer: unpolarized light keeps half (I₀/2), polarized light follows Malus's law. */
  throughPolarizer( incoming: BeamState, axis: number ): PolarizerStage {
    if ( incoming.direction === null ) {
      return { axis: axis, incoming: incoming, outgoing: { intensity: incoming.intensity / 2, direction: axis }, theta: null };
    }
    return {
      axis: axis,
      incoming: incoming,
      outgoing: { intensity: incoming.intensity * PolarizationMath.cosSquared( incoming.direction, axis ), direction: axis },
      theta: PolarizationMath.foldedAngle( incoming.direction, axis )
    };
  },

  /** A series of ideal polarizers, in beam order. */
  throughPolarizers( source: BeamState, axes: number[] ): PolarizerStage[] {
    const stages: PolarizerStage[] = [];
    let beam = source;
    for ( const axis of axes ) {
      const stage = PolarizationMath.throughPolarizer( beam, axis );
      stages.push( stage );
      beam = stage.outgoing;
    }
    return stages;
  },

  /**
   * Refraction angle θ₂ in degrees (Snell's law), or null for total internal reflection (only possible when n₁ > n₂;
   * this sim keeps n₁ = 1 ≤ n₂, so it never happens here).
   */
  refractionAngle( theta1: number, n1: number, n2: number ): number | null {
    const s = n1 * Math.sin( theta1 * RAD ) / n2;
    return Math.abs( s ) > 1 ? null : Math.asin( s ) / RAD;
  },

  /**
   * Fresnel power reflectances for s (electric field perpendicular to the plane of incidence) and p (in the plane)
   * polarization, from the amplitude coefficients
   *   rₛ = (n₁ cos θ₁ − n₂ cos θ₂) / (n₁ cos θ₁ + n₂ cos θ₂),  rₚ = (n₂ cos θ₁ − n₁ cos θ₂) / (n₂ cos θ₁ + n₁ cos θ₂).
   * Total internal reflection gives Rₛ = Rₚ = 1.
   */
  reflectances( theta1: number, n1: number, n2: number ): { s: number; p: number } {
    const theta2 = PolarizationMath.refractionAngle( theta1, n1, n2 );
    if ( theta2 === null ) { return { s: 1, p: 1 }; }
    const c1 = Math.cos( theta1 * RAD );
    const c2 = Math.cos( theta2 * RAD );
    const rs = ( n1 * c1 - n2 * c2 ) / ( n1 * c1 + n2 * c2 );
    const rp = ( n2 * c1 - n1 * c2 ) / ( n2 * c1 + n1 * c2 );
    return { s: rs * rs, p: rp * rp };
  },

  /** Brewster's angle in degrees: tan θ_B = n₂/n₁. */
  brewsterAngle( n1: number, n2: number ): number {
    return Math.atan2( n2, n1 ) / RAD;
  }
};

bsshsPolarization.register( 'PolarizationMath', PolarizationMath );

export default PolarizationMath;
