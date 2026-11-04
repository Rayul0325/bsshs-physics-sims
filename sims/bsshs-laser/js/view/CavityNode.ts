// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The optical cavity seen from the side: the pump light above, the gain medium with its atoms between a fully
 * reflecting back mirror and the partly transmitting output mirror, the output beam and the light meter that
 * measures the output power. Atoms and photons (LaserPhotonSystem) are painted on a canvas every frame.
 */

import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import Bounds2 from '../../../dot/js/Bounds2.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import Shape from '../../../kite/js/Shape.js';
import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import CanvasNode from '../../../scenery/js/nodes/CanvasNode.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Color from '../../../scenery/js/util/Color.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import bsshsLaser from '../bsshsLaser.js';
import BsshsLaserStrings from '../BsshsLaserStrings.js';
import LaserModel from '../model/LaserModel.js';
import LaserPhotonSystem from '../model/LaserPhotonSystem.js';
import LaserViewConstants from './LaserViewConstants.js';

// Geometry (view units). The medium's aspect ratio matches LaserPhotonSystem.ASPECT.
const WIDTH = 500;
const MEDIUM_LEFT = 40;
const MEDIUM_LENGTH = 340;
const MEDIUM_HEIGHT = MEDIUM_LENGTH / LaserPhotonSystem.ASPECT;
const MEDIUM_TOP = 74;
const MIRROR_THICKNESS = 9;
const LAMP_TOP = 26;
const LAMP_HEIGHT = 14;
const METER_X = MEDIUM_LEFT + LaserPhotonSystem.METER_X * MEDIUM_LENGTH;
const METER_WIDTH = 30;
const ATOM_RADIUS = 5;
const PACKET_LENGTH = 22; // drawn length of one photon
const PACKET_AMPLITUDE = 4;
const BEAM_HEIGHT = 8;

/** x, y in LaserPhotonSystem coordinates → view coordinates. */
const viewX = ( x: number ) => MEDIUM_LEFT + x * MEDIUM_LENGTH;
const viewY = ( y: number ) => MEDIUM_TOP + y * MEDIUM_HEIGHT;

/** Drawn wavelength of the photon squiggle, growing with the real wavelength (λ/60 per nm). */
const drawnWavelength = ( nm: number ) => nm / 60;

class PhotonCanvas extends CanvasNode {

  public constructor( private readonly model: LaserModel ) {
    super( { canvasBounds: new Bounds2( 0, 0, WIDTH, MEDIUM_TOP + MEDIUM_HEIGHT + 70 ) } );
  }

  public paintCanvas( context: CanvasRenderingContext2D ): void {
    const system = this.model.photonSystem;
    const light = LaserViewConstants.lightColor( this.model.wavelengthProperty.value );
    const lightCss = light.toCSS();
    const k = 2 * Math.PI / drawnWavelength( this.model.wavelengthProperty.value );

    // Atoms: gray in E₁, glowing in the laser color in E₂; a white ring just after pumping, a colored ring
    // just after emitting.
    for ( const atom of system.atoms ) {
      const x = viewX( atom.x );
      const y = viewY( atom.y );
      context.beginPath();
      context.arc( x, y, ATOM_RADIUS, 0, 2 * Math.PI );
      context.fillStyle = atom.excited ? lightCss : LaserViewConstants.GROUND_ATOM.toCSS();
      context.fill();
      if ( atom.pumpFlash > 0 || atom.emitFlash > 0 ) {
        context.beginPath();
        context.arc( x, y, ATOM_RADIUS + 3, 0, 2 * Math.PI );
        context.lineWidth = 1.5;
        context.strokeStyle = ( atom.pumpFlash > 0 ? Color.WHITE : light ).withAlpha( 0.8 ).toCSS();
        context.stroke();
      }
    }

    // Photons as short wave packets. Axial photons use the cavity x for their phase, so twins from stimulated
    // emission (same phase and direction) are drawn crest to crest.
    for ( const p of system.photons ) {
      const cx = viewX( p.x );
      const cy = viewY( p.y );
      const ux = Math.cos( p.direction );
      const uy = Math.sin( p.direction );
      const fade = p.axial ? 1 : Math.max( 0, 1 - p.age / 1.4 );
      context.beginPath();
      for ( let i = 0; i <= 16; i++ ) {
        const s = ( i / 16 - 0.5 ) * PACKET_LENGTH;
        const phaseArg = p.axial ? k * ( cx + ux * s ) - p.phase : k * s - p.phase;
        const a = PACKET_AMPLITUDE * Math.sin( phaseArg );
        const px = cx + ux * s - uy * a;
        const py = cy + uy * s + ux * a;
        i === 0 ? context.moveTo( px, py ) : context.lineTo( px, py );
      }
      context.lineWidth = p.coherent ? 2.2 : 1.6;
      context.strokeStyle = light.withAlpha( p.coherent ? 1 : 0.85 * fade ).toCSS();
      context.stroke();
    }
  }
}

export default class CavityNode extends Node {

  private readonly photonCanvas: PhotonCanvas;

  public constructor( model: LaserModel ) {
    super();
    const lightColorProperty = new DerivedProperty( [ model.wavelengthProperty ], nm => LaserViewConstants.lightColor( nm ) );
    const pumpColorProperty = new DerivedProperty( [ model.pumpLevelEnergyProperty, model.lowerLevelEnergyProperty ],
      ( e3, e1 ) => LaserViewConstants.lightColor( 1239.84198 / ( e3 - e1 ) ) );

    // Pump light above the medium; brightness follows the pump rate.
    const pumpFraction = new DerivedProperty( [ model.pumpRateProperty ], w => w / LaserModel.PUMP_RATE_RANGE.max );
    const lamp = new Rectangle( MEDIUM_LEFT + 20, LAMP_TOP, MEDIUM_LENGTH - 40, LAMP_HEIGHT, 6, 6, {
      fill: pumpColorProperty, stroke: Color.GRAY, lineWidth: 1
    } );
    const lampLabel = new Text( BsshsLaserStrings.cavity.pumpLampStringProperty, {
      font: LaserViewConstants.SMALL_FONT, maxWidth: 160, left: MEDIUM_LEFT + 20, bottom: LAMP_TOP - 4
    } );
    const pumpArrows = new Node();
    for ( let i = 0; i < 5; i++ ) {
      const x = MEDIUM_LEFT + 50 + i * ( MEDIUM_LENGTH - 100 ) / 4;
      pumpArrows.addChild( new ArrowNode( x, LAMP_TOP + LAMP_HEIGHT + 3, x, MEDIUM_TOP - 4, {
        headHeight: 8, headWidth: 10, tailWidth: 3, fill: pumpColorProperty, stroke: null
      } ) );
    }
    pumpFraction.link( f => {
      pumpArrows.opacity = f === 0 ? 0 : 0.25 + 0.75 * f;
      lamp.opacity = 0.35 + 0.65 * f;
    } );

    // Gain medium and mirrors.
    const medium = new Rectangle( MEDIUM_LEFT, MEDIUM_TOP, MEDIUM_LENGTH, MEDIUM_HEIGHT, 4, 4, {
      fill: LaserViewConstants.CAVITY_BACKGROUND, stroke: Color.GRAY, lineWidth: 1
    } );
    const mirrorTop = MEDIUM_TOP - 12;
    const mirrorHeight = MEDIUM_HEIGHT + 24;
    const backMirror = new Rectangle( MEDIUM_LEFT - MIRROR_THICKNESS - 2, mirrorTop, MIRROR_THICKNESS, mirrorHeight, 2, 2, {
      fill: LaserViewConstants.MIRROR, stroke: Color.DARK_GRAY, lineWidth: 1.5
    } );
    const outputMirror = new Rectangle( MEDIUM_LEFT + MEDIUM_LENGTH + 2, mirrorTop, MIRROR_THICKNESS - 3, mirrorHeight, 2, 2, {
      fill: LaserViewConstants.MIRROR, stroke: Color.DARK_GRAY, lineWidth: 1.5
    } );
    // The output mirror looks more see-through the less it reflects.
    model.mirrorReflectivityProperty.link( r => { outputMirror.opacity = 0.35 + 0.65 * ( r - 50 ) / 50; } );

    const labelTop = mirrorTop + mirrorHeight + 4;
    const backLabel = new Text( BsshsLaserStrings.cavity.backMirrorStringProperty, {
      font: LaserViewConstants.SMALL_FONT, maxWidth: 140, left: MEDIUM_LEFT - MIRROR_THICKNESS - 2, top: labelTop
    } );
    const outputLabel = new Text( BsshsLaserStrings.cavity.outputMirrorStringProperty, {
      font: LaserViewConstants.SMALL_FONT, maxWidth: 110, centerX: MEDIUM_LEFT + MEDIUM_LENGTH + 5, top: labelTop
    } );
    const mediumLabel = new Text( BsshsLaserStrings.cavity.mediumStringProperty, {
      font: LaserViewConstants.SMALL_FONT, maxWidth: 200, centerX: MEDIUM_LEFT + MEDIUM_LENGTH * 0.55, top: labelTop
    } );

    // Output beam: brightness follows the output power.
    const beamLeft = MEDIUM_LEFT + MEDIUM_LENGTH + MIRROR_THICKNESS;
    const beam = new Rectangle( beamLeft, MEDIUM_TOP + MEDIUM_HEIGHT / 2 - BEAM_HEIGHT / 2, METER_X - METER_WIDTH / 2 - beamLeft, BEAM_HEIGHT, {
      fill: lightColorProperty
    } );
    model.outputPowerProperty.link( p => { beam.opacity = p > 0 ? 0.25 + 0.75 * p / ( p + 0.6 ) : 0; } );

    // Light meter: a detector head and its readout.
    const meterHead = new Rectangle( METER_X - METER_WIDTH / 2, MEDIUM_TOP + 4, METER_WIDTH, MEDIUM_HEIGHT - 8, 5, 5, {
      fill: Color.DARK_GRAY, stroke: Color.BLACK, lineWidth: 1
    } );
    const meterWindow = new Rectangle( METER_X - METER_WIDTH / 2, MEDIUM_TOP + MEDIUM_HEIGHT / 2 - 10, 5, 20, {
      fill: Color.LIGHT_GRAY
    } );
    const meterFlash = new Circle( 5, { fill: lightColorProperty, center: meterWindow.center, visible: false } );
    this.meterFlash = meterFlash;
    const powerString = new DerivedProperty( [ model.outputPowerProperty, BsshsLaserStrings.units.wattsPatternStringProperty ],
      ( p, pattern ) => StringUtils.fillIn( pattern, { value: toFixed( p, p < 10 ? 3 : 2 ) } ) );
    const meterReadout = new VBox( {
      spacing: 2,
      align: 'center',
      children: [
        new Text( BsshsLaserStrings.cavity.meterStringProperty, { font: LaserViewConstants.SMALL_FONT, maxWidth: 90 } ),
        new Text( powerString, { font: LaserViewConstants.VALUE_FONT, maxWidth: 100 } )
      ]
    } );
    meterReadout.boundsProperty.link( () => {
      meterReadout.centerX = Math.min( METER_X, WIDTH - meterReadout.width / 2 );
      meterReadout.top = labelTop;
    } );

    this.photonCanvas = new PhotonCanvas( model );

    // Legend: spontaneous (scattered) vs stimulated (in step) photons, and atom states.
    const legend = this.createLegend( lightColorProperty );
    legend.left = MEDIUM_LEFT - MIRROR_THICKNESS - 2;
    legend.top = labelTop + 26;

    this.children = [
      lampLabel, lamp, pumpArrows, beam, medium, this.photonCanvas, backMirror, outputMirror,
      meterHead, meterWindow, meterFlash, backLabel, outputLabel, mediumLabel, meterReadout, legend
    ];

    // Keep the labels apart: the medium label sits between the two mirror labels.
    mediumLabel.left = Math.max( mediumLabel.left, backLabel.right + 10 );
    mediumLabel.right = Math.min( mediumLabel.right, outputLabel.left - 10 );
  }

  private readonly meterFlash: Node;

  private createLegend( lightColorProperty: TReadOnlyProperty<Color> ): Node {
    const squiggle = ( phase: number, dy: number ) => {
      const shape = new Shape();
      for ( let i = 0; i <= 20; i++ ) {
        const x = i * 1.2;
        const y = dy + 3.5 * Math.sin( x * 0.6 - phase );
        i === 0 ? shape.moveTo( x, y ) : shape.lineTo( x, y );
      }
      return new Path( shape, { stroke: lightColorProperty, lineWidth: 1.8 } );
    };
    const scattered = new Node( {
      children: [ squiggle( 0, 0 ), new Node( { children: [ squiggle( 2.1, 0 ) ], rotation: 0.7, x: 6, y: 2 } ) ]
    } );
    const inStep = new Node( { children: [ squiggle( 0, 0 ), squiggle( 0, 9 ) ] } );
    const atomIcon = ( fill: Color | TReadOnlyProperty<Color> ) => new Circle( ATOM_RADIUS, { fill: fill } );
    const item = ( icon: Node, label: TReadOnlyProperty<string> ) => new HBox( {
      spacing: 6, children: [ icon, new Text( label, { font: LaserViewConstants.SMALL_FONT, maxWidth: 210 } ) ]
    } );
    return new VBox( {
      spacing: 6,
      align: 'left',
      children: [
        new HBox( {
          spacing: 18,
          children: [
            item( scattered, BsshsLaserStrings.cavity.spontaneousLegendStringProperty ),
            item( atomIcon( LaserViewConstants.GROUND_ATOM ), BsshsLaserStrings.cavity.groundLegendStringProperty )
          ]
        } ),
        new HBox( {
          spacing: 18,
          children: [
            item( inStep, BsshsLaserStrings.cavity.stimulatedLegendStringProperty ),
            item( atomIcon( lightColorProperty ), BsshsLaserStrings.cavity.excitedLegendStringProperty )
          ]
        } )
      ]
    } );
  }

  /** Repaints atoms and photons (called every frame). */
  public update( model: LaserModel ): void {
    this.meterFlash.visible = model.photonSystem.meterFlash > 0;
    this.photonCanvas.invalidatePaint();
  }
}

bsshsLaser.register( 'CavityNode', CavityNode );
