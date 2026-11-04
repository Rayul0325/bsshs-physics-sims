// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Model of the photoelectric experiment: monochromatic light falls on a metal cathode in a vacuum tube, and an
 * adjustable voltage between the anode and the cathode either gathers the photoelectrons (positive) or pushes them
 * back (negative). Everything here is a steady-state formula; the moving photons and electrons on screen are view-only
 * pictures and do not feed back into these numbers.
 *
 *   photon energy        E = hf = hc/λ                      (eV)
 *   threshold frequency  f₀ = W/h
 *   max kinetic energy   K_max = hf − W  (only when hf > W; otherwise no photoelectrons, K_max is undefined → null)
 *   stopping voltage     eV₀ = K_max
 *   saturation current   I_sat = e · (electrons per second) = e · η · N    (N = photons per second ∝ intensity)
 *   photocurrent I(V):
 *     V ≥ 0         I = I_sat · ( 1 − (1 − a₀) · e^(−V/V_c) )   gathers the electrons that would miss the anode
 *     −V₀ < V < 0   I = I_sat · a₀ · ( 1 + V/V₀ )               only electrons with K > e|V| get through
 *     V ≤ −V₀       I = 0                                        even the fastest electron is turned back
 *   The retarding branch assumes the photoelectrons' kinetic energies are spread evenly between 0 and K_max, so the
 *   current falls in a straight line to zero exactly at −V₀. a₀ and V_c are PhotoelectricConstants.
 *
 * Everything under js/model/ is part of the sim's physics hash (drawer/hash.mjs). The class drawer adapter reads
 * these public Properties through phet.joist.sim.screens[ 0 ].model.
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Property from '../../../axon/js/Property.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Range from '../../../dot/js/Range.js';
import type TModel from '../../../joist/js/TModel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';
import Metal from './Metal.js';
import PhotoelectricConstants from './PhotoelectricConstants.js';

const { PLANCK_CONSTANT: H, SPEED_OF_LIGHT: C, ELEMENTARY_CHARGE: E_CHARGE } = PhotoelectricConstants;

export default class BsshsPhotoelectricModel implements TModel {

  /** Wavelength of the light, in nm (ultraviolet to near infrared). */
  public static readonly WAVELENGTH_RANGE = new Range( 120, 850 );

  /** Light intensity, in % of the source's maximum. */
  public static readonly INTENSITY_RANGE = new Range( 0, 100 );

  /** Anode-minus-cathode voltage, in V. */
  public static readonly VOLTAGE_RANGE = new Range( -10, 10 );

  /** Largest possible photocurrent (100 % intensity, saturated), in μA. */
  public static readonly MAX_PHOTOCURRENT = E_CHARGE * PhotoelectricConstants.MAX_PHOTON_RATE *
                                            PhotoelectricConstants.QUANTUM_YIELD * 1e6;

  /** The selectable cathode metals. */
  public readonly metals: readonly Metal[] = Metal.ALL;

  // ---- inputs ----
  public readonly lightOnProperty: BooleanProperty;
  public readonly wavelengthProperty: NumberProperty; // nm
  public readonly intensityProperty: NumberProperty; // %
  public readonly metalProperty: Property<Metal>;
  public readonly voltageProperty: NumberProperty; // V, anode − cathode

  // ---- light ----
  public readonly frequencyProperty: TReadOnlyProperty<number>; // Hz
  public readonly photonEnergyProperty: TReadOnlyProperty<number>; // eV
  public readonly photonRateProperty: TReadOnlyProperty<number>; // photons per second on the cathode

  // ---- metal ----
  public readonly workFunctionProperty: TReadOnlyProperty<number>; // eV
  public readonly thresholdFrequencyProperty: TReadOnlyProperty<number>; // Hz
  public readonly thresholdWavelengthProperty: TReadOnlyProperty<number>; // nm

  // ---- photoelectrons ----
  public readonly emitsElectronsProperty: TReadOnlyProperty<boolean>; // hf > W
  public readonly kineticEnergyMaxProperty: TReadOnlyProperty<number | null>; // eV, null below the threshold
  public readonly stoppingVoltageProperty: TReadOnlyProperty<number | null>; // V, null below the threshold
  public readonly electronRateProperty: TReadOnlyProperty<number>; // photoelectrons per second leaving the cathode

  // ---- circuit ----
  public readonly saturationCurrentProperty: TReadOnlyProperty<number>; // μA
  public readonly photocurrentProperty: TReadOnlyProperty<number>; // μA, the ammeter reading

  public constructor( tandem: Tandem ) {
    this.lightOnProperty = new BooleanProperty( false );
    this.wavelengthProperty = new NumberProperty( 400, {
      range: BsshsPhotoelectricModel.WAVELENGTH_RANGE,
      tandem: tandem.createTandem( 'wavelengthProperty' )
    } );
    this.intensityProperty = new NumberProperty( 50, {
      range: BsshsPhotoelectricModel.INTENSITY_RANGE,
      tandem: tandem.createTandem( 'intensityProperty' )
    } );
    this.metalProperty = new Property<Metal>( Metal.SODIUM, { validValues: Metal.ALL } );
    this.voltageProperty = new NumberProperty( 3, {
      range: BsshsPhotoelectricModel.VOLTAGE_RANGE,
      tandem: tandem.createTandem( 'voltageProperty' )
    } );

    this.frequencyProperty = new DerivedProperty( [ this.wavelengthProperty ], wavelength => C / ( wavelength * 1e-9 ) );
    this.photonEnergyProperty = new DerivedProperty( [ this.frequencyProperty ], f => H * f / E_CHARGE );
    this.photonRateProperty = new DerivedProperty( [ this.lightOnProperty, this.intensityProperty ],
      ( on, intensity ) => on ? intensity / 100 * PhotoelectricConstants.MAX_PHOTON_RATE : 0 );

    this.workFunctionProperty = new DerivedProperty( [ this.metalProperty ], metal => metal.workFunction );
    this.thresholdFrequencyProperty = new DerivedProperty( [ this.workFunctionProperty ], w => w * E_CHARGE / H );
    this.thresholdWavelengthProperty = new DerivedProperty( [ this.thresholdFrequencyProperty ], f0 => C / f0 * 1e9 );

    this.emitsElectronsProperty = new DerivedProperty( [ this.photonEnergyProperty, this.workFunctionProperty ],
      ( energy, w ) => energy - w > 0 );
    this.kineticEnergyMaxProperty = new DerivedProperty( [ this.photonEnergyProperty, this.workFunctionProperty ],
      ( energy, w ) => energy - w > 0 ? energy - w : null );

    // eV₀ = K_max: with K_max in eV, V₀ in volts is the same number.
    this.stoppingVoltageProperty = new DerivedProperty( [ this.kineticEnergyMaxProperty ], k => k );
    this.electronRateProperty = new DerivedProperty( [ this.emitsElectronsProperty, this.photonRateProperty ],
      ( emits, rate ) => emits ? rate * PhotoelectricConstants.QUANTUM_YIELD : 0 );

    this.saturationCurrentProperty = new DerivedProperty( [ this.electronRateProperty ], rate => E_CHARGE * rate * 1e6 );
    this.photocurrentProperty = new DerivedProperty(
      [ this.saturationCurrentProperty, this.voltageProperty, this.stoppingVoltageProperty ],
      ( saturation, voltage, stopping ) => saturation * BsshsPhotoelectricModel.collectedFraction( voltage, stopping ) );
  }

  /**
   * Fraction of the emitted photoelectrons that reach the anode (see the I(V) branches above).
   * @param voltage - anode − cathode, in V
   * @param stoppingVoltage - V₀ in V, or null when no electrons are emitted
   */
  public static collectedFraction( voltage: number, stoppingVoltage: number | null ): number {
    if ( stoppingVoltage === null ) {
      return 0;
    }
    const a0 = PhotoelectricConstants.COLLECTION_AT_ZERO_VOLTAGE;
    if ( voltage >= 0 ) {
      return 1 - ( 1 - a0 ) * Math.exp( -voltage / PhotoelectricConstants.COLLECTION_VOLTAGE_SCALE );
    }
    if ( voltage <= -stoppingVoltage ) {
      return 0;
    }
    return a0 * ( 1 + voltage / stoppingVoltage );
  }

  /**
   * Of the electrons that head for the anode, the fraction whose path would reach it (the geometric part of
   * collectedFraction, without the energy cut). Used by the view's electron picture.
   */
  public static aimedFraction( voltage: number ): number {
    const a0 = PhotoelectricConstants.COLLECTION_AT_ZERO_VOLTAGE;
    return voltage >= 0 ? 1 - ( 1 - a0 ) * Math.exp( -voltage / PhotoelectricConstants.COLLECTION_VOLTAGE_SCALE ) : a0;
  }

  /** Photocurrent (μA) the present light and metal would give at another voltage, for the I–V graph. */
  public photocurrentAt( voltage: number ): number {
    return this.saturationCurrentProperty.value *
           BsshsPhotoelectricModel.collectedFraction( voltage, this.stoppingVoltageProperty.value );
  }

  /** Nothing in the model changes with time (the moving particles are drawn by the view). */
  public step( dt: number ): void {
    // steady state
  }

  public reset(): void {
    this.lightOnProperty.reset();
    this.wavelengthProperty.reset();
    this.intensityProperty.reset();
    this.metalProperty.reset();
    this.voltageProperty.reset();
  }
}

bsshsPhotoelectric.register( 'BsshsPhotoelectricModel', BsshsPhotoelectricModel );
