// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * A two-channel oscilloscope: CH1 = source voltage v_in, CH2 = load voltage v_out, triggered on the rising zero
 * of v_in so the steady-state traces stand still. The time axis always spans RectifierModel.PERIODS_ON_SCREEN
 * input periods (10 divisions); the voltage axis picks the smallest 1-2-5 step per division that fits V_p in
 * four divisions. A bright dot sweeps the traces at the (slowed) circuit time.
 *
 * A draggable cursor (drag its handle or press anywhere on the screen) reads both channels and the diode current
 * at one instant; its time is RectifierModel.cursorTimeProperty, so the drawer can record it.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import type Vector2 from '../../../dot/js/Vector2.js';
import Shape from '../../../kite/js/Shape.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import DragListener from '../../../scenery/js/listeners/DragListener.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import BsshsSemiconductorStrings from '../BsshsSemiconductorStrings.js';
import RectifierModel from '../model/RectifierModel.js';
import SemiconductorColors from './SemiconductorColors.js';
import { formatFixed, formatNumber, LABEL_FONT, SMALL_FONT, TITLE_FONT } from './ViewUtils.js';

const SCREEN_W = 520;
const SCREEN_H = 208;
const DIV_X = 10;
const DIV_Y = 8;
const TRACE_POINTS = 600;
const STEPS = [ 0.1, 0.2, 0.5, 1, 2, 5, 10 ];

export default class OscilloscopeNode extends Node {

  private readonly model: RectifierModel;
  private readonly inputDot: Circle;
  private readonly outputDot: Circle;
  private voltsPerDiv = 5;

  public constructor( model: RectifierModel, tandem: Tandem ) {
    super();
    this.model = model;

    const title = new Text( BsshsSemiconductorStrings.rectifier.oscilloscopeStringProperty, { font: TITLE_FONT, maxWidth: 160 } );
    const chip = ( fill: typeof SemiconductorColors.scopeInput, label: typeof BsshsSemiconductorStrings.rectifier.channelInputStringProperty ) =>
      new HBox( { spacing: 5, children: [ new Rectangle( 0, 0, 14, 14, { fill: fill, stroke: SemiconductorColors.outline } ), new Text( label, { font: SMALL_FONT, maxWidth: 90 } ) ] } );
    const header = new HBox( { spacing: 16, children: [ title, chip( SemiconductorColors.scopeInput, BsshsSemiconductorStrings.rectifier.channelInputStringProperty ), chip( SemiconductorColors.scopeOutput, BsshsSemiconductorStrings.rectifier.channelOutputStringProperty ) ] } );

    const screen = new Rectangle( 0, 0, SCREEN_W, SCREEN_H, 6, 6, { fill: SemiconductorColors.scopeScreen } );
    const grid = new Shape();
    for ( let i = 1; i < DIV_X; i++ ) { grid.moveTo( i * SCREEN_W / DIV_X, 0 ).lineTo( i * SCREEN_W / DIV_X, SCREEN_H ); }
    for ( let j = 1; j < DIV_Y; j++ ) { grid.moveTo( 0, j * SCREEN_H / DIV_Y ).lineTo( SCREEN_W, j * SCREEN_H / DIV_Y ); }
    const gridPath = new Path( grid, { stroke: SemiconductorColors.scopeGrid, lineWidth: 1 } );
    const zeroLine = new Line( 0, SCREEN_H / 2, SCREEN_W, SCREEN_H / 2, { stroke: SemiconductorColors.muted, lineWidth: 1.5 } );
    const inputTrace = new Path( null, { stroke: SemiconductorColors.scopeInput, lineWidth: 2 } );
    const outputTrace = new Path( null, { stroke: SemiconductorColors.scopeOutput, lineWidth: 2.5 } );
    this.inputDot = new Circle( 4, { fill: SemiconductorColors.scopeInput } );
    this.outputDot = new Circle( 4.5, { fill: SemiconductorColors.scopeOutput } );
    const cursorLine = new Line( 0, 0, 0, SCREEN_H, { stroke: SemiconductorColors.scopeCursor, lineWidth: 1.5, lineDash: [ 5, 4 ] } );
    const handle = new Node( {
      children: [
        new Path( new Shape().moveTo( 0, 0 ).lineTo( 11, 14 ).lineTo( 11, 30 ).lineTo( -11, 30 ).lineTo( -11, 14 ).close(),
          { fill: SemiconductorColors.outline } ),
        new Text( BsshsSemiconductorStrings.rectifier.cursorStringProperty, { font: SMALL_FONT, fill: SemiconductorColors.scopeText, centerX: 0, centerY: 22, maxWidth: 20 } )
      ],
      cursor: 'pointer'
    } );
    handle.touchArea = handle.localBounds.dilatedXY( 14, 10 );
    handle.mouseArea = handle.localBounds.dilated( 4 );
    const plotLayer = new Node( {
      children: [ gridPath, zeroLine, inputTrace, outputTrace, this.inputDot, this.outputDot, cursorLine ],
      clipArea: Shape.rect( 0, 0, SCREEN_W, SCREEN_H )
    } );
    const scopeNode = new Node( { children: [ screen, plotLayer, handle ], cursor: 'pointer' } );

    const scaleText = new RichText( '', { font: SMALL_FONT, maxWidth: SCREEN_W } );
    const cursorText = new RichText( '', { font: LABEL_FONT, maxWidth: SCREEN_W } );
    const bridgeNote = new Text( BsshsSemiconductorStrings.rectifier.bridgeGroundNoteStringProperty, { font: SMALL_FONT, maxWidth: SCREEN_W } );
    model.circuitProperty.link( c => { bridgeNote.visible = c === 'bridge'; } );

    header.left = 0;
    header.top = 0;
    scopeNode.left = 0;
    scopeNode.top = header.bottom + 6;
    this.children = [ header, scopeNode, scaleText, cursorText, bridgeNote ];

    const xOf = ( ms: number ) => ms / model.windowDurationProperty.value * SCREEN_W;
    const yOf = ( v: number ) => SCREEN_H / 2 - v / this.voltsPerDiv * SCREEN_H / DIV_Y;

    // Traces
    Multilink.multilink( [ model.solutionProperty, model.windowDurationProperty, model.inputAmplitudeProperty ], ( _solution, windowMs, vp ) => {
      this.voltsPerDiv = STEPS.find( s => s * ( DIV_Y / 2 ) >= Math.max( vp, 0.2 ) * 1.05 ) ?? STEPS[ STEPS.length - 1 ];
      const inShape = new Shape();
      const outShape = new Shape();
      for ( let i = 0; i <= TRACE_POINTS; i++ ) {
        const ms = windowMs * i / TRACE_POINTS;
        const x = i / TRACE_POINTS * SCREEN_W;
        const vin = model.inputVoltageAt( ms / 1000 );
        const vout = model.outputVoltageAt( ms / 1000 );
        if ( i === 0 ) { inShape.moveTo( x, yOf( vin ) ); outShape.moveTo( x, yOf( vout ) ); }
        else { inShape.lineTo( x, yOf( vin ) ); outShape.lineTo( x, yOf( vout ) ); }
      }
      inputTrace.shape = inShape;
      outputTrace.shape = outShape;
    } );

    Multilink.multilink( [ model.windowDurationProperty, model.inputAmplitudeProperty, BsshsSemiconductorStrings.rectifier.timeDivisionStringProperty,
      BsshsSemiconductorStrings.rectifier.voltageDivisionStringProperty ], ( windowMs, vp, tPattern, vPattern ) => {
      scaleText.string = `${StringUtils.fillIn( tPattern, { value: formatNumber( windowMs / DIV_X ) } )}     ` +
                         `${StringUtils.fillIn( vPattern, { value: formatNumber( this.voltsPerDiv ) } )}`;
      scaleText.left = 0;
      scaleText.top = scopeNode.top + SCREEN_H + 36;
    } );

    // Cursor
    const cursorReadout = new DerivedProperty( [ model.cursorTimeProperty, model.cursorInputVoltageProperty,
        model.cursorOutputVoltageProperty, model.cursorDiodeCurrentProperty, BsshsSemiconductorStrings.rectifier.cursorTimeStringProperty,
        BsshsSemiconductorStrings.rectifier.inputStringProperty, BsshsSemiconductorStrings.rectifier.outputStringProperty, BsshsSemiconductorStrings.rectifier.diodeCurrentStringProperty,
        BsshsSemiconductorStrings.units.millisecondsStringProperty, BsshsSemiconductorStrings.units.voltsStringProperty, BsshsSemiconductorStrings.units.milliampsStringProperty ],
      ( t, vin, vout, i, tLabel, inLabel, outLabel, iLabel, msP, vP, mAP ) =>
        `${tLabel} = ${StringUtils.fillIn( msP, { value: formatFixed( t, 2 ) } )}  ·  ` +
        `${inLabel} ${StringUtils.fillIn( vP, { value: formatFixed( vin, 2 ) } )}  ·  ` +
        `${outLabel} ${StringUtils.fillIn( vP, { value: formatFixed( vout, 2 ) } )}  ·  ` +
        `${iLabel} ${StringUtils.fillIn( mAP, { value: formatNumber( i * 1e3 ) } )}` );
    cursorReadout.link( s => {
      cursorText.string = s;
      cursorText.left = 0;
      cursorText.top = scaleText.bottom + 5;
      bridgeNote.left = 0;
      bridgeNote.top = cursorText.bottom + 4;
    } );
    Multilink.multilink( [ model.cursorTimeProperty, model.windowDurationProperty, model.solutionProperty ], t => {
      const x = Math.min( SCREEN_W, Math.max( 0, xOf( t ) ) );
      cursorLine.setLine( x, 0, x, SCREEN_H );
      handle.x = x;
      handle.y = SCREEN_H + 2;
    } );
    const dragTo = ( globalPoint: Vector2 ) => {
      const local = scopeNode.globalToLocalPoint( globalPoint );
      const u = Math.min( 1, Math.max( 0, local.x / SCREEN_W ) );
      model.cursorTimeProperty.value = u * model.windowDurationProperty.value;
    };
    scopeNode.addInputListener( new DragListener( {
      press: event => dragTo( event.pointer.point ),
      drag: event => dragTo( event.pointer.point ),
      tandem: tandem.createTandem( 'cursorDragListener' )
    } ) );

    this.step();
  }

  /** Moves the sweep dots to the (slowed) circuit time. */
  public step(): void {
    const model = this.model;
    const windowMs = model.windowDurationProperty.value;
    const t = model.timeProperty.value;
    const ms = ( t * 1000 ) % windowMs;
    const x = ms / windowMs * SCREEN_W;
    const yOf = ( v: number ) => SCREEN_H / 2 - v / this.voltsPerDiv * SCREEN_H / DIV_Y;
    this.inputDot.setTranslation( x, yOf( model.inputVoltageAt( t ) ) );
    this.outputDot.setTranslation( x, yOf( model.outputVoltageAt( t ) ) );
  }
}

bsshsSemiconductor.register( 'OscilloscopeNode', OscilloscopeNode );
