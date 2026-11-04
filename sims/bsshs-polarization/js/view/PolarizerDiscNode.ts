// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * One polarizer drawn face-on, as the light sees it: a tinted disc whose fine parallel lines and bold axis show the
 * transmission axis (angle from the vertical, clockwise on screen). Drag anywhere on the disc to turn it; the axis
 * follows the pointer in 1° steps. A polarizer that is out of the beam is drawn faint with a dashed rim.
 */

import Multilink from '../../../axon/js/Multilink.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Vector2 from '../../../dot/js/Vector2.js';
import Shape from '../../../kite/js/Shape.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import Text from '../../../scenery/js/nodes/Text.js';
import DragListener from '../../../scenery/js/listeners/DragListener.js';
import Color from '../../../scenery/js/util/Color.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';
import BsshsPolarizationStrings from '../BsshsPolarizationStrings.js';
import type Polarizer from '../model/Polarizer.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';

const RADIUS = 54;
const LINE_SPACING = 8;
const DEG = Math.PI / 180;

/** The disc artwork (rim, film, axis lines), rotation applied by the caller. */
function createFace( radius: number ): { rim: Circle; film: Node } {
  const lines = new Shape();
  for ( let x = -radius + LINE_SPACING / 2; x < radius; x += LINE_SPACING ) {
    const h = Math.sqrt( Math.max( 0, radius * radius - x * x ) );
    lines.moveTo( x, -h ).lineTo( x, h );
  }
  const film = new Node( {
    children: [
      new Path( lines, { stroke: Color.GRAY.withAlpha( 0.55 ), lineWidth: 1 } ),
      new Line( 0, -radius, 0, radius, { stroke: Color.DARK_GRAY, lineWidth: 4 } ),
      new Circle( 6, { y: -radius + 2, fill: Color.DARK_GRAY } ),
      new Circle( 6, { y: radius - 2, fill: Color.DARK_GRAY } )
    ]
  } );
  const rim = new Circle( radius, { fill: Color.GRAY.withAlpha( 0.16 ), stroke: Color.DARK_GRAY, lineWidth: 3 } );
  return { rim: rim, film: film };
}

export default class PolarizerDiscNode extends Node {

  public constructor( polarizer: Polarizer, labelProperty: TReadOnlyProperty<string>, tandem: Tandem ) {
    super( { cursor: 'pointer' } );

    const face = createFace( RADIUS );
    const label = new Text( '', { font: PolarizationViewConstants.DRAWING_FONT, maxWidth: 2 * RADIUS + 30 } );
    this.children = [ face.rim, face.film, label ];

    Multilink.multilink( [ polarizer.insertedProperty, polarizer.angleProperty, labelProperty,
        BsshsPolarizationStrings.removedStringProperty ],
      ( inserted, angle, name, removed ) => {
        face.film.rotation = angle * DEG;
        face.film.opacity = inserted ? 1 : 0.3;
        face.rim.opacity = inserted ? 1 : 0.45;
        face.rim.lineDash = inserted ? [] : [ 6, 5 ];
        label.string = inserted ? `${name} · ${angle.toFixed( 0 )}°` : `${name} · ${removed}`;
        label.centerX = 0;
        label.top = RADIUS + 8;
      } );

    // Turn the disc by dragging: the axis points at the pointer (either end of the axis, angles repeat every 180°).
    const setFromPoint = ( point: Vector2 ) => {
      const local = this.globalToLocalPoint( point );
      if ( local.magnitude < 4 ) { return; }
      const a = Math.atan2( local.x, -local.y ) / DEG;
      const folded = ( ( Math.round( a ) % 180 ) + 180 ) % 180;
      polarizer.angleProperty.value = folded;
    };
    face.rim.touchArea = Shape.circle( 0, 0, RADIUS + 6 );
    face.rim.mouseArea = Shape.circle( 0, 0, RADIUS + 2 );
    face.rim.addInputListener( new DragListener( {
      start: event => setFromPoint( event.pointer.point ),
      drag: event => setFromPoint( event.pointer.point ),
      tandem: tandem.createTandem( 'dragListener' )
    } ) );
    face.film.pickable = false;
    label.pickable = false;
  }

  public static readonly RADIUS = RADIUS;

  /** Home-screen icon: two crossed polarizers with a beam. */
  public static createIcon(): Node {
    const a = createFace( RADIUS );
    const b = createFace( RADIUS );
    b.film.rotation = 60 * DEG;
    return new Node( {
      children: [
        new Node( { children: [ a.rim, a.film ], x: -40 } ),
        new Node( { children: [ b.rim, b.film ], x: 40 } )
      ]
    } );
  }
}

bsshsPolarization.register( 'PolarizerDiscNode', PolarizerDiscNode );
