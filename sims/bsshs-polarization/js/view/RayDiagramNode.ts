// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Ray diagram of the 「반사와 브루스터각」 screen. Air above, the medium (n₂) below, the normal through the point of
 * incidence. The incident, reflected and refracted rays are drawn with opacity following their power, and carry
 * polarization marks in the usual notation: dots for the s component (field perpendicular to the plane of incidence,
 * i.e. out of the page) and short strokes across the ray for the p component (field in the plane), each sized by its
 * field amplitude. Drag the lamp to change the incidence angle. When the reflected and refracted rays are
 * perpendicular (Brewster's angle) a right-angle mark appears between them.
 */

import Multilink from '../../../axon/js/Multilink.js';
import Vector2 from '../../../dot/js/Vector2.js';
import Shape from '../../../kite/js/Shape.js';
import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
import DragListener from '../../../scenery/js/listeners/DragListener.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Color from '../../../scenery/js/util/Color.js';
import PatternStringProperty from '../../../axon/js/PatternStringProperty.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';
import BsshsPolarizationStrings from '../BsshsPolarizationStrings.js';
import ReflectionModel from '../model/ReflectionModel.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';

const C = PolarizationViewConstants;
const WIDTH = 540;
const HEIGHT = 380;
const ORIGIN = new Vector2( WIDTH / 2, 190 );
const RAY_LENGTH = 170;
const RAY_WIDTH = 7;
const DEG = Math.PI / 180;
const MARK_FRACTIONS = [ 0.3, 0.55, 0.8 ];
const PERPENDICULAR_TOLERANCE = 0.3; // degrees

/** Unit vector at angle a (degrees) from the upward normal, toward +x. */
const up = ( a: number ) => new Vector2( Math.sin( a * DEG ), -Math.cos( a * DEG ) );
/** Unit vector at angle a from the downward normal, toward +x. */
const down = ( a: number ) => new Vector2( Math.sin( a * DEG ), Math.cos( a * DEG ) );

/** A ray with its arrowhead and three polarization marks. */
class RayNode extends Node {
  private readonly line: Line;
  private readonly arrow: ArrowNode;
  private readonly marks: Node;

  public constructor() {
    super();
    this.line = new Line( 0, 0, 1, 0, { stroke: C.BEAM_COLOR, lineWidth: RAY_WIDTH, lineCap: 'round' } );
    this.arrow = new ArrowNode( 0, 0, 1, 0, { headHeight: 16, headWidth: 20, tailWidth: 0.1, fill: C.BEAM_COLOR, stroke: null } );
    this.marks = new Node();
    this.children = [ this.line, this.arrow, this.marks ];
  }

  /**
   * @param from, to - ends in diagram coordinates (light travels from → to)
   * @param power - fraction of the incoming power in this ray (0–1)
   * @param s, p - field amplitudes of the s and p components, relative to a fully s- or p-polarized incoming ray
   */
  public set( from: Vector2, to: Vector2, power: number, s: number, p: number ): void {
    this.line.setLine( from.x, from.y, to.x, to.y );
    const dir = to.minus( from ).normalized();
    const mid = from.blend( to, 0.42 );
    this.arrow.setTailAndTip( mid.x - dir.x * 8, mid.y - dir.y * 8, mid.x + dir.x * 10, mid.y + dir.y * 10 );
    const opacity = power < 1e-6 ? 0 : 0.15 + 0.85 * Math.sqrt( Math.min( 1, power ) );
    this.line.opacity = opacity;
    this.arrow.opacity = opacity;
    const normal = new Vector2( -dir.y, dir.x );
    const marks: Node[] = [];
    for ( const f of MARK_FRACTIONS ) {
      const c = from.blend( to, f );
      if ( p > 0.03 ) {
        const h = 16 * p;
        marks.push( new Line( c.x - normal.x * h, c.y - normal.y * h, c.x + normal.x * h, c.y + normal.y * h,
          { stroke: Color.BLACK, lineWidth: 2.5 } ) );
      }
      if ( s > 0.03 ) {
        marks.push( new Circle( 1.5 + 4.5 * s, { center: c, fill: Color.BLACK } ) );
      }
    }
    this.marks.children = marks;
  }
}

/** Arc from the normal direction to a ray direction, with a label. */
function arcShape( center: Vector2, radius: number, startAngle: number, endAngle: number, anticlockwise: boolean ): Shape {
  return new Shape().arc( center.x, center.y, radius, startAngle, endAngle, anticlockwise );
}

export default class RayDiagramNode extends Node {

  public static readonly WIDTH = WIDTH;
  public static readonly HEIGHT = HEIGHT;

  public constructor( model: ReflectionModel, tandem: Tandem ) {
    super();

    const medium = new Rectangle( 0, ORIGIN.y, WIDTH, HEIGHT - ORIGIN.y, { fill: Color.GRAY } );
    const surface = new Line( 0, ORIGIN.y, WIDTH, ORIGIN.y, { stroke: Color.DARK_GRAY, lineWidth: 2 } );
    const normal = new Line( ORIGIN.x, 14, ORIGIN.x, HEIGHT - 14, { stroke: Color.DARK_GRAY, lineWidth: 1.5, lineDash: [ 8, 6 ] } );
    const normalLabel = new Text( BsshsPolarizationStrings.normalStringProperty, { font: C.DRAWING_SMALL_FONT, left: ORIGIN.x + 6, top: 10, maxWidth: 80 } );
    const airLabel = new Text( BsshsPolarizationStrings.airStringProperty, { font: C.DRAWING_FONT, left: 12, top: 12, maxWidth: 200 } );
    const mediumLabel = new Text( new PatternStringProperty( BsshsPolarizationStrings.mediumStringProperty, { value: model.refractiveIndex2Property }, {
      decimalPlaces: 2
    } ), { font: C.DRAWING_FONT, left: 12, bottom: HEIGHT - 12, maxWidth: 200 } );
    const frame = new Rectangle( 0, 0, WIDTH, HEIGHT, { stroke: Color.GRAY, lineWidth: 1 } );

    const incident = new RayNode();
    const reflected = new RayNode();
    const refracted = new RayNode();

    const arcOptions = { stroke: Color.DARK_GRAY, lineWidth: 1.5 };
    const arc1 = new Path( null, arcOptions );
    const arc2 = new Path( null, arcOptions );
    const label1 = new Text( 'θ₁', { font: C.DRAWING_FONT } );
    const label2 = new Text( 'θ₂', { font: C.DRAWING_FONT } );
    const reflectedLabel = new Text( BsshsPolarizationStrings.reflectedStringProperty, { font: C.DRAWING_SMALL_FONT, maxWidth: 90 } );
    const refractedLabel = new Text( BsshsPolarizationStrings.refractedStringProperty, { font: C.DRAWING_SMALL_FONT, maxWidth: 90 } );

    const rightAngle = new Path( null, { stroke: Color.BLACK, lineWidth: 2 } );
    const perpendicularLabel = new Text( BsshsPolarizationStrings.perpendicularStringProperty, { font: C.TITLE_FONT, maxWidth: 200 } );

    // Lamp at the start of the incident ray: drag it to set θ₁
    const lamp = new Node( {
      cursor: 'pointer',
      children: [
        new Rectangle( -26, -12, 34, 24, 6, 6, { fill: Color.DARK_GRAY } ),
        new Circle( 7, { x: 8, fill: C.BEAM_COLOR } )
      ]
    } );
    lamp.touchArea = Shape.circle( 0, 0, 34 );
    lamp.mouseArea = Shape.circle( 0, 0, 28 );
    const lampDistance = RAY_LENGTH + 22;
    lamp.addInputListener( new DragListener( {
      drag: event => {
        const v = this.globalToLocalPoint( event.pointer.point ).minus( ORIGIN );
        const a = Math.atan2( -v.x, -v.y ) / DEG; // angle from the upward normal, light coming from the left
        const range = ReflectionModel.INCIDENT_ANGLE_RANGE;
        model.incidentAngleProperty.value = range.constrainValue( Math.round( a * 10 ) / 10 );
      },
      tandem: tandem.createTandem( 'lampDragListener' )
    } ) );

    this.children = [ medium, frame, surface, normal, normalLabel, airLabel, mediumLabel, arc1, arc2, label1, label2,
      refracted, reflected, incident, rightAngle, perpendicularLabel, reflectedLabel, refractedLabel, lamp ];

    Multilink.multilinkAny( [ model.incidentAngleProperty, model.refractiveIndex2Property, model.lightTypeProperty,
        model.refractionAngleProperty, model.reflectanceSProperty, model.reflectancePProperty, model.raysAngleProperty ],
      () => {
        const theta1 = model.incidentAngleProperty.value;
        const n2 = model.refractiveIndex2Property.value;
        const light = model.lightTypeProperty.value;
        // Denser media look a little darker (purely a visual cue for n₂).
        medium.opacity = 0.06 + 0.2 * ( n2 - 1 ) / 1.5;
        const theta2 = model.refractionAngleProperty.value ?? 90;
        const Rs = model.reflectanceSProperty.value;
        const Rp = model.reflectancePProperty.value;
        // Incoming power split into s and p.
        const inS = light === 'p' ? 0 : light === 's' ? 1 : 0.5;
        const inP = 1 - inS;
        const start = ORIGIN.plus( up( -theta1 ).timesScalar( RAY_LENGTH ) );
        incident.set( start, ORIGIN, 1, Math.sqrt( inS ), Math.sqrt( inP ) );
        reflected.set( ORIGIN, ORIGIN.plus( up( theta1 ).timesScalar( RAY_LENGTH ) ), inS * Rs + inP * Rp,
          Math.sqrt( inS * Rs ), Math.sqrt( inP * Rp ) );
        refracted.set( ORIGIN, ORIGIN.plus( down( theta2 ).timesScalar( RAY_LENGTH ) ), inS * ( 1 - Rs ) + inP * ( 1 - Rp ),
          Math.sqrt( inS * ( 1 - Rs ) ), Math.sqrt( inP * ( 1 - Rp ) ) );
        lamp.center = ORIGIN.plus( up( -theta1 ).timesScalar( lampDistance ) );
        lamp.rotation = ( 90 - theta1 ) * DEG;

        // Angle arcs measured from the normal (scenery angles: 0 = +x, clockwise positive since y points down)
        const upAngle = -Math.PI / 2;
        const downAngle = Math.PI / 2;
        arc1.shape = theta1 > 0.5 ? arcShape( ORIGIN, 56, upAngle - theta1 * DEG, upAngle, false ) : null;
        arc2.shape = theta2 > 0.5 ? arcShape( ORIGIN, 56, downAngle - theta2 * DEG, downAngle, false ) : null;
        label1.center = ORIGIN.plus( up( -theta1 / 2 ).timesScalar( 76 ) );
        label2.center = ORIGIN.plus( down( theta2 / 2 ).timesScalar( 76 ) );
        label1.visible = theta1 > 4;
        label2.visible = theta2 > 4;

        const reflectedEnd = ORIGIN.plus( up( theta1 ).timesScalar( RAY_LENGTH + 18 ) );
        reflectedLabel.center = reflectedEnd;
        refractedLabel.center = ORIGIN.plus( down( theta2 ).timesScalar( RAY_LENGTH + 4 ) ).plusXY( 34, 0 );

        // Right-angle mark between the reflected and the refracted ray
        const raysAngle = model.raysAngleProperty.value;
        const perpendicular = raysAngle !== null && Math.abs( raysAngle - 90 ) < PERPENDICULAR_TOLERANCE;
        rightAngle.visible = perpendicular;
        perpendicularLabel.visible = perpendicular;
        if ( perpendicular ) {
          const a = up( theta1 ).timesScalar( 22 );
          const b = down( theta2 ).timesScalar( 22 );
          const p1 = ORIGIN.plus( a );
          const p2 = ORIGIN.plus( a ).plus( b );
          const p3 = ORIGIN.plus( b );
          rightAngle.shape = new Shape().moveToPoint( p1 ).lineToPoint( p2 ).lineToPoint( p3 );
          perpendicularLabel.left = ORIGIN.x + 60;
          perpendicularLabel.centerY = ORIGIN.y + 18;
        }
      } );
  }

  /** Home-screen icon: a surface with incident, reflected and refracted rays at Brewster's angle. */
  public static createIcon(): Node {
    const o = new Vector2( 0, 0 );
    const L = 90;
    const t1 = 56.3;
    const t2 = 33.7;
    const ray = ( a: Vector2, b: Vector2, opacity: number ) => new Line( a.x, a.y, b.x, b.y, { stroke: C.BEAM_COLOR, lineWidth: 8, opacity: opacity, lineCap: 'round' } );
    return new Node( {
      children: [
        new Rectangle( -110, 0, 220, 100, { fill: Color.GRAY, opacity: 0.2 } ),
        new Line( -110, 0, 110, 0, { stroke: Color.DARK_GRAY, lineWidth: 2 } ),
        new Line( 0, -100, 0, 100, { stroke: Color.DARK_GRAY, lineWidth: 1.5, lineDash: [ 6, 5 ] } ),
        ray( o.plus( up( -t1 ).timesScalar( L ) ), o, 1 ),
        ray( o, o.plus( up( t1 ).timesScalar( L ) ), 0.45 ),
        ray( o, o.plus( down( t2 ).timesScalar( L ) ), 0.85 )
      ]
    } );
  }
}

bsshsPolarization.register( 'RayDiagramNode', RayDiagramNode );
