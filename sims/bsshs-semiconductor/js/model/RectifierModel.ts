// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Model of the 「정류 회로」 screen: a sine source v_in = V_p sin(2πft) feeding a load resistor R through a
 * half-wave (one diode) or bridge (four diodes) rectifier, with an optional smoothing capacitor C across R.
 *
 * Diode models (one diode; the bridge always conducts through two in series):
 *   ideal            closed switch forward, open switch reverse (V_D = 0 or I_D = 0)
 *   constantDrop     V_D = V_on = 0.7 V while conducting
 *   piecewiseLinear  V_D = V_on + I_D r_d while conducting (r_d = 10 Ω)
 *
 * The model computes the periodic steady state of one input period on a grid of SAMPLES points:
 *   - no capacitor: the output is algebraic, v_out = max(0, v_s,eff)·R/(R + r_s);
 *   - ideal / constant drop with C: between samples the capacitor discharges exactly through R
 *     (v ← v·e^{−Δt/RC}); when the source side exceeds it the diode conducts and v follows the source;
 *   - piecewise linear with C: C dv/dt = (v_s,eff − v)/r_s − v/R while conducting, integrated with the exact
 *     exponential of each step (source at the step midpoint);
 *   - the period map v(0) → v(T) is iterated with a secant solve until v(T) = v(0) (periodic state).
 * Peak, ripple (peak − minimum) and average are taken from that one period, so they stay fixed while the
 * oscilloscope animates. Time on screen runs slowed down (SLOW_MOTION) so the cycle can be followed by eye.
 *
 * The class drawer adapter reads the public Properties through phet.joist.sim.screens[ 1 ].model.
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Property from '../../../axon/js/Property.js';
import StringUnionProperty from '../../../axon/js/StringUnionProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Range from '../../../dot/js/Range.js';
import type TModel from '../../../joist/js/TModel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import SemiconductorConstants from './SemiconductorConstants.js';

export type CircuitType = 'halfWave' | 'bridge';
export const CIRCUIT_TYPES: readonly CircuitType[] = [ 'halfWave', 'bridge' ];
export type DiodeModelType = 'ideal' | 'constantDrop' | 'piecewiseLinear';
export const DIODE_MODEL_TYPES: readonly DiodeModelType[] = [ 'ideal', 'constantDrop', 'piecewiseLinear' ];

/** One period of the periodic steady state (phase k/SAMPLES, k = 0…SAMPLES). */
export type RectifierSolution = {
  vOut: Float64Array;     // V
  iDiode: Float64Array;   // A, current through the conducting diode(s)
  peak: number;           // V
  min: number;            // V
  average: number;        // V
};

type CircuitParameters = {
  circuit: CircuitType;
  model: DiodeModelType;
  amplitude: number;   // V
  frequency: number;   // Hz
  resistance: number;  // Ω
  capacitance: number; // F, 0 = no capacitor
};

const SAMPLES = 4000;
const SLOW_MOTION = 1 / 50;

export default class RectifierModel implements TModel {

  /** Lets the drawer adapter tell the two screens apart. */
  public readonly modelKind = 'rectifier';

  public static readonly SAMPLES = SAMPLES;
  public static readonly SLOW_MOTION = SLOW_MOTION;
  /** The oscilloscope shows this many input periods. */
  public static readonly PERIODS_ON_SCREEN = 3;
  public static readonly AMPLITUDE_RANGE = new Range( 0, 20 );        // V
  public static readonly FREQUENCY_RANGE = new Range( 10, 120 );      // Hz
  public static readonly RESISTANCE_RANGE = new Range( 100, 10000 );  // Ω
  public static readonly CAPACITANCE_RANGE = new Range( 10, 1000 );   // μF
  public static readonly CURSOR_RANGE = new Range( 0, 1000 * 3 / 10 ); // ms, the widest screen (3 periods at 10 Hz)

  // Inputs
  public readonly circuitProperty: StringUnionProperty<CircuitType>;
  public readonly diodeModelProperty: StringUnionProperty<DiodeModelType>;
  public readonly inputAmplitudeProperty: NumberProperty;   // V_p, V
  public readonly signalFrequencyProperty: NumberProperty;  // f, Hz
  public readonly loadResistanceProperty: NumberProperty;   // R, Ω
  public readonly capacitorConnectedProperty: BooleanProperty;
  public readonly capacitanceProperty: NumberProperty;      // C, μF
  public readonly cursorTimeProperty: NumberProperty;       // oscilloscope cursor, ms from the left edge
  public readonly isPlayingProperty: BooleanProperty;
  public readonly timeProperty: NumberProperty;             // circuit time shown, s

  // Outputs
  public readonly turnOnVoltageProperty: TReadOnlyProperty<number>;  // V
  public readonly diodeResistanceProperty: TReadOnlyProperty<number>; // Ω
  public readonly solutionProperty: TReadOnlyProperty<RectifierSolution>;
  public readonly peakVoltageProperty: TReadOnlyProperty<number>;     // V
  public readonly rippleVoltageProperty: TReadOnlyProperty<number>;   // V
  public readonly averageOutputVoltageProperty: TReadOnlyProperty<number>; // V
  public readonly windowDurationProperty: TReadOnlyProperty<number>;  // ms shown on the oscilloscope
  public readonly cursorInputVoltageProperty: TReadOnlyProperty<number>;  // V
  public readonly cursorOutputVoltageProperty: TReadOnlyProperty<number>; // V
  public readonly cursorDiodeCurrentProperty: TReadOnlyProperty<number>;  // A
  public readonly cursorDiodeVoltageProperty: TReadOnlyProperty<number>;  // V

  public constructor( tandem: Tandem ) {
    this.circuitProperty = new StringUnionProperty<CircuitType>( 'halfWave', {
      validValues: CIRCUIT_TYPES, tandem: tandem.createTandem( 'circuitProperty' )
    } );
    this.diodeModelProperty = new StringUnionProperty<DiodeModelType>( 'constantDrop', {
      validValues: DIODE_MODEL_TYPES, tandem: tandem.createTandem( 'diodeModelProperty' )
    } );
    this.inputAmplitudeProperty = new NumberProperty( 10, {
      range: RectifierModel.AMPLITUDE_RANGE, tandem: tandem.createTandem( 'inputAmplitudeProperty' )
    } );
    this.signalFrequencyProperty = new NumberProperty( 60, {
      range: RectifierModel.FREQUENCY_RANGE, tandem: tandem.createTandem( 'signalFrequencyProperty' )
    } );
    this.loadResistanceProperty = new NumberProperty( 1000, {
      range: RectifierModel.RESISTANCE_RANGE, tandem: tandem.createTandem( 'loadResistanceProperty' )
    } );
    this.capacitorConnectedProperty = new BooleanProperty( false, {
      tandem: tandem.createTandem( 'capacitorConnectedProperty' )
    } );
    this.capacitanceProperty = new NumberProperty( 100, {
      range: RectifierModel.CAPACITANCE_RANGE, tandem: tandem.createTandem( 'capacitanceProperty' )
    } );
    this.cursorTimeProperty = new NumberProperty( 1000 / ( 4 * 60 ), {
      range: RectifierModel.CURSOR_RANGE, tandem: tandem.createTandem( 'cursorTimeProperty' )
    } );
    this.isPlayingProperty = new BooleanProperty( true, { tandem: tandem.createTandem( 'isPlayingProperty' ) } );
    this.timeProperty = new NumberProperty( 0, { tandem: Tandem.OPT_OUT } );

    this.turnOnVoltageProperty = new DerivedProperty( [ this.diodeModelProperty ],
      m => m === 'ideal' ? 0 : SemiconductorConstants.TURN_ON_VOLTAGE );
    this.diodeResistanceProperty = new DerivedProperty( [ this.diodeModelProperty ],
      m => m === 'piecewiseLinear' ? SemiconductorConstants.SLOPE_RESISTANCE : 0 );
    this.windowDurationProperty = new DerivedProperty( [ this.signalFrequencyProperty ],
      f => 1000 * RectifierModel.PERIODS_ON_SCREEN / f );

    const solution = new Property<RectifierSolution>( RectifierModel.solve( this.parameters() ) );
    this.solutionProperty = solution;
    Multilink.lazyMultilink( [ this.circuitProperty, this.diodeModelProperty, this.inputAmplitudeProperty,
        this.signalFrequencyProperty, this.loadResistanceProperty, this.capacitorConnectedProperty,
        this.capacitanceProperty ],
      () => { solution.value = RectifierModel.solve( this.parameters() ); } );

    this.peakVoltageProperty = new DerivedProperty( [ solution ], s => s.peak );
    this.rippleVoltageProperty = new DerivedProperty( [ solution ], s => s.peak - s.min );
    this.averageOutputVoltageProperty = new DerivedProperty( [ solution ], s => s.average );

    // Keep the cursor on the visible trace when the time axis shrinks.
    this.windowDurationProperty.link( w => {
      if ( this.cursorTimeProperty.value > w ) { this.cursorTimeProperty.value = w; }
    } );

    const deps = [ this.cursorTimeProperty, solution ] as const;
    this.cursorInputVoltageProperty = new DerivedProperty( [ ...deps ], t => this.inputVoltageAt( t / 1000 ) );
    this.cursorOutputVoltageProperty = new DerivedProperty( [ ...deps ], t => this.outputVoltageAt( t / 1000 ) );
    this.cursorDiodeCurrentProperty = new DerivedProperty( [ ...deps ], t => this.diodeCurrentAt( t / 1000 ) );
    this.cursorDiodeVoltageProperty = new DerivedProperty( [ ...deps ], t => this.diodeVoltageAt( t / 1000 ) );
  }

  private parameters(): CircuitParameters {
    return {
      circuit: this.circuitProperty.value,
      model: this.diodeModelProperty.value,
      amplitude: this.inputAmplitudeProperty.value,
      frequency: this.signalFrequencyProperty.value,
      resistance: this.loadResistanceProperty.value,
      capacitance: this.capacitorConnectedProperty.value ? this.capacitanceProperty.value * 1e-6 : 0
    };
  }

  /** Source voltage at time t (s). */
  public inputVoltageAt( t: number ): number {
    return this.inputAmplitudeProperty.value * Math.sin( 2 * Math.PI * this.signalFrequencyProperty.value * t );
  }

  /** Output (load) voltage at time t (s) of the periodic steady state. */
  public outputVoltageAt( t: number ): number {
    const p = this.parameters();
    if ( p.capacitance === 0 ) { return RectifierModel.resistiveOutput( p, this.inputVoltageAt( t ) ); }
    return RectifierModel.interpolate( this.solutionProperty.value.vOut, p.frequency * t );
  }

  /** Current through the conducting diode(s) at time t (s), A. */
  public diodeCurrentAt( t: number ): number {
    const p = this.parameters();
    if ( p.capacitance === 0 ) { return RectifierModel.resistiveOutput( p, this.inputVoltageAt( t ) ) / p.resistance; }
    return RectifierModel.interpolate( this.solutionProperty.value.iDiode, p.frequency * t );
  }

  /**
   * Voltage across one diode at time t (s): half-wave v_in − v_out (negative = reverse biased); bridge, one diode
   * of the pair the source polarity points forward, (|v_in| − v_out)/2.
   */
  public diodeVoltageAt( t: number ): number {
    const vin = this.inputVoltageAt( t );
    const vout = this.outputVoltageAt( t );
    return this.circuitProperty.value === 'halfWave' ? vin - vout : ( Math.abs( vin ) - vout ) / 2;
  }

  /** Effective source seen by the load while conducting, and the diode series resistance. */
  private static effectiveSource( p: CircuitParameters, vin: number ): { e: number; rs: number } {
    const drop = p.model === 'ideal' ? 0 : SemiconductorConstants.TURN_ON_VOLTAGE;
    const rd = p.model === 'piecewiseLinear' ? SemiconductorConstants.SLOPE_RESISTANCE : 0;
    return p.circuit === 'halfWave' ? { e: vin - drop, rs: rd } : { e: Math.abs( vin ) - 2 * drop, rs: 2 * rd };
  }

  /** Output without a capacitor: v_out = max(0, e)·R/(R + r_s). */
  private static resistiveOutput( p: CircuitParameters, vin: number ): number {
    const { e, rs } = RectifierModel.effectiveSource( p, vin );
    return e > 0 ? e * p.resistance / ( p.resistance + rs ) : 0;
  }

  /** Linear interpolation of a one-period table at a phase in periods (any real number). */
  private static interpolate( table: Float64Array, phase: number ): number {
    const x = ( phase - Math.floor( phase ) ) * SAMPLES;
    const k = Math.min( SAMPLES - 1, Math.floor( x ) );
    const u = x - k;
    return table[ k ] * ( 1 - u ) + table[ k + 1 ] * u;
  }

  /** Runs one period from v0; fills vOut (and iDiode) when given. Returns v at the end of the period. */
  private static runPeriod( p: CircuitParameters, v0: number, vOut?: Float64Array, iDiode?: Float64Array ): number {
    const period = 1 / p.frequency;
    const dt = period / SAMPLES;
    const rc = p.resistance * p.capacitance;
    const decay = Math.exp( -dt / rc );
    const omega = 2 * Math.PI * p.frequency;
    const c = p.capacitance;
    let v = v0;
    if ( vOut ) { vOut[ 0 ] = v; }
    for ( let k = 1; k <= SAMPLES; k++ ) {
      const t = k * dt;
      if ( p.model === 'piecewiseLinear' ) {
        const mid = RectifierModel.effectiveSource( p, p.amplitude * Math.sin( omega * ( t - dt / 2 ) ) );
        if ( mid.e > v ) {
          const a = 1 / ( mid.rs * c ) + 1 / rc;
          const vInf = mid.e / ( mid.rs * c ) / a;
          v = vInf + ( v - vInf ) * Math.exp( -a * dt );
        }
        else {
          v *= decay;
        }
      }
      else {
        v *= decay;
        const now = RectifierModel.effectiveSource( p, p.amplitude * Math.sin( omega * t ) );
        if ( now.e >= v ) { v = now.e; }
      }
      if ( vOut ) { vOut[ k ] = v; }
    }
    if ( iDiode && vOut ) {
      for ( let k = 0; k <= SAMPLES; k++ ) {
        const t = k * dt;
        const vin = p.amplitude * Math.sin( omega * t );
        const { e, rs } = RectifierModel.effectiveSource( p, vin );
        let i = 0;
        if ( p.model === 'piecewiseLinear' ) {
          i = Math.max( 0, ( e - vOut[ k ] ) / rs );
        }
        else if ( e >= vOut[ k ] - 1e-12 && e > 0 ) {
          // Following the source: the diode carries the load current plus the capacitor's charging current.
          const slope = p.amplitude * omega * Math.cos( omega * t ) * ( p.circuit === 'bridge' && vin < 0 ? -1 : 1 );
          i = Math.max( 0, vOut[ k ] / p.resistance + c * slope );
        }
        iDiode[ k ] = i;
      }
    }
    return v;
  }

  /** The periodic steady state for one set of circuit parameters. */
  public static solve( p: CircuitParameters ): RectifierSolution {
    const vOut = new Float64Array( SAMPLES + 1 );
    const iDiode = new Float64Array( SAMPLES + 1 );
    if ( p.capacitance === 0 ) {
      for ( let k = 0; k <= SAMPLES; k++ ) {
        const vin = p.amplitude * Math.sin( 2 * Math.PI * k / SAMPLES );
        vOut[ k ] = RectifierModel.resistiveOutput( p, vin );
        iDiode[ k ] = vOut[ k ] / p.resistance;
      }
    }
    else {
      // Secant solve of g(v0) = P(v0) − v0 = 0 for the period map P.
      const g = ( v0: number ) => RectifierModel.runPeriod( p, v0 ) - v0;
      let x0 = 0;
      let g0 = g( x0 );
      let x1 = x0 + g0;
      let g1 = g( x1 );
      for ( let k = 0; k < 60 && Math.abs( g1 ) > 1e-12 && g1 !== g0; k++ ) {
        const x2 = x1 - g1 * ( x1 - x0 ) / ( g1 - g0 );
        x0 = x1;
        g0 = g1;
        x1 = Math.max( 0, x2 );
        g1 = g( x1 );
      }
      // Finish with plain iterations (the map is a contraction) so the table closes on itself.
      let v = x1;
      for ( let k = 0; k < 3; k++ ) { v = RectifierModel.runPeriod( p, v ); }
      RectifierModel.runPeriod( p, v, vOut, iDiode );
    }
    let peak = -Infinity;
    let min = Infinity;
    let sum = 0;
    for ( let k = 0; k <= SAMPLES; k++ ) {
      peak = Math.max( peak, vOut[ k ] );
      min = Math.min( min, vOut[ k ] );
      if ( k < SAMPLES ) { sum += ( vOut[ k ] + vOut[ k + 1 ] ) / 2; }
    }
    return { vOut: vOut, iDiode: iDiode, peak: peak, min: min, average: sum / SAMPLES };
  }

  /** Advances the shown circuit time (slowed down) while playing. */
  public step( dt: number ): void {
    if ( this.isPlayingProperty.value ) { this.stepOnce( dt ); }
  }

  public stepOnce( dt: number ): void {
    this.timeProperty.value += dt * SLOW_MOTION;
  }

  public reset(): void {
    this.circuitProperty.reset();
    this.diodeModelProperty.reset();
    this.inputAmplitudeProperty.reset();
    this.signalFrequencyProperty.reset();
    this.loadResistanceProperty.reset();
    this.capacitorConnectedProperty.reset();
    this.capacitanceProperty.reset();
    this.cursorTimeProperty.reset();
    this.isPlayingProperty.reset();
    this.timeProperty.reset();
  }
}

bsshsSemiconductor.register( 'RectifierModel', RectifierModel );
