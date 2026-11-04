// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The experiment seen from above: an X-ray tube on the left sends photons along the axis to an electron at rest;
 * a detector on a semicircular track (draggable) catches the photon scattered by θ, and the recoiling electron
 * leaves below the axis at φ. Waves are drawn with a spacing proportional to the wavelength, so the longer
 * scattered wavelength is visible. The electron arrow length is proportional to |pₑ| / |p|.
 *
 * Local coordinates: WIDTH × HEIGHT view units, the electron at (CENTER_X, CENTER_Y).
 */

import type BooleanProperty from '../../../axon/js/BooleanProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import Vector2 from '../../../dot/js/Vector2.js';
import Shape from '../../../kite/js/Shape.js';
import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
import ShadedSphereNode from '../../../scenery-phet/js/ShadedSphereNode.js';
import DragListener from '../../../scenery/js/listeners/DragListener.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import bsshsCompton from '../bsshsCompton.js';
import BsshsComptonStrings from '../BsshsComptonStrings.js';
import type BsshsComptonModel from '../model/BsshsComptonModel.js';
import ComptonViewConstants from './ComptonViewConstants.js';

const C = ComptonViewConstants;

const WIDTH = 560;
const HEIGHT = 312;
const CENTER_X = 318;
const CENTER_Y = 186;
const DETECTOR_RADIUS = 160;
const SOURCE_RIGHT = 82;
const WAVE_UNITS_PER_PM = 1.1; // drawn wave spacing per picometer of wavelength
const WAVE_AMPLITUDE = 9;
const WAVE_FREQUENCY = 0.9; // drawn crests per second passing a point (animation only)
const ELECTRON_ARROW_UNITS = 64; // arrow length for |pₑ| = |p|
const ELECTRON_TRIP_SECONDS = 1.6;
const DEG = Math.PI / 180;

/**
 * A sine wave along +x from x0 to x1 with tapered ends.
 */
function waveShape( x0: number, x1: number, wavelength: number, phase: number ): Shape {
  const shape = new Shape();
  const step = Math.max( 0.5, Math.min( wavelength / 12, 3 ) );
  const n = Math.max( 2, Math.ceil( ( x1 - x0 ) / step ) );
  for ( let i = 0; i <= n; i++ ) {
    const x = x0 + ( x1 - x0 ) * i / n;
    const taper = Math.min( 1, ( x - x0 ) / 12, ( x1 - x ) / 12 );
    const y = -WAVE_AMPLITUDE * taper * Math.sin( 2 * Math.PI * ( x - x0 ) / wavelength - phase );
    i === 0 ? shape.moveTo( x, y ) : shape.lineTo( x, y );
  }
  return shape;
}

export default class ScatteringStageNode extends Node {

  public static readonly WIDTH = WIDTH;
  public static readonly HEIGHT = HEIGHT;

  private readonly model: BsshsComptonModel;
  private readonly isPlayingProperty: BooleanProperty;
  private readonly incidentWave: Path;
  private readonly scatteredWave: Path;
  private readonly movingElectron: Node;
  private phase = 0;
  private trip = 0;

  public constructor( model: BsshsComptonModel, isPlayingProperty: BooleanProperty ) {
    super();
    this.model = model;
    this.isPlayingProperty = isPlayingProperty;

    // invisible frame so the node's bounds are the full stage
    this.addChild( new Rectangle( 0, 0, WIDTH, HEIGHT, { pickable: false } ) );

    // where the detector can go, and the θ = 0 reference direction
    this.addChild( new Path( Shape.arc( CENTER_X, CENTER_Y, DETECTOR_RADIUS, 0, -Math.PI, true ), {
      stroke: C.TRACK_COLOR, lineWidth: 2, lineDash: [ 4, 6 ]
    } ) );
    this.addChild( new Line( CENTER_X, CENTER_Y, CENTER_X + DETECTOR_RADIUS + 30, CENTER_Y, {
      stroke: C.GUIDE_COLOR, lineWidth: 1.5, lineDash: [ 7, 5 ]
    } ) );

    // X-ray tube
    const tube = new Rectangle( 8, CENTER_Y - 24, SOURCE_RIGHT - 8, 48, 8, 8, { fill: C.DEVICE_COLOR } );
    const tubeLabel = new Text( BsshsComptonStrings.xRayTubeStringProperty, {
      font: C.LABEL_FONT, fill: C.ON_DEVICE_TEXT_COLOR, maxWidth: SOURCE_RIGHT - 18
    } );
    tubeLabel.boundsProperty.link( () => { tubeLabel.center = tube.center; } );
    this.addChild( tube );
    this.addChild( tubeLabel );

    // waves
    this.incidentWave = new Path( null, { stroke: C.PHOTON_COLOR, lineWidth: 2.5, x: SOURCE_RIGHT, y: CENTER_Y } );
    this.scatteredWave = new Path( null, { stroke: C.SCATTERED_PHOTON_COLOR, lineWidth: 2.5, x: CENTER_X, y: CENTER_Y } );
    this.addChild( this.incidentWave );
    this.addChild( this.scatteredWave );

    // angle arcs and labels
    const thetaArc = new Path( null, { stroke: C.GUIDE_COLOR, lineWidth: 1.5 } );
    const phiArc = new Path( null, { stroke: C.ELECTRON_COLOR, lineWidth: 1.5 } );
    const thetaLabel = new Text( '', { font: C.LABEL_FONT, maxWidth: 110 } );
    const phiLabel = new Text( '', { font: C.LABEL_FONT, fill: C.ELECTRON_COLOR, maxWidth: 110 } );
    this.addChild( thetaArc );
    this.addChild( phiArc );
    this.addChild( thetaLabel );
    this.addChild( phiLabel );

    // recoiling electron: momentum arrow and an animated electron moving along it
    const recoilArrow = new ArrowNode( CENTER_X, CENTER_Y, CENTER_X + 1, CENTER_Y, {
      fill: C.ELECTRON_COLOR, stroke: null, tailWidth: 4, headWidth: 13, headHeight: 11
    } );
    const recoilLabel = new Text( BsshsComptonStrings.recoilElectronStringProperty, {
      font: C.LABEL_FONT, fill: C.ELECTRON_COLOR, maxWidth: 120
    } );
    this.movingElectron = new ShadedSphereNode( 12, { mainColor: C.ELECTRON_COLOR, opacity: 0.8 } );
    this.addChild( recoilArrow );
    this.addChild( this.movingElectron );
    this.addChild( recoilLabel );

    // the electron at rest (target)
    this.addChild( new ShadedSphereNode( 18, { mainColor: C.ELECTRON_COLOR, center: new Vector2( CENTER_X, CENTER_Y ) } ) );
    const restLabel = new Text( BsshsComptonStrings.electronAtRestStringProperty, { font: C.SMALL_FONT, maxWidth: 120 } );
    restLabel.boundsProperty.link( () => { restLabel.right = CENTER_X - 10; restLabel.top = CENTER_Y + 14; } );
    this.addChild( restLabel );

    // detector (draggable along the track)
    const detector = new Node( {
      cursor: 'pointer',
      children: [
        new Rectangle( -10, -17, 44, 34, 5, 5, { fill: C.DEVICE_BODY_COLOR, stroke: C.DEVICE_COLOR, lineWidth: 1.5 } ),
        new Rectangle( -15, -12, 7, 24, 2, 2, { fill: C.DEVICE_COLOR } )
      ]
    } );
    detector.touchArea = Shape.circle( 6, 0, 36 );
    detector.mouseArea = Shape.circle( 6, 0, 28 );
    const detectorLabel = new Text( BsshsComptonStrings.detectorStringProperty, { font: C.LABEL_FONT, maxWidth: 100 } );
    this.addChild( detector );
    this.addChild( detectorLabel );

    const angleAt = ( globalPoint: Vector2 ) => {
      const p = this.globalToLocalPoint( globalPoint );
      const deg = Math.abs( Math.atan2( CENTER_Y - p.y, p.x - CENTER_X ) ) / DEG; // mirror drags below the axis
      return Math.round( deg );
    };
    detector.addInputListener( new DragListener( {
      drag: event => { model.scatteringAngleProperty.value = angleAt( event.pointer.point ); }
    } ) );

    Multilink.multilink( [ model.resultProperty, BsshsComptonStrings.thetaPatternStringProperty,
      BsshsComptonStrings.phiPatternStringProperty ], ( r, thetaPattern, phiPattern ) => {
      const theta = r.scatteringAngle * DEG;
      const dirX = Math.cos( theta );
      const dirY = -Math.sin( theta );

      detector.rotation = -theta;
      detector.translation = new Vector2( CENTER_X + DETECTOR_RADIUS * dirX, CENTER_Y + DETECTOR_RADIUS * dirY );
      detectorLabel.center = new Vector2( CENTER_X + ( DETECTOR_RADIUS + 58 ) * dirX, CENTER_Y + ( DETECTOR_RADIUS + 50 ) * dirY - 4 );
      this.scatteredWave.rotation = -theta;

      // θ arc above the axis
      thetaArc.shape = r.scatteringAngle > 0.5 ? Shape.arc( CENTER_X, CENTER_Y, 54, 0, -theta, true ) : null;
      thetaLabel.string = thetaPattern.replace( '{{value}}', toFixed( r.scatteringAngle, 0 ) );
      const labelAngle = Math.max( theta / 2, 24 * DEG );
      thetaLabel.center = new Vector2( CENTER_X + 92 * Math.cos( labelAngle ), CENTER_Y - 78 * Math.sin( labelAngle ) );

      // recoil electron below the axis
      const ratio = r.electronMomentum / r.incidentMomentum;
      const phi = r.recoilAngle * DEG;
      const length = ELECTRON_ARROW_UNITS * ratio;
      const moving = length > 2;
      recoilArrow.visible = moving;
      recoilLabel.visible = moving;
      phiArc.visible = moving;
      phiLabel.visible = moving;
      this.movingElectron.visible = moving;
      if ( moving ) {
        const tipX = CENTER_X + ( 12 + length ) * Math.cos( phi );
        const tipY = CENTER_Y + ( 12 + length ) * Math.sin( phi );
        recoilArrow.setTailAndTip( CENTER_X + 12 * Math.cos( phi ), CENTER_Y + 12 * Math.sin( phi ), tipX, tipY );
        recoilLabel.leftCenter = new Vector2( tipX + 8 * Math.cos( phi ) + 4, tipY + 12 * Math.sin( phi ) + 6 );
        phiArc.shape = r.recoilAngle > 0.5 ? Shape.arc( CENTER_X, CENTER_Y, 40, 0, phi, false ) : null;
        phiLabel.string = phiPattern.replace( '{{value}}', toFixed( r.recoilAngle, 1 ) );
        const phiLabelAngle = Math.min( Math.max( phi / 2, 30 * DEG ), 60 * DEG );
        phiLabel.leftCenter = new Vector2( CENTER_X + 50 * Math.cos( phiLabelAngle ) + 8, CENTER_Y + 50 * Math.sin( phiLabelAngle ) + 4 );
      }
      this.updateAnimation();
    } );
  }

  /** Redraws the moving parts for the current phase. */
  private updateAnimation(): void {
    const r = this.model.resultProperty.value;
    this.incidentWave.shape = waveShape( 0, CENTER_X - 14 - SOURCE_RIGHT, r.incidentWavelength * WAVE_UNITS_PER_PM, this.phase );
    this.scatteredWave.shape = waveShape( 14, DETECTOR_RADIUS - 18, r.scatteredWavelength * WAVE_UNITS_PER_PM, this.phase );

    const phi = r.recoilAngle * DEG;
    const length = ELECTRON_ARROW_UNITS * r.electronMomentum / r.incidentMomentum;
    const d = 12 + length * this.trip;
    this.movingElectron.center = new Vector2( CENTER_X + d * Math.cos( phi ), CENTER_Y + d * Math.sin( phi ) );
    this.movingElectron.opacity = 0.85 * ( 1 - this.trip * 0.6 );
  }

  public step( dt: number ): void {
    if ( this.isPlayingProperty.value ) {
      this.phase = ( this.phase + 2 * Math.PI * WAVE_FREQUENCY * dt ) % ( 2 * Math.PI );
      this.trip = ( this.trip + dt / ELECTRON_TRIP_SECONDS ) % 1;
      this.updateAnimation();
    }
  }

  public reset(): void {
    this.phase = 0;
    this.trip = 0;
    this.updateAnimation();
  }
}

bsshsCompton.register( 'ScatteringStageNode', ScatteringStageNode );
