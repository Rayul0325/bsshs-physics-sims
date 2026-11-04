// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Model of the 「편광판」 screen: a light source (unpolarized, or linearly polarized at an adjustable direction), up to
 * three ideal polarizers in series, and a detector that measures the intensity reaching it.
 *
 * Malus's law quantities refer to the LAST polarizer in the beam (the one in front of the detector):
 *   incidentIntensity I₀ = intensity arriving at it, transmittedIntensity I = intensity leaving it (= detector),
 *   polarizerAngle θ = angle between the arriving polarization and its axis (0–90°), cosSquared = cos²θ,
 *   intensityRatio = I/I₀. θ and cos²θ are null when the arriving light is unpolarized (Malus's law does not apply;
 *   one polarizer then passes I₀/2 at any angle).
 *
 * Every measured quantity is a public Property (read by the class drawer adapter through
 * phet.joist.sim.screens[ i ].model). Nothing changes with time.
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Property from '../../../axon/js/Property.js';
import StringUnionProperty from '../../../axon/js/StringUnionProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Range from '../../../dot/js/Range.js';
import type TModel from '../../../joist/js/TModel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';
import Polarizer from './Polarizer.js';
import PolarizationMath, { type BeamState } from './PolarizationMath.js';

export const SourceLightValues = [ 'unpolarized', 'polarized' ] as const;
export type SourceLight = ( typeof SourceLightValues )[ number ];

export default class PolarizerModel implements TModel {

  public static readonly SOURCE_INTENSITY_RANGE = new Range( 10, 100 ); // W/m²
  public static readonly SOURCE_ANGLE_RANGE = new Range( 0, 180 ); // degrees from vertical

  // Inputs
  public readonly lightTypeProperty: StringUnionProperty<SourceLight>;
  public readonly sourceAngleProperty: NumberProperty;
  public readonly sourceIntensityProperty: NumberProperty;
  public readonly polarizers: Polarizer[];

  // Beam between the elements: [ source → P1, P1 → P2, P2 → P3, P3 → detector ]. A polarizer that is out of the beam
  // passes the light unchanged.
  public readonly segmentsProperty: TReadOnlyProperty<BeamState[]>;

  // Measurements
  public readonly polarizerCountProperty: TReadOnlyProperty<number>;
  public readonly incidentIntensityProperty: TReadOnlyProperty<number | null>;
  public readonly transmittedIntensityProperty: TReadOnlyProperty<number>;
  public readonly polarizerAngleProperty: TReadOnlyProperty<number | null>;
  public readonly cosSquaredProperty: TReadOnlyProperty<number | null>;
  public readonly intensityRatioProperty: TReadOnlyProperty<number | null>;
  public readonly transmittedFractionProperty: TReadOnlyProperty<number>;

  // View-only: whether the E-field indicators are shown (not physics, but reset with the model).
  public readonly fieldIndicatorsVisibleProperty: BooleanProperty;

  public constructor( tandem: Tandem ) {
    this.lightTypeProperty = new StringUnionProperty<SourceLight>( 'unpolarized', {
      validValues: SourceLightValues,
      tandem: tandem.createTandem( 'lightTypeProperty' )
    } );
    this.sourceAngleProperty = new NumberProperty( 0, {
      range: PolarizerModel.SOURCE_ANGLE_RANGE,
      tandem: tandem.createTandem( 'sourceAngleProperty' )
    } );
    this.sourceIntensityProperty = new NumberProperty( 100, {
      range: PolarizerModel.SOURCE_INTENSITY_RANGE,
      tandem: tandem.createTandem( 'sourceIntensityProperty' )
    } );
    this.polarizers = [
      new Polarizer( true, 0, tandem.createTandem( 'polarizer1' ) ),
      new Polarizer( false, 45, tandem.createTandem( 'polarizer2' ) ),
      new Polarizer( true, 60, tandem.createTandem( 'polarizer3' ) )
    ];
    this.fieldIndicatorsVisibleProperty = new BooleanProperty( true, { tandem: tandem.createTandem( 'fieldIndicatorsVisibleProperty' ) } );

    const segments = new Property<BeamState[]>( [] );
    const count = new Property<number>( 0 );
    const incident = new Property<number | null>( null );
    const transmitted = new Property<number>( 0 );
    const theta = new Property<number | null>( null );
    const cos2 = new Property<number | null>( null );
    const ratio = new Property<number | null>( null );
    const fraction = new Property<number>( 0 );
    this.segmentsProperty = segments;
    this.polarizerCountProperty = count;
    this.incidentIntensityProperty = incident;
    this.transmittedIntensityProperty = transmitted;
    this.polarizerAngleProperty = theta;
    this.cosSquaredProperty = cos2;
    this.intensityRatioProperty = ratio;
    this.transmittedFractionProperty = fraction;

    const update = () => {
      const sourceIntensity = this.sourceIntensityProperty.value;
      const source: BeamState = {
        intensity: sourceIntensity,
        direction: this.lightTypeProperty.value === 'polarized' ? this.sourceAngleProperty.value : null
      };
      const beams: BeamState[] = [ source ];
      let beam = source;
      let last = null;
      let n = 0;
      for ( const p of this.polarizers ) {
        if ( p.insertedProperty.value ) {
          last = PolarizationMath.throughPolarizer( beam, p.angleProperty.value );
          beam = last.outgoing;
          n++;
        }
        beams.push( beam );
      }
      segments.value = beams;
      count.value = n;
      transmitted.value = beam.intensity;
      fraction.value = beam.intensity / sourceIntensity;
      if ( last ) {
        incident.value = last.incoming.intensity;
        theta.value = last.theta;
        cos2.value = last.incoming.direction === null ? null : PolarizationMath.cosSquared( last.incoming.direction, last.axis );
        ratio.value = last.incoming.intensity > 0 ? last.outgoing.intensity / last.incoming.intensity : null;
      }
      else {
        incident.value = null;
        theta.value = null;
        cos2.value = null;
        ratio.value = null;
      }
    };
    Multilink.multilinkAny( [
      this.lightTypeProperty, this.sourceAngleProperty, this.sourceIntensityProperty,
      ...this.polarizers.flatMap( p => [ p.insertedProperty, p.angleProperty ] )
    ], update );
  }

  public step( dt: number ): void {
    // static optics: nothing evolves in time
  }

  public reset(): void {
    this.lightTypeProperty.reset();
    this.sourceAngleProperty.reset();
    this.sourceIntensityProperty.reset();
    this.polarizers.forEach( p => p.reset() );
    this.fieldIndicatorsVisibleProperty.reset();
  }
}

bsshsPolarization.register( 'PolarizerModel', PolarizerModel );
