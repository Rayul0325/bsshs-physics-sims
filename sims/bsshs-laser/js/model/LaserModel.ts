// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Rate-equation model of a 3-level laser: a gain medium between a fully reflecting back mirror and a partly
 * transmitting output mirror, optically pumped from E₁ to E₃. E₃ decays fast (and without light) to the
 * metastable level E₂, so the pump effectively moves atoms from E₁ to E₂ at the rate W·N₁. The lasing
 * transition is E₂ → E₁ with photon energy hf = E₂ − E₁.
 *
 * Populations are fractions of all atoms (x₁ + x₂ = 1, N₃ ≈ 0 because E₃ empties fast). The cavity photons are
 * eliminated adiabatically (they live ~10 ns, the atoms ~ms), in the limit where spontaneous emission into the
 * laser mode is negligible (β → 0). That gives the textbook threshold model:
 *   dx₂/dt = W·x₁ − x₂/τ − (stimulated drain)
 *   gain coefficient   g = σ·n·(x₂ − x₁)                                   [1/m]
 *   threshold          g_th = −ln(R·T_int) / (2L)    (round-trip gain = round-trip loss)
 *   below threshold    no cavity photons, x₂ → Wτ/(1 + Wτ)
 *   above threshold    gain clamps at g_th: x₂ = (1 + x_th)/2 with x_th = g_th/(σn),
 *                      net stimulated photons/s = N·(W·x₁ − x₂/τ),
 *                      output power = (that) · ln R / ln(R·T_int) · (E₂ − E₁)
 * The time step integrates dx₂/dt exactly (exponential relaxation) and caps x₂ at the clamped value, so
 * settle() lands on a fixed point of step(): measured values stay put while the sim keeps running.
 *
 * Every measured quantity is a public Property in the unit adapters/bsshs-laser/drawer.json declares.
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import EnumerationProperty from '../../../axon/js/EnumerationProperty.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Range from '../../../dot/js/Range.js';
import type TModel from '../../../joist/js/TModel.js';
import TimeSpeed from '../../../scenery-phet/js/TimeSpeed.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsLaser from '../bsshsLaser.js';
import LaserPhotonSystem from './LaserPhotonSystem.js';

// Physical constants (exact SI values).
const PLANCK = 6.62607015e-34; // J·s
const LIGHT_SPEED = 299792458; // m/s
const ELEMENTARY_CHARGE = 1.602176634e-19; // J per eV

// The laser built here (fixed parts).
const CAVITY_LENGTH = 0.10; // m, the gain medium fills the cavity
const MODE_AREA = 1.0e-6; // m², beam cross-section (1 mm²)
const ATOM_DENSITY = 1.0e23; // active atoms per m³
const CROSS_SECTION = 2.0e-23; // m², stimulated-emission cross-section
const INTERNAL_TRANSMISSION = 0.99; // round-trip transmission without the output mirror (1 % scattering loss)
const LOWER_LEVEL_ENERGY = 0; // eV, ground level is the zero of energy
const PUMP_LEVEL_GAP = 0.5; // eV, E₃ − E₂

// Model seconds per real second for each time speed.
const TIME_SCALE_NORMAL = 1e-3;
const TIME_SCALE_SLOW = 0.2e-3;

// Clamping tolerance on x₂ (fraction): keeps the clamped state exact against rounding in the time step.
const CLAMP_EPSILON = 1e-12;

export default class LaserModel implements TModel {

  public static readonly PUMP_RATE_RANGE = new Range( 0, 5000 ); // /s
  public static readonly LIFETIME_RANGE = new Range( 0.1, 5 ); // ms
  public static readonly REFLECTIVITY_RANGE = new Range( 50, 100 ); // %
  public static readonly UPPER_ENERGY_RANGE = new Range( 1.65, 3.10 ); // eV (visible lasing light)

  public static readonly CAVITY_LENGTH = CAVITY_LENGTH;
  public static readonly TOTAL_ATOMS = ATOM_DENSITY * MODE_AREA * CAVITY_LENGTH;
  public static readonly SMALL_SIGNAL_GAIN = CROSS_SECTION * ATOM_DENSITY; // 1/m, gain with every atom in E₂
  public static readonly INTERNAL_TRANSMISSION = INTERNAL_TRANSMISSION;
  public static readonly PUMP_LEVEL_GAP = PUMP_LEVEL_GAP;
  public static readonly TIME_SCALE_NORMAL = TIME_SCALE_NORMAL;
  public static readonly TIME_SCALE_SLOW = TIME_SCALE_SLOW;

  // Inputs (student controls).
  public readonly pumpRateProperty: NumberProperty; // W, /s
  public readonly upperLevelLifetimeProperty: NumberProperty; // τ, ms
  public readonly mirrorReflectivityProperty: NumberProperty; // R, %
  public readonly upperLevelEnergyProperty: NumberProperty; // E₂, eV

  // Clock.
  public readonly isPlayingProperty: BooleanProperty;
  public readonly timeSpeedProperty: EnumerationProperty<TimeSpeed>;
  public readonly elapsedTimeProperty: NumberProperty; // model time, ms

  // State: fraction of atoms in E₂.
  public readonly upperFractionProperty: NumberProperty;

  // Energy levels and light.
  public readonly lowerLevelEnergyProperty: NumberProperty; // eV (fixed)
  public readonly pumpLevelEnergyProperty: NumberProperty; // eV
  public readonly photonEnergyProperty: NumberProperty; // eV
  public readonly frequencyProperty: NumberProperty; // THz
  public readonly wavelengthProperty: NumberProperty; // nm
  public readonly pumpFrequencyProperty: NumberProperty; // THz

  // Measurements.
  public readonly lowerPopulationProperty: NumberProperty; // % of atoms
  public readonly upperPopulationProperty: NumberProperty; // % of atoms
  public readonly populationDifferenceProperty: NumberProperty; // %
  public readonly gainCoefficientProperty: NumberProperty; // 1/m
  public readonly thresholdGainProperty: NumberProperty; // 1/m
  public readonly thresholdPumpRateProperty: NumberProperty; // /s (Infinity when unreachable)
  public readonly spontaneousRateProperty: NumberProperty; // photons/s
  public readonly stimulatedRateProperty: NumberProperty; // net photons/s
  public readonly outputPowerProperty: NumberProperty; // W
  public readonly isLasingProperty: BooleanProperty;
  public readonly hasInversionProperty: BooleanProperty;

  // Illustration: individual atoms and photons driven by the rates above.
  public readonly photonSystem: LaserPhotonSystem;

  public constructor( tandem: Tandem ) {
    this.pumpRateProperty = new NumberProperty( 0, {
      range: LaserModel.PUMP_RATE_RANGE,
      tandem: tandem.createTandem( 'pumpRateProperty' )
    } );
    this.upperLevelLifetimeProperty = new NumberProperty( 2, {
      range: LaserModel.LIFETIME_RANGE,
      tandem: tandem.createTandem( 'upperLevelLifetimeProperty' )
    } );
    this.mirrorReflectivityProperty = new NumberProperty( 95, {
      range: LaserModel.REFLECTIVITY_RANGE,
      tandem: tandem.createTandem( 'mirrorReflectivityProperty' )
    } );
    this.upperLevelEnergyProperty = new NumberProperty( 1.96, {
      range: LaserModel.UPPER_ENERGY_RANGE,
      tandem: tandem.createTandem( 'upperLevelEnergyProperty' )
    } );

    this.isPlayingProperty = new BooleanProperty( true, { tandem: tandem.createTandem( 'isPlayingProperty' ) } );
    this.timeSpeedProperty = new EnumerationProperty( TimeSpeed.NORMAL, {
      validValues: [ TimeSpeed.NORMAL, TimeSpeed.SLOW ],
      tandem: tandem.createTandem( 'timeSpeedProperty' )
    } );
    this.elapsedTimeProperty = new NumberProperty( 0 );

    this.upperFractionProperty = new NumberProperty( 0 );

    this.lowerLevelEnergyProperty = new NumberProperty( LOWER_LEVEL_ENERGY );
    this.pumpLevelEnergyProperty = new NumberProperty( 0 );
    this.photonEnergyProperty = new NumberProperty( 0 );
    this.frequencyProperty = new NumberProperty( 0 );
    this.wavelengthProperty = new NumberProperty( 0 );
    this.pumpFrequencyProperty = new NumberProperty( 0 );

    this.lowerPopulationProperty = new NumberProperty( 0 );
    this.upperPopulationProperty = new NumberProperty( 0 );
    this.populationDifferenceProperty = new NumberProperty( 0 );
    this.gainCoefficientProperty = new NumberProperty( 0 );
    this.thresholdGainProperty = new NumberProperty( 0 );
    this.thresholdPumpRateProperty = new NumberProperty( 0 );
    this.spontaneousRateProperty = new NumberProperty( 0 );
    this.stimulatedRateProperty = new NumberProperty( 0 );
    this.outputPowerProperty = new NumberProperty( 0 );
    this.isLasingProperty = new BooleanProperty( false );
    this.hasInversionProperty = new BooleanProperty( false );

    this.photonSystem = new LaserPhotonSystem();

    const update = () => this.updateOutputs();
    this.pumpRateProperty.lazyLink( update );
    this.upperLevelLifetimeProperty.lazyLink( update );
    this.mirrorReflectivityProperty.lazyLink( update );
    this.upperLevelEnergyProperty.lazyLink( update );

    this.reset();
  }

  /** Round-trip gain coefficient needed to make up for the losses (output mirror + internal), 1/m. */
  public static thresholdGain( reflectivityPercent: number ): number {
    return -Math.log( reflectivityPercent / 100 * INTERNAL_TRANSMISSION ) / ( 2 * CAVITY_LENGTH );
  }

  /** Fraction of the cavity loss that leaves through the output mirror (the useful output). */
  public static outputFraction( reflectivityPercent: number ): number {
    const r = reflectivityPercent / 100;
    return r >= 1 ? 0 : Math.log( r ) / Math.log( r * INTERNAL_TRANSMISSION );
  }

  /** x_th = (x₂ − x₁) at threshold, as a fraction of all atoms (≥ 1 means lasing is impossible). */
  private thresholdInversion(): number {
    return LaserModel.thresholdGain( this.mirrorReflectivityProperty.value ) / LaserModel.SMALL_SIGNAL_GAIN;
  }

  /** x₂ the pump alone would reach (no stimulated emission). */
  private freeUpperFraction(): number {
    const wTau = this.pumpRateProperty.value * this.upperLevelLifetimeProperty.value * 1e-3;
    return wTau / ( 1 + wTau );
  }

  /** Largest x₂ the cavity allows: above it the gain would exceed the loss and the light drains it. */
  private clampedUpperFraction(): number {
    const xth = this.thresholdInversion();
    return xth < 1 ? ( 1 + xth ) / 2 : Number.POSITIVE_INFINITY;
  }

  /** Jumps to the steady state of the rate equations for the current inputs. */
  public settle(): void {
    this.upperFractionProperty.value = Math.min( this.freeUpperFraction(), this.clampedUpperFraction() );
    this.updateOutputs();
    this.photonSystem.reset();
  }

  public step( dt: number ): void {
    if ( this.isPlayingProperty.value ) {
      this.stepModel( dt );
    }
  }

  /** Advances by `dt` seconds of screen time (also used by the step button while paused). */
  public stepModel( dt: number ): void {
    const scale = this.timeSpeedProperty.value === TimeSpeed.SLOW ? TIME_SCALE_SLOW : TIME_SCALE_NORMAL;
    const dtModel = dt * scale; // s
    const W = this.pumpRateProperty.value;
    const tau = this.upperLevelLifetimeProperty.value * 1e-3;

    // dx₂/dt = W(1 − x₂) − x₂/τ relaxes exponentially to the free value with rate W + 1/τ.
    const free = this.freeUpperFraction();
    let x2 = free + ( this.upperFractionProperty.value - free ) * Math.exp( -( W + 1 / tau ) * dtModel );
    const cap = this.clampedUpperFraction();
    if ( x2 > cap - CLAMP_EPSILON ) {
      x2 = cap;
    }
    this.upperFractionProperty.value = x2;
    this.elapsedTimeProperty.value += dtModel * 1e3;
    this.updateOutputs();
    this.photonSystem.step( dt, dtModel, this );
  }

  /** Recomputes every measured quantity from the inputs and the state. */
  private updateOutputs(): void {
    const W = this.pumpRateProperty.value;
    const tau = this.upperLevelLifetimeProperty.value * 1e-3;
    const R = this.mirrorReflectivityProperty.value;
    const E2 = this.upperLevelEnergyProperty.value;
    const E1 = this.lowerLevelEnergyProperty.value;
    const N = LaserModel.TOTAL_ATOMS;

    // Light.
    const photonEnergy = E2 - E1;
    const photonJoules = photonEnergy * ELEMENTARY_CHARGE;
    const pumpEnergy = E2 + PUMP_LEVEL_GAP;
    this.pumpLevelEnergyProperty.value = pumpEnergy;
    this.photonEnergyProperty.value = photonEnergy;
    this.frequencyProperty.value = photonJoules / PLANCK / 1e12;
    this.wavelengthProperty.value = PLANCK * LIGHT_SPEED / photonJoules * 1e9;
    this.pumpFrequencyProperty.value = ( pumpEnergy - E1 ) * ELEMENTARY_CHARGE / PLANCK / 1e12;

    // Threshold.
    const gth = LaserModel.thresholdGain( R );
    const xth = gth / LaserModel.SMALL_SIGNAL_GAIN;
    this.thresholdGainProperty.value = gth;
    this.thresholdPumpRateProperty.value = xth < 1 ? ( 1 + xth ) / ( tau * ( 1 - xth ) ) : Number.POSITIVE_INFINITY;

    // Populations and gain.
    const x2 = this.upperFractionProperty.value;
    const x1 = 1 - x2;
    this.lowerPopulationProperty.value = 100 * x1;
    this.upperPopulationProperty.value = 100 * x2;
    this.populationDifferenceProperty.value = 100 * ( x2 - x1 );
    this.gainCoefficientProperty.value = LaserModel.SMALL_SIGNAL_GAIN * ( x2 - x1 );
    this.hasInversionProperty.value = x2 > x1;

    // Lasing: gain clamped at threshold while the pump alone would push it higher.
    const cap = this.clampedUpperFraction();
    const lasing = xth < 1 && x2 >= cap && this.freeUpperFraction() > cap;
    const stimulated = lasing ? Math.max( 0, N * ( W * x1 - x2 / tau ) ) : 0;
    this.isLasingProperty.value = lasing && stimulated > 0;
    this.spontaneousRateProperty.value = N * x2 / tau;
    this.stimulatedRateProperty.value = stimulated;
    this.outputPowerProperty.value = stimulated > 0 ? stimulated * LaserModel.outputFraction( R ) * photonJoules : 0;
  }

  public reset(): void {
    this.pumpRateProperty.reset();
    this.upperLevelLifetimeProperty.reset();
    this.mirrorReflectivityProperty.reset();
    this.upperLevelEnergyProperty.reset();
    this.isPlayingProperty.reset();
    this.timeSpeedProperty.reset();
    this.elapsedTimeProperty.reset();
    this.upperFractionProperty.value = 0; // start with every atom in E₁, then watch the pump build up E₂
    this.updateOutputs();
    this.photonSystem.reset();
  }
}

bsshsLaser.register( 'LaserModel', LaserModel );
