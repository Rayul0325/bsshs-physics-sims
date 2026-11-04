// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Model of the 「PN 접합」 screen: an abrupt silicon or germanium p-n junction in series with a protective
 * resistor R and an adjustable DC source V_s.
 *
 * Physics (standard semiconductor relations):
 *   n_i(T)  = n_i(300 K)·(T/300)^{3/2}·exp(−E_g/(2k)·(1/T − 1/300))
 *   V_T     = kT/e
 *   V_bi    = V_T·ln(N_A N_D / n_i²)
 *   I_s     = e A n_i² (D_n/(L_n N_A) + D_p/(L_p N_D))          (long-diode saturation current)
 *   I_D     = I_s (e^{V_D/(n V_T)} − 1)                           (Shockley equation)
 *   V_s     = V_D + I_D R                                         (series circuit, solved for V_D)
 *   W       = √(2ε(V_bi − V_D)/e · (1/N_A + 1/N_D))               (depletion approximation, abrupt junction)
 *   x_p = W N_D/(N_A + N_D), x_n = W N_A/(N_A + N_D)              (charge neutrality N_A x_p = N_D x_n)
 * When V_D reaches V_bi the depletion approximation gives W = 0 (high injection is not modelled).
 * E_g is held at its 300 K value and the diffusion parameters do not change with T (simplifications).
 *
 * Every measured quantity is a public read-only Property, in SI units except doping densities (cm⁻³) and
 * energies (eV). The class drawer adapter reads them through phet.joist.sim.screens[ 0 ].model.
 */

import NumberProperty from '../../../axon/js/NumberProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import StringUnionProperty from '../../../axon/js/StringUnionProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Range from '../../../dot/js/Range.js';
import type TModel from '../../../joist/js/TModel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import SemiconductorConstants, { type Material, MATERIALS } from './SemiconductorConstants.js';

const { BOLTZMANN, ELEMENTARY_CHARGE, VACUUM_PERMITTIVITY, CM3_TO_M3 } = SemiconductorConstants;

export type JunctionState = {
  bandGap: number;            // eV
  thermalVoltage: number;     // V
  intrinsicDensity: number;   // cm⁻³
  permittivity: number;       // F/m
  saturationCurrent: number;  // A
  builtInVoltage: number;     // V
  diodeVoltage: number;       // V
  diodeCurrent: number;       // A
  depletionWidth: number;     // m
  depletionWidthP: number;    // m, part of W in the p side
  depletionWidthN: number;    // m, part of W in the n side
  barrierHeight: number;      // V (barrier e(V_bi − V_D) in eV)
  pFermiDepth: number;        // eV, E_i − E_F in the neutral p side
  nFermiHeight: number;       // eV, E_F − E_i in the neutral n side
};

export default class JunctionModel implements TModel {

  /** Lets the drawer adapter tell the two screens apart. */
  public readonly modelKind = 'junction';

  public static readonly SOURCE_VOLTAGE_RANGE = new Range( -5, 5 );
  public static readonly DOPING_EXPONENT_RANGE = new Range( 15, 18 ); // log10 of cm⁻³
  public static readonly TEMPERATURE_RANGE = new Range( 250, 400 );
  public static readonly IDEALITY_FACTOR_RANGE = new Range( 1, 2 );

  // Inputs
  public readonly materialProperty: StringUnionProperty<Material>;
  public readonly sourceVoltageProperty: NumberProperty;    // V
  public readonly acceptorExponentProperty: NumberProperty; // log10(N_A / cm⁻³)
  public readonly donorExponentProperty: NumberProperty;    // log10(N_D / cm⁻³)
  public readonly temperatureProperty: NumberProperty;      // K
  public readonly idealityFactorProperty: NumberProperty;

  // Outputs (read-only to clients)
  public readonly acceptorDensityProperty: TReadOnlyProperty<number>;   // cm⁻³
  public readonly donorDensityProperty: TReadOnlyProperty<number>;      // cm⁻³
  public readonly bandGapProperty: TReadOnlyProperty<number>;           // eV
  public readonly thermalVoltageProperty: TReadOnlyProperty<number>;    // V
  public readonly intrinsicDensityProperty: TReadOnlyProperty<number>;  // cm⁻³
  public readonly permittivityProperty: TReadOnlyProperty<number>;      // F/m
  public readonly saturationCurrentProperty: TReadOnlyProperty<number>; // A
  public readonly builtInVoltageProperty: TReadOnlyProperty<number>;    // V
  public readonly diodeVoltageProperty: TReadOnlyProperty<number>;      // V
  public readonly diodeCurrentProperty: TReadOnlyProperty<number>;      // A
  public readonly depletionWidthProperty: TReadOnlyProperty<number>;    // m
  public readonly depletionWidthPProperty: TReadOnlyProperty<number>;   // m
  public readonly depletionWidthNProperty: TReadOnlyProperty<number>;   // m
  public readonly barrierHeightProperty: TReadOnlyProperty<number>;     // V
  public readonly pFermiDepthProperty: TReadOnlyProperty<number>;       // eV
  public readonly nFermiHeightProperty: TReadOnlyProperty<number>;      // eV

  public constructor( tandem: Tandem ) {
    this.materialProperty = new StringUnionProperty<Material>( 'silicon', {
      validValues: MATERIALS,
      tandem: tandem.createTandem( 'materialProperty' )
    } );
    this.sourceVoltageProperty = new NumberProperty( 0, {
      range: JunctionModel.SOURCE_VOLTAGE_RANGE, tandem: tandem.createTandem( 'sourceVoltageProperty' )
    } );
    this.acceptorExponentProperty = new NumberProperty( 16, {
      range: JunctionModel.DOPING_EXPONENT_RANGE, tandem: tandem.createTandem( 'acceptorExponentProperty' )
    } );
    this.donorExponentProperty = new NumberProperty( 16, {
      range: JunctionModel.DOPING_EXPONENT_RANGE, tandem: tandem.createTandem( 'donorExponentProperty' )
    } );
    this.temperatureProperty = new NumberProperty( 300, {
      range: JunctionModel.TEMPERATURE_RANGE, tandem: tandem.createTandem( 'temperatureProperty' )
    } );
    this.idealityFactorProperty = new NumberProperty( 1, {
      range: JunctionModel.IDEALITY_FACTOR_RANGE, tandem: tandem.createTandem( 'idealityFactorProperty' )
    } );

    const out = () => new NumberProperty( 0, { tandem: Tandem.OPT_OUT } );
    const acceptorDensity = out();
    const donorDensity = out();
    const bandGap = out();
    const thermalVoltage = out();
    const intrinsicDensity = out();
    const permittivity = out();
    const saturationCurrent = out();
    const builtInVoltage = out();
    const diodeVoltage = out();
    const diodeCurrent = out();
    const depletionWidth = out();
    const depletionWidthP = out();
    const depletionWidthN = out();
    const barrierHeight = out();
    const pFermiDepth = out();
    const nFermiHeight = out();

    this.acceptorDensityProperty = acceptorDensity;
    this.donorDensityProperty = donorDensity;
    this.bandGapProperty = bandGap;
    this.thermalVoltageProperty = thermalVoltage;
    this.intrinsicDensityProperty = intrinsicDensity;
    this.permittivityProperty = permittivity;
    this.saturationCurrentProperty = saturationCurrent;
    this.builtInVoltageProperty = builtInVoltage;
    this.diodeVoltageProperty = diodeVoltage;
    this.diodeCurrentProperty = diodeCurrent;
    this.depletionWidthProperty = depletionWidth;
    this.depletionWidthPProperty = depletionWidthP;
    this.depletionWidthNProperty = depletionWidthN;
    this.barrierHeightProperty = barrierHeight;
    this.pFermiDepthProperty = pFermiDepth;
    this.nFermiHeightProperty = nFermiHeight;

    Multilink.multilink( [ this.materialProperty, this.sourceVoltageProperty, this.acceptorExponentProperty,
        this.donorExponentProperty, this.temperatureProperty, this.idealityFactorProperty ],
      ( material, vs, aExp, dExp, t, n ) => {
        const na = Math.pow( 10, aExp );
        const nd = Math.pow( 10, dExp );
        const s = JunctionModel.solve( material, vs, na, nd, t, n );
        acceptorDensity.value = na;
        donorDensity.value = nd;
        bandGap.value = s.bandGap;
        thermalVoltage.value = s.thermalVoltage;
        intrinsicDensity.value = s.intrinsicDensity;
        permittivity.value = s.permittivity;
        saturationCurrent.value = s.saturationCurrent;
        builtInVoltage.value = s.builtInVoltage;
        diodeVoltage.value = s.diodeVoltage;
        diodeCurrent.value = s.diodeCurrent;
        depletionWidth.value = s.depletionWidth;
        depletionWidthP.value = s.depletionWidthP;
        depletionWidthN.value = s.depletionWidthN;
        barrierHeight.value = s.barrierHeight;
        pFermiDepth.value = s.pFermiDepth;
        nFermiHeight.value = s.nFermiHeight;
      } );
  }

  /** Intrinsic carrier density n_i(T), cm⁻³. */
  public static intrinsicDensity( material: Material, temperature: number ): number {
    const p = SemiconductorConstants.MATERIAL_PARAMETERS[ material ];
    const kEv = BOLTZMANN / ELEMENTARY_CHARGE; // eV/K
    return p.intrinsicDensity300 * Math.pow( temperature / 300, 1.5 ) *
           Math.exp( -p.bandGap / ( 2 * kEv ) * ( 1 / temperature - 1 / 300 ) );
  }

  /**
   * Shockley diode current I = I_s (e^{V/(n V_T)} − 1) for a voltage V across the junction (A).
   * The single place this equation lives: `solve` and the I–V curve in the view both call it.
   */
  public static shockleyCurrent( v: number, saturationCurrent: number, idealityFactor: number, thermalVoltage: number ): number {
    return saturationCurrent * Math.expm1( v / ( idealityFactor * thermalVoltage ) );
  }

  /**
   * Diode voltage V_D of the series circuit V_s = V_D + R·I_s(e^{V_D/a} − 1), a = n V_T, by bisection.
   * The left side grows monotonically with V_D, and the root lies between 0 and V_s.
   */
  public static operatingVoltage( vs: number, saturationCurrent: number, a: number, r: number ): number {
    if ( vs === 0 ) { return 0; }
    let lo = Math.min( vs, 0 );
    let hi = Math.max( vs, 0 );
    for ( let k = 0; k < 400; k++ ) {
      const mid = 0.5 * ( lo + hi );
      if ( mid <= lo || mid >= hi ) { break; }
      const f = mid + r * saturationCurrent * Math.expm1( mid / a ) - vs;
      if ( f > 0 ) { hi = mid; }
      else { lo = mid; }
    }
    return 0.5 * ( lo + hi );
  }

  /** The full junction state for one set of inputs (doping in cm⁻³). */
  public static solve( material: Material, vs: number, na: number, nd: number, temperature: number,
                       idealityFactor: number ): JunctionState {
    const p = SemiconductorConstants.MATERIAL_PARAMETERS[ material ];
    const vt = BOLTZMANN * temperature / ELEMENTARY_CHARGE;
    const ni = JunctionModel.intrinsicDensity( material, temperature );
    const niM = ni * CM3_TO_M3;
    const naM = na * CM3_TO_M3;
    const ndM = nd * CM3_TO_M3;
    const is = ELEMENTARY_CHARGE * SemiconductorConstants.JUNCTION_AREA * niM * niM *
               ( p.electronDiffusionRate / naM + p.holeDiffusionRate / ndM );
    const vbi = Math.max( 0, vt * Math.log( na * nd / ( ni * ni ) ) );
    const vd = JunctionModel.operatingVoltage( vs, is, idealityFactor * vt, SemiconductorConstants.SERIES_RESISTANCE );
    const id = JunctionModel.shockleyCurrent( vd, is, idealityFactor, vt );
    const eps = p.relativePermittivity * VACUUM_PERMITTIVITY;
    const barrier = Math.max( 0, vbi - vd );
    const w = Math.sqrt( 2 * eps * barrier / ELEMENTARY_CHARGE * ( 1 / naM + 1 / ndM ) );
    return {
      bandGap: p.bandGap,
      thermalVoltage: vt,
      intrinsicDensity: ni,
      permittivity: eps,
      saturationCurrent: is,
      builtInVoltage: vbi,
      diodeVoltage: vd,
      diodeCurrent: id,
      depletionWidth: w,
      depletionWidthP: w * nd / ( na + nd ),
      depletionWidthN: w * na / ( na + nd ),
      barrierHeight: barrier,
      pFermiDepth: vt * Math.log( na / ni ),
      nFermiHeight: vt * Math.log( nd / ni )
    };
  }

  public step( dt: number ): void {
    // The junction is a steady state; carrier motion is drawn by the view.
  }

  public reset(): void {
    this.materialProperty.reset();
    this.sourceVoltageProperty.reset();
    this.acceptorExponentProperty.reset();
    this.donorExponentProperty.reset();
    this.temperatureProperty.reset();
    this.idealityFactorProperty.reset();
  }
}

bsshsSemiconductor.register( 'JunctionModel', JunctionModel );
