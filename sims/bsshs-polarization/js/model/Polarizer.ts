// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * One ideal polarizer on the bench: whether it is in the beam, and the angle of its transmission axis
 * (degrees from the vertical, 0–180; 0° and 180° are the same axis).
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Range from '../../../dot/js/Range.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';

export default class Polarizer {

  public static readonly ANGLE_RANGE = new Range( 0, 180 );

  public readonly insertedProperty: BooleanProperty;
  public readonly angleProperty: NumberProperty;

  public constructor( inserted: boolean, angle: number, tandem: Tandem ) {
    this.insertedProperty = new BooleanProperty( inserted, { tandem: tandem.createTandem( 'insertedProperty' ) } );
    this.angleProperty = new NumberProperty( angle, {
      range: Polarizer.ANGLE_RANGE,
      tandem: tandem.createTandem( 'angleProperty' )
    } );
  }

  public reset(): void {
    this.insertedProperty.reset();
    this.angleProperty.reset();
  }
}

bsshsPolarization.register( 'Polarizer', Polarizer );
