// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Model of the Compton scattering experiment: an X-ray photon of adjustable wavelength (or, equivalently, energy)
 * hits a free electron at rest, and a detector at angle θ picks up the scattered photon. Every measured quantity is
 * a public Property in the unit the sim shows (pm, keV, keV/c, degrees, v/c), so the class drawer adapter
 * (adapters/bsshs-compton/adapter.mjs) reads them from phet.joist.sim.screens[ 0 ].model. The physics is in
 * ComptonPhysics (exact relativistic kinematics).
 *
 * The model has no time evolution (the moving waves are view animation), so every value is settled as soon as an
 * input changes.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Range from '../../../dot/js/Range.js';
import type TModel from '../../../joist/js/TModel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsCompton from '../bsshsCompton.js';
import ComptonPhysics, { type ComptonResult } from './ComptonPhysics.js';

export default class BsshsComptonModel implements TModel {

  /** Incident X-ray wavelengths, pm (5 pm ≈ 248 keV … 100 pm ≈ 12.4 keV). */
  public static readonly WAVELENGTH_RANGE = new Range( 5, 100 );

  /** The same range expressed as photon energy, keV. */
  public static readonly ENERGY_RANGE = new Range(
    ComptonPhysics.energyFromWavelength( BsshsComptonModel.WAVELENGTH_RANGE.max ),
    ComptonPhysics.energyFromWavelength( BsshsComptonModel.WAVELENGTH_RANGE.min )
  );

  /** Detector (photon scattering) angles, degrees. */
  public static readonly ANGLE_RANGE = new Range( 0, 180 );

  /** Compton wavelength h/(mₑc), pm. */
  public readonly comptonWavelength = ComptonPhysics.COMPTON_WAVELENGTH;

  /** Electron rest energy mₑc², keV. */
  public readonly electronRestEnergy = ComptonPhysics.ELECTRON_REST_ENERGY;

  // inputs
  public readonly incidentWavelengthProperty: NumberProperty; // λ, pm
  public readonly incidentEnergyProperty: NumberProperty; // E = hc/λ, keV (kept in sync with λ)
  public readonly scatteringAngleProperty: NumberProperty; // θ, °

  // the solved collision, and one Property per measured quantity
  public readonly resultProperty: TReadOnlyProperty<ComptonResult>;
  public readonly oneMinusCosThetaProperty: TReadOnlyProperty<number>;
  public readonly wavelengthShiftProperty: TReadOnlyProperty<number>; // Δλ, pm
  public readonly scatteredWavelengthProperty: TReadOnlyProperty<number>; // λ′, pm
  public readonly scatteredEnergyProperty: TReadOnlyProperty<number>; // E′, keV
  public readonly incidentMomentumProperty: TReadOnlyProperty<number>; // p, keV/c
  public readonly scatteredMomentumProperty: TReadOnlyProperty<number>; // p′, keV/c
  public readonly electronMomentumProperty: TReadOnlyProperty<number>; // |pₑ|, keV/c
  public readonly recoilAngleProperty: TReadOnlyProperty<number>; // φ, °
  public readonly electronKineticEnergyProperty: TReadOnlyProperty<number>; // Kₑ, keV
  public readonly electronTotalEnergyProperty: TReadOnlyProperty<number>; // Kₑ + mₑc², keV
  public readonly electronSpeedProperty: TReadOnlyProperty<number>; // v/c
  public readonly energyAfterProperty: TReadOnlyProperty<number>; // E′ + Kₑ, keV

  public constructor( tandem: Tandem ) {
    this.incidentWavelengthProperty = new NumberProperty( 71, {
      range: BsshsComptonModel.WAVELENGTH_RANGE,
      tandem: tandem.createTandem( 'incidentWavelengthProperty' )
    } );
    this.incidentEnergyProperty = new NumberProperty( ComptonPhysics.energyFromWavelength( 71 ), {
      range: BsshsComptonModel.ENERGY_RANGE,
      tandem: tandem.createTandem( 'incidentEnergyProperty' )
    } );
    this.scatteringAngleProperty = new NumberProperty( 60, {
      range: BsshsComptonModel.ANGLE_RANGE,
      tandem: tandem.createTandem( 'scatteringAngleProperty' )
    } );

    // λ and E describe the same photon. Whichever one is set drives the other; the guard stops the echo.
    let syncing = false;
    this.incidentWavelengthProperty.lazyLink( wavelength => {
      if ( !syncing ) {
        syncing = true;
        this.incidentEnergyProperty.value = ComptonPhysics.energyFromWavelength( wavelength );
        syncing = false;
      }
    } );
    this.incidentEnergyProperty.lazyLink( energy => {
      if ( !syncing ) {
        syncing = true;
        this.incidentWavelengthProperty.value = ComptonPhysics.wavelengthFromEnergy( energy );
        syncing = false;
      }
    } );

    this.resultProperty = new DerivedProperty( [ this.incidentWavelengthProperty, this.scatteringAngleProperty ],
      ( wavelength, angle ) => ComptonPhysics.solve( wavelength, angle ) );

    const field = ( pick: ( r: ComptonResult ) => number ) => new DerivedProperty( [ this.resultProperty ], pick );
    this.oneMinusCosThetaProperty = field( r => r.oneMinusCosTheta );
    this.wavelengthShiftProperty = field( r => r.wavelengthShift );
    this.scatteredWavelengthProperty = field( r => r.scatteredWavelength );
    this.scatteredEnergyProperty = field( r => r.scatteredEnergy );
    this.incidentMomentumProperty = field( r => r.incidentMomentum );
    this.scatteredMomentumProperty = field( r => r.scatteredMomentum );
    this.electronMomentumProperty = field( r => r.electronMomentum );
    this.recoilAngleProperty = field( r => r.recoilAngle );
    this.electronKineticEnergyProperty = field( r => r.electronKineticEnergy );
    this.electronTotalEnergyProperty = field( r => r.electronTotalEnergy );
    this.electronSpeedProperty = field( r => r.electronSpeed );
    this.energyAfterProperty = field( r => r.energyAfter );
  }

  /** No time evolution in the model. */
  public step( dt: number ): void {
    // nothing to do
  }

  public reset(): void {
    this.incidentWavelengthProperty.reset(); // also resets the energy through the link
    this.scatteringAngleProperty.reset();
  }
}

bsshsCompton.register( 'BsshsComptonModel', BsshsComptonModel );
