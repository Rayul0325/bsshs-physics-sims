// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The experiment bench: lamp with its on/off button, light beam, horizontal phototube (cathode plate, anode plate),
 * the moving photons and electrons, and the circuit with the power supply (voltage readout) and the ammeter
 * (photocurrent readout). See ApparatusGeometry for the positions.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import PatternStringProperty from '../../../axon/js/PatternStringProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Bounds2 from '../../../dot/js/Bounds2.js';
import Range from '../../../dot/js/Range.js';
import Shape from '../../../kite/js/Shape.js';
import NumberDisplay from '../../../scenery-phet/js/NumberDisplay.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Color from '../../../scenery/js/util/Color.js';
import BooleanRectangularToggleButton from '../../../sun/js/buttons/BooleanRectangularToggleButton.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';
import BsshsPhotoelectricStrings from '../BsshsPhotoelectricStrings.js';
import BsshsPhotoelectricModel from '../model/BsshsPhotoelectricModel.js';
import ApparatusGeometry from './ApparatusGeometry.js';
import metalNameProperty from './metalNameProperty.js';
import ParticlesNode from './ParticlesNode.js';
import PhotoelectricViewConstants from './PhotoelectricViewConstants.js';

const G = ApparatusGeometry;
const C = PhotoelectricViewConstants;

export default class ApparatusNode extends Node {

  private readonly particlesNode: ParticlesNode;

  public constructor( model: BsshsPhotoelectricModel, tandem: Tandem ) {
    super();

    // ---- circuit wires (behind everything) ----
    const wireShape = new Shape()
      .moveTo( G.CATHODE.minX, G.CATHODE.centerY )
      .lineTo( G.WIRE_LEFT_X, G.CATHODE.centerY )
      .lineTo( G.WIRE_LEFT_X, G.WIRE_Y )
      .lineTo( G.POWER_SUPPLY.minX, G.WIRE_Y )
      .moveTo( G.POWER_SUPPLY.maxX, G.WIRE_Y )
      .lineTo( G.AMMETER.minX, G.WIRE_Y )
      .moveTo( G.AMMETER.maxX, G.WIRE_Y )
      .lineTo( G.WIRE_RIGHT_X, G.WIRE_Y )
      .lineTo( G.WIRE_RIGHT_X, G.ANODE.centerY )
      .lineTo( G.ANODE.maxX, G.ANODE.centerY );
    const wires = new Path( wireShape, { stroke: C.WIRE_STROKE, lineWidth: 3, lineJoin: 'round' } );

    // ---- light beam (drawn under the tube outline so the glass edge stays visible) ----
    const perp = G.LAMP_DIRECTION.perpendicular.timesScalar( G.LAMP_APERTURE );
    const faceA = G.LAMP_FACE_CENTER.plus( perp );
    const faceB = G.LAMP_FACE_CENTER.minus( perp );
    const pairedNormally = faceA.distance( G.BEAM_TARGET_TOP ) + faceB.distance( G.BEAM_TARGET_BOTTOM ) <
                           faceA.distance( G.BEAM_TARGET_BOTTOM ) + faceB.distance( G.BEAM_TARGET_TOP );
    const beamShape = Shape.polygon( pairedNormally ?
      [ faceA, G.BEAM_TARGET_TOP, G.BEAM_TARGET_BOTTOM, faceB ] :
      [ faceA, G.BEAM_TARGET_BOTTOM, G.BEAM_TARGET_TOP, faceB ] );
    const beam = new Path( beamShape );
    Multilink.multilink( [ model.lightOnProperty, model.wavelengthProperty, model.intensityProperty ],
      ( on, wavelength, intensity ) => {
        beam.visible = on && intensity > 0;
        beam.fill = C.lightColor( wavelength ).withAlpha( 0.1 + 0.35 * intensity / 100 );
        beam.stroke = C.isVisible( wavelength ) ? null : C.INVISIBLE_LIGHT_COLOR;
        beam.lineDash = [ 6, 5 ];
      } );

    // ---- phototube ----
    const glass = new Rectangle( G.TUBE, {
      cornerRadius: G.TUBE_CORNER_RADIUS,
      fill: C.GLASS_FILL,
      stroke: C.GLASS_STROKE,
      lineWidth: 2
    } );
    const cathode = new Rectangle( G.CATHODE, { fill: C.CATHODE_FILL, stroke: C.WIRE_STROKE, cornerRadius: 2 } );
    const anode = new Rectangle( G.ANODE, { fill: C.ANODE_FILL, stroke: C.WIRE_STROKE, cornerRadius: 2 } );

    // Polarity marks next to the plates follow the sign of the applied voltage.
    const signFont = new PhetFont( { size: 20, weight: 'bold' } );
    const cathodeSign = new Text( '', { font: signFont, centerX: G.CATHODE.centerX, bottom: G.CATHODE.minY - 2 } );
    const anodeSign = new Text( '', { font: signFont, centerX: G.ANODE.centerX, bottom: G.ANODE.minY - 2 } );
    model.voltageProperty.link( voltage => {
      cathodeSign.string = voltage > 0 ? '−' : voltage < 0 ? '+' : '';
      anodeSign.string = voltage > 0 ? '+' : voltage < 0 ? '−' : '';
      cathodeSign.centerX = G.CATHODE.centerX;
      anodeSign.centerX = G.ANODE.centerX;
    } );

    const cathodeLabel = new Text( new PatternStringProperty( BsshsPhotoelectricStrings.cathodePatternStringProperty, {
      metal: metalNameProperty( model.metalProperty )
    } ), { font: C.LABEL_FONT, maxWidth: 200 } );
    cathodeLabel.boundsProperty.link( () => {
      cathodeLabel.left = G.CATHODE.minX - 30;
      cathodeLabel.top = G.TUBE.maxY + 6;
    } );
    const anodeLabel = new Text( BsshsPhotoelectricStrings.anodeStringProperty, { font: C.LABEL_FONT, maxWidth: 80 } );
    anodeLabel.boundsProperty.link( () => {
      anodeLabel.centerX = G.ANODE.centerX;
      anodeLabel.top = G.TUBE.maxY + 6;
    } );

    // ---- lamp ----
    const lampBody = new Rectangle( -G.LAMP_LENGTH / 2, -G.LAMP_HEIGHT / 2, G.LAMP_LENGTH, G.LAMP_HEIGHT, {
      cornerRadius: 8,
      fill: C.LAMP_FILL
    } );
    const lampWindow = new Rectangle( G.LAMP_LENGTH / 2 - 6, -G.LAMP_APERTURE, 6, 2 * G.LAMP_APERTURE, {
      fill: Color.WHITE
    } );
    Multilink.multilink( [ model.lightOnProperty, model.wavelengthProperty ], ( on, wavelength ) => {
      lampWindow.fill = on ? C.lightColor( wavelength ) : Color.LIGHT_GRAY;
    } );
    const lamp = new Node( {
      children: [ lampBody, lampWindow ],
      rotation: G.LAMP_ANGLE,
      translation: G.LAMP_CENTER
    } );
    const lampLabel = new Text( BsshsPhotoelectricStrings.lightSourceStringProperty, { font: C.LABEL_FONT, fill: Color.WHITE, maxWidth: 60 } );
    lampLabel.boundsProperty.link( () => { lampLabel.center = G.LAMP_CENTER; } );

    const toggleFont = C.LABEL_FONT;
    const lightButton = new BooleanRectangularToggleButton( model.lightOnProperty,
      new Text( BsshsPhotoelectricStrings.turnLightOffStringProperty, { font: toggleFont, maxWidth: 110 } ),
      new Text( BsshsPhotoelectricStrings.turnLightOnStringProperty, { font: toggleFont, maxWidth: 110 } ), {
        xMargin: 12,
        yMargin: 12,
        touchAreaXDilation: C.TOUCH_DILATION,
        touchAreaYDilation: C.TOUCH_DILATION,
        left: 0,
        top: 0,
        tandem: tandem.createTandem( 'lightButton' )
      } );

    // What kind of light it is (ultraviolet / visible / infrared), under the button.
    const bandStringProperty = new DerivedProperty(
      [ model.wavelengthProperty, BsshsPhotoelectricStrings.ultravioletStringProperty, BsshsPhotoelectricStrings.visibleLightStringProperty, BsshsPhotoelectricStrings.infraredStringProperty ],
      ( wavelength, uv, visible, ir ) => C.isVisible( wavelength ) ? visible : wavelength < 500 ? uv : ir );
    const bandText = new Text( bandStringProperty, { font: C.SMALL_FONT, maxWidth: 170 } );
    lightButton.boundsProperty.link( () => {
      bandText.left = 2;
      bandText.top = lightButton.bottom + 8;
    } );
    bandText.boundsProperty.link( () => {
      bandText.left = 2;
      bandText.top = lightButton.bottom + 8;
    } );

    // ---- instruments ----
    const powerSupply = ApparatusNode.createInstrument( G.POWER_SUPPLY, BsshsPhotoelectricStrings.powerSupplyStringProperty,
      new NumberDisplay( model.voltageProperty, BsshsPhotoelectricModel.VOLTAGE_RANGE, {
        decimalPlaces: 2,
        valuePattern: BsshsPhotoelectricStrings.voltsPatternStringProperty,
        textOptions: { font: C.READOUT_FONT },
        align: 'right'
      } ) );
    const ammeter = ApparatusNode.createInstrument( G.AMMETER, BsshsPhotoelectricStrings.ammeterStringProperty,
      new NumberDisplay( model.photocurrentProperty, new Range( 0, 2 ), {
        decimalPlaces: 3,
        valuePattern: BsshsPhotoelectricStrings.microAmperesPatternStringProperty,
        textOptions: { font: C.READOUT_FONT },
        align: 'right'
      } ) );

    this.particlesNode = new ParticlesNode( model );
    model.lightOnProperty.lazyLink( on => { if ( !on ) { this.particlesNode.clear(); } } );

    this.children = [
      wires, beam, glass, cathode, anode, this.particlesNode, cathodeSign, anodeSign, cathodeLabel, anodeLabel,
      lamp, lampLabel, lightButton, bandText, powerSupply, ammeter
    ];
  }

  /** A labelled instrument box with a digital readout, filling `bounds`. */
  private static createInstrument( bounds: Bounds2, label: TReadOnlyProperty<string>, display: NumberDisplay ): Node {
    const box = new Rectangle( bounds.minX, bounds.minY, bounds.width, bounds.height, {
      cornerRadius: 6,
      fill: Color.WHITE,
      stroke: C.GLASS_STROKE,
      lineWidth: 1.5
    } );
    const content = new VBox( {
      spacing: 3,
      children: [ new Text( label, { font: C.SMALL_FONT, maxWidth: bounds.width - 12 } ), display ]
    } );
    content.boundsProperty.link( () => { content.center = box.center; } );
    return new Node( { children: [ box, content ] } );
  }

  public step( dt: number ): void {
    this.particlesNode.step( dt );
  }

  public reset(): void {
    this.particlesNode.clear();
  }
}

bsshsPhotoelectric.register( 'ApparatusNode', ApparatusNode );
