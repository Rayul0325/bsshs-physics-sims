// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Model of the template: one input quantity and one quantity derived from it. This is a made-up demo
 * (a square's side and area) with no physics claim; a real sim puts its physics here.
 *
 * Everything under js/model/ is part of the sim's physics hash (drawer/hash.mjs), so a teacher's approval
 * goes stale when it changes. The class drawer adapter reads these public Properties at runtime through
 * phet.joist.sim.screens[ 0 ].model (see README.md).
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Range from '../../../dot/js/Range.js';
import type TModel from '../../../joist/js/TModel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsTemplate from '../bsshsTemplate.js';

export default class BsshsTemplateModel implements TModel {

  /** Allowed side lengths, in cm. */
  public static readonly SIDE_LENGTH_RANGE = new Range( 1, 10 );

  /** Input set by the slider, in cm. */
  public readonly sideLengthProperty: NumberProperty;

  /** Derived output shown in the readout, in cm². */
  public readonly areaProperty: TReadOnlyProperty<number>;

  public constructor( tandem: Tandem ) {
    this.sideLengthProperty = new NumberProperty( 4, {
      range: BsshsTemplateModel.SIDE_LENGTH_RANGE,
      tandem: tandem.createTandem( 'sideLengthProperty' )
    } );
    this.areaProperty = new DerivedProperty( [ this.sideLengthProperty ], side => side * side );
  }

  /** Called by the sim clock every frame; this demo has nothing that changes over time. */
  public step( dt: number ): void {
    // no time evolution
  }

  public reset(): void {
    this.sideLengthProperty.reset();
  }
}

bsshsTemplate.register( 'BsshsTemplateModel', BsshsTemplateModel );
