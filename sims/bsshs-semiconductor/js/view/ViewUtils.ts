// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Shared view helpers: number formatting (scientific notation as RichText), touch-friendly number controls,
 * and two-column readout tables. Only stock components with default (themed) colors are used.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Dimension2 from '../../../dot/js/Dimension2.js';
import Range from '../../../dot/js/Range.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import NumberControl from '../../../scenery-phet/js/NumberControl.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import GridBox from '../../../scenery/js/layout/nodes/GridBox.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';

export const LABEL_FONT = new PhetFont( 15 );
export const SMALL_FONT = new PhetFont( 13 );
export const TITLE_FONT = new PhetFont( { size: 15, weight: 'bold' } );
export const VALUE_FONT = new PhetFont( 15 );

const MINUS = '−';

/** Replaces ASCII hyphen-minus with the typographic minus sign. */
export function withMinus( s: string ): string {
  return s.replace( /-/g, MINUS );
}

/**
 * About `significant` significant figures; plain decimals for 0.01 ≤ |x| < 10⁴, otherwise m×10ⁿ as RichText.
 */
export function formatNumber( x: number, significant = 3 ): string {
  if ( !Number.isFinite( x ) ) { return '–'; }
  if ( x === 0 ) { return '0'; }
  const a = Math.abs( x );
  if ( a >= 0.01 && a < 1e4 ) {
    const decimals = Math.max( 0, Math.min( 4, significant - 1 - Math.floor( Math.log10( a ) ) ) );
    return withMinus( x.toFixed( decimals ) );
  }
  let exp = Math.floor( Math.log10( a ) );
  let mant = x / Math.pow( 10, exp );
  if ( Math.abs( Number( mant.toFixed( significant - 1 ) ) ) >= 10 ) {
    exp += 1;
    mant /= 10;
  }
  return `${withMinus( mant.toFixed( significant - 1 ) )}×10<sup>${withMinus( String( exp ) )}</sup>`;
}

/** Fixed decimals with the typographic minus. */
export function formatFixed( x: number, decimals: number ): string {
  return withMinus( x.toFixed( decimals ) );
}

type ControlOptions = {
  delta: number;
  decimalPlaces?: number;
  valuePattern?: TReadOnlyProperty<string>;
  numberFormatter?: ( n: number ) => string;
  enabledProperty?: TReadOnlyProperty<boolean>;
  trackWidth?: number;
  tandem: Tandem;
};

/**
 * A NumberControl laid out as "title value / ◀ slider ▶" with dilated touch areas for phones.
 */
export function createNumberControl( title: TReadOnlyProperty<string>, property: NumberProperty, range: Range,
                                     options: ControlOptions ): NumberControl {
  const control = new NumberControl( title, property, range, {
    delta: options.delta,
    useRichText: true,
    titleNodeOptions: { font: LABEL_FONT, maxWidth: 210 },
    numberDisplayOptions: options.numberFormatter ? {
      numberFormatter: options.numberFormatter,
      useRichText: true,
      textOptions: { font: VALUE_FONT },
      maxWidth: 140
    } : {
      decimalPlaces: options.decimalPlaces ?? 1,
      valuePattern: options.valuePattern,
      textOptions: { font: VALUE_FONT },
      maxWidth: 140
    },
    sliderOptions: {
      trackSize: new Dimension2( options.trackWidth ?? 190, 4 ),
      thumbSize: new Dimension2( 15, 26 ),
      thumbTouchAreaXDilation: 26,
      thumbTouchAreaYDilation: 20,
      thumbMouseAreaXDilation: 4,
      thumbMouseAreaYDilation: 4
    },
    arrowButtonOptions: {
      scale: 0.85,
      touchAreaXDilation: 23,
      touchAreaYDilation: 23
    },
    layoutFunction: NumberControl.createLayoutFunction1( { align: 'left', ySpacing: 4, arrowButtonsXSpacing: 14 } ),
    tandem: options.tandem
  } );
  options.enabledProperty && options.enabledProperty.link( enabled => { control.enabled = enabled; } );
  return control;
}

/** One readout row: label and a live value (RichText both). */
export type ReadoutRow = {
  label: TReadOnlyProperty<string>;
  value: TReadOnlyProperty<string>;
  visibleProperty?: TReadOnlyProperty<boolean>;
};

/** A two-column table of readouts. */
export function createReadoutTable( rows: ReadoutRow[], labelMaxWidth = 190, valueMaxWidth = 140 ): Node {
  const rowNodes: Node[][] = rows.map( r => {
    const label = new RichText( r.label, { font: LABEL_FONT, maxWidth: labelMaxWidth } );
    const value = new RichText( r.value, { font: VALUE_FONT, maxWidth: valueMaxWidth } );
    if ( r.visibleProperty ) {
      label.visibleProperty = r.visibleProperty;
      value.visibleProperty = r.visibleProperty;
    }
    return [ label, value ];
  } );
  return new GridBox( {
    rows: rowNodes,
    xSpacing: 14,
    ySpacing: 5,
    xAlign: 'left'
  } );
}

/** A Property of "formatted value + unit" from a numeric Property and a {{value}} pattern. */
export function valueWithUnit( property: TReadOnlyProperty<number>, pattern: TReadOnlyProperty<string>,
                               format: ( x: number ) => string = x => formatNumber( x ) ): TReadOnlyProperty<string> {
  return new DerivedProperty( [ property, pattern ], ( x, p ) => StringUtils.fillIn( p, { value: format( x ) } ) );
}

bsshsSemiconductor.register( 'ViewUtils', { formatNumber: formatNumber } );
