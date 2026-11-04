// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Model of the 「반사와 브루스터각」 screen: light in air (n₁ = 1) hits the flat surface of a transparent medium with an
 * adjustable refractive index n₂ at incidence angle θ₁. Snell's law gives θ₂; the Fresnel equations give the power
 * reflectances Rₛ and Rₚ; Brewster's angle is tan θ_B = n₂/n₁, where Rₚ = 0 and the reflected and refracted rays are
 * perpendicular (θ_B + θ₂ = 90°).
 *
 * The incoming light is unpolarized (half s, half p), s-polarized or p-polarized; reflectance is the fraction of
 * that light's power reflected. reflectedPolarization is the degree of polarization (Rₛ − Rₚ)/(Rₛ + Rₚ) of the
 * reflected light when unpolarized light comes in (1 at Brewster's angle: the reflection is purely s).
 *
 * The media are ideal (no absorption, no dispersion). Every measured quantity is a public Property.
 */

import Multilink from '../../../axon/js/Multilink.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Property from '../../../axon/js/Property.js';
import StringUnionProperty from '../../../axon/js/StringUnionProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Range from '../../../dot/js/Range.js';
import type TModel from '../../../joist/js/TModel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';
import PolarizationMath from './PolarizationMath.js';

export const IncidentLightValues = [ 'unpolarized', 's', 'p' ] as const;
export type IncidentLight = ( typeof IncidentLightValues )[ number ];

export default class ReflectionModel implements TModel {

  public static readonly INCIDENT_ANGLE_RANGE = new Range( 0, 89 ); // degrees
  public static readonly INDEX_RANGE = new Range( 1, 2.5 );
  public static readonly N1 = 1; // air

  // Inputs
  public readonly lightTypeProperty: StringUnionProperty<IncidentLight>;
  public readonly incidentAngleProperty: NumberProperty;
  public readonly refractiveIndex2Property: NumberProperty;
  public readonly refractiveIndex1Property: TReadOnlyProperty<number>;

  // Measurements
  public readonly refractionAngleProperty: TReadOnlyProperty<number | null>;
  public readonly reflectanceSProperty: TReadOnlyProperty<number>;
  public readonly reflectancePProperty: TReadOnlyProperty<number>;
  public readonly reflectanceProperty: TReadOnlyProperty<number>;
  public readonly brewsterAngleProperty: TReadOnlyProperty<number>;
  public readonly tanBrewsterProperty: TReadOnlyProperty<number>;
  public readonly raysAngleProperty: TReadOnlyProperty<number | null>;
  public readonly reflectedPolarizationProperty: TReadOnlyProperty<number | null>;

  public constructor( tandem: Tandem ) {
    this.lightTypeProperty = new StringUnionProperty<IncidentLight>( 'unpolarized', {
      validValues: IncidentLightValues,
      tandem: tandem.createTandem( 'lightTypeProperty' )
    } );
    this.incidentAngleProperty = new NumberProperty( 30, {
      range: ReflectionModel.INCIDENT_ANGLE_RANGE,
      tandem: tandem.createTandem( 'incidentAngleProperty' )
    } );
    this.refractiveIndex2Property = new NumberProperty( 1.5, {
      range: ReflectionModel.INDEX_RANGE,
      tandem: tandem.createTandem( 'refractiveIndex2Property' )
    } );
    this.refractiveIndex1Property = new Property<number>( ReflectionModel.N1 );

    const theta2 = new Property<number | null>( null );
    const rs = new Property<number>( 0 );
    const rp = new Property<number>( 0 );
    const r = new Property<number>( 0 );
    const thetaB = new Property<number>( 0 );
    const tanB = new Property<number>( 0 );
    const rays = new Property<number | null>( null );
    const pol = new Property<number | null>( null );
    this.refractionAngleProperty = theta2;
    this.reflectanceSProperty = rs;
    this.reflectancePProperty = rp;
    this.reflectanceProperty = r;
    this.brewsterAngleProperty = thetaB;
    this.tanBrewsterProperty = tanB;
    this.raysAngleProperty = rays;
    this.reflectedPolarizationProperty = pol;

    Multilink.multilink( [ this.lightTypeProperty, this.incidentAngleProperty, this.refractiveIndex2Property ],
      ( light, theta1, n2 ) => {
        const n1 = ReflectionModel.N1;
        const t2 = PolarizationMath.refractionAngle( theta1, n1, n2 );
        const R = PolarizationMath.reflectances( theta1, n1, n2 );
        theta2.value = t2;
        rs.value = R.s;
        rp.value = R.p;
        r.value = light === 's' ? R.s : light === 'p' ? R.p : ( R.s + R.p ) / 2;
        thetaB.value = PolarizationMath.brewsterAngle( n1, n2 );
        tanB.value = n2 / n1;
        // Reflected ray at θ₁ on one side of the normal, refracted ray at θ₂ below on the other side.
        rays.value = t2 === null ? null : 180 - theta1 - t2;
        pol.value = R.s + R.p > 1e-15 ? ( R.s - R.p ) / ( R.s + R.p ) : null;
      } );
  }

  /** Reflected-power fraction for one polarization component, for the chart. */
  public static reflectancesAt( theta1: number, n2: number ): { s: number; p: number } {
    return PolarizationMath.reflectances( theta1, ReflectionModel.N1, n2 );
  }

  public step( dt: number ): void {
    // static optics: nothing evolves in time
  }

  public reset(): void {
    this.lightTypeProperty.reset();
    this.incidentAngleProperty.reset();
    this.refractiveIndex2Property.reset();
  }
}

bsshsPolarization.register( 'ReflectionModel', ReflectionModel );
