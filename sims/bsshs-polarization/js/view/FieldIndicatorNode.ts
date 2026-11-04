// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * A small window that shows the light in one stretch of the beam as seen head-on: the direction in which its
 * electric field oscillates (a double-headed arrow), with the arrow length proportional to the field amplitude
 * E ∝ √I (relative to the brightest possible source). Unpolarized light shows arrows in every direction.
 */

import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Node from '../../../scenery/js/nodes/Node.js';
import bsshsPolarization from '../bsshsPolarization.js';
import type { BeamState } from '../model/PolarizationMath.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';

const RADIUS = 27;
const DEG = Math.PI / 180;
const UNPOLARIZED_DIRECTIONS = [ 0, 45, 90, 135 ];

export default class FieldIndicatorNode extends Node {

  private readonly arrows: Node;
  private readonly maxIntensity: number;

  public constructor( maxIntensity: number ) {
    super();
    this.maxIntensity = maxIntensity;
    this.arrows = new Node();
    this.children = [
      new Circle( RADIUS, { fill: PolarizationViewConstants.BEAM_COLOR.withAlpha( 0.08 ), stroke: PolarizationViewConstants.BEAM_COLOR.colorUtilsDarker( 0.4 ), lineWidth: 1.5 } ),
      this.arrows
    ];
  }

  public setBeam( beam: BeamState ): void {
    const amplitude = Math.sqrt( Math.max( 0, beam.intensity ) / this.maxIntensity ); // E ∝ √I
    const half = ( RADIUS - 4 ) * Math.min( 1, amplitude );
    const directions = beam.direction === null ? UNPOLARIZED_DIRECTIONS : [ beam.direction ];
    const color = PolarizationViewConstants.BEAM_COLOR.colorUtilsDarker( 0.45 );
    this.arrows.children = half < 2 ? [] : directions.map( d => {
      const ux = Math.sin( d * DEG );
      const uy = -Math.cos( d * DEG );
      return new ArrowNode( -ux * half, -uy * half, ux * half, uy * half, {
        doubleHead: true,
        headHeight: Math.min( 8, half * 0.6 ),
        headWidth: Math.min( 10, half * 0.8 ),
        tailWidth: 2.5,
        fill: color,
        stroke: null
      } );
    } );
  }

  public static readonly RADIUS = RADIUS;
}

bsshsPolarization.register( 'FieldIndicatorNode', FieldIndicatorNode );
