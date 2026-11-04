// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Schematic of the rectifier: AC source, one diode (half-wave) or a four-diode bridge, the smoothing capacitor
 * (when connected) and the load resistor, with the two oscilloscope probe points.
 *
 * Every wire branch carries the current Kirchhoff's laws give it at the shown time (diode current i_D, load
 * current v_out/R, capacitor current i_D − v_out/R); electrons (dots) drift against that conventional current,
 * faster for larger currents. A diode that conducts glows.
 */

import Multilink from '../../../axon/js/Multilink.js';
import Shape from '../../../kite/js/Shape.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Text from '../../../scenery/js/nodes/Text.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import BsshsSemiconductorStrings from '../BsshsSemiconductorStrings.js';
import RectifierModel from '../model/RectifierModel.js';
import SemiconductorColors from './SemiconductorColors.js';
import { formatFixed, formatNumber, LABEL_FONT, SMALL_FONT, TITLE_FONT } from './ViewUtils.js';

type Pt = [ number, number ];

const SRC_X = 50;
const SRC_Y = 120;
const SRC_R = 26;
const TOP = 40;
const BOT = 200;
const CAP_X = 360;
const RES_X = 460;
const PLATE_GAP = 16;
const DOT_SPACING = 18;

/** A wire branch with drifting electrons. Positive current flows from the first point to the last. */
class FlowBranch extends Node {
  private readonly points: Pt[];
  private readonly length: number;
  private readonly dots: Circle[] = [];
  private offset = Math.random() * DOT_SPACING;

  public constructor( points: Pt[] ) {
    super( { pickable: false } );
    this.points = points;
    let len = 0;
    for ( let i = 1; i < points.length; i++ ) { len += Math.hypot( points[ i ][ 0 ] - points[ i - 1 ][ 0 ], points[ i ][ 1 ] - points[ i - 1 ][ 1 ] ); }
    this.length = len;
    for ( let k = 0; k * DOT_SPACING < len; k++ ) {
      const dot = new Circle( 2.6, { fill: SemiconductorColors.electron } );
      this.dots.push( dot );
      this.addChild( dot );
    }
    this.update( 0, 0 );
  }

  /** current in A, dt in s */
  public update( current: number, dt: number ): void {
    const mA = current * 1e3;
    const speed = -Math.sign( mA ) * 70 * Math.tanh( Math.abs( mA ) / 25 );
    this.offset = ( ( this.offset + speed * dt ) % DOT_SPACING + DOT_SPACING ) % DOT_SPACING;
    const show = Math.abs( mA ) > 1e-3;
    this.dots.forEach( ( dot, k ) => {
      const d = k * DOT_SPACING + this.offset;
      dot.visible = show && d <= this.length;
      if ( dot.visible ) {
        const p = this.pointAt( d );
        dot.setTranslation( p[ 0 ], p[ 1 ] );
      }
    } );
  }

  private pointAt( d: number ): Pt {
    let rest = d;
    for ( let i = 1; i < this.points.length; i++ ) {
      const a = this.points[ i - 1 ];
      const b = this.points[ i ];
      const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
      if ( rest <= len || i === this.points.length - 1 ) {
        const u = len > 0 ? Math.min( 1, rest / len ) : 0;
        return [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * u, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * u ];
      }
      rest -= len;
    }
    return this.points[ this.points.length - 1 ];
  }
}

/** Diode symbol centered between a (anode) and b (cathode), pointing a → b. */
class DiodeSymbol extends Node {
  private readonly triangle: Path;

  public constructor( a: Pt, b: Pt ) {
    super();
    const half = 13;
    this.triangle = new Path( new Shape().moveTo( -half, -11 ).lineTo( half, 0 ).lineTo( -half, 11 ).close(),
      { fill: SemiconductorColors.idle, stroke: SemiconductorColors.outline, lineWidth: 2 } );
    const bar = new Line( half, -12, half, 12, { stroke: SemiconductorColors.outline, lineWidth: 3 } );
    const mask = new Line( -half - 2, 0, half + 2, 0, { stroke: SemiconductorColors.idle, lineWidth: 6 } );
    this.children = [ mask, this.triangle, bar ];
    this.rotation = Math.atan2( b[ 1 ] - a[ 1 ], b[ 0 ] - a[ 0 ] );
    this.setTranslation( ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2 );
  }

  public setConducting( on: boolean ): void {
    this.triangle.fill = on ? SemiconductorColors.conducting : SemiconductorColors.idle;
  }
}

function wire( points: Pt[] ): Path {
  const s = new Shape().moveTo( points[ 0 ][ 0 ], points[ 0 ][ 1 ] );
  for ( let i = 1; i < points.length; i++ ) { s.lineTo( points[ i ][ 0 ], points[ i ][ 1 ] ); }
  return new Path( s, { stroke: SemiconductorColors.wire, lineWidth: 2.5, lineJoin: 'round' } );
}

function probe( x: number, y: number, fill: typeof SemiconductorColors.scopeInput, label: typeof BsshsSemiconductorStrings.rectifier.probeInputStringProperty ): Node {
  return new Node( {
    children: [
      new Circle( 6, { fill: fill, stroke: SemiconductorColors.outline, lineWidth: 1.5, x: x, y: y } ),
      new Text( label, { font: SMALL_FONT, left: x + 9, bottom: y - 3, maxWidth: 60 } )
    ]
  } );
}

export default class RectifierCircuitNode extends Node {

  private readonly model: RectifierModel;
  private readonly halfBranches: { branch: FlowBranch; current: () => number }[] = [];
  private readonly bridgeBranches: { branch: FlowBranch; current: () => number }[] = [];
  private readonly loadBranches: { branch: FlowBranch; current: () => number }[] = [];
  private readonly halfDiode: DiodeSymbol;
  private readonly bridgeDiodes: { diode: DiodeSymbol; positiveHalf: boolean }[] = [];
  private readonly halfLayer: Node;
  private readonly bridgeLayer: Node;
  private readonly capLayer: Node;
  private iD = 0;
  private vOut = 0;
  private vIn = 0;

  public constructor( model: RectifierModel ) {
    super();
    this.model = model;

    // AC source
    const sine = new Shape().moveTo( -14, 0 );
    for ( let i = 1; i <= 28; i++ ) { sine.lineTo( -14 + i, -8 * Math.sin( Math.PI * i / 14 ) ); }
    const source = new Node( {
      x: SRC_X, y: SRC_Y,
      children: [
        new Circle( SRC_R, { fill: SemiconductorColors.idle, stroke: SemiconductorColors.outline, lineWidth: 2 } ),
        new Path( sine, { stroke: SemiconductorColors.outline, lineWidth: 2 } )
      ]
    } );
    const sourceLabel = new Text( BsshsSemiconductorStrings.rectifier.sourceStringProperty, { font: SMALL_FONT, maxWidth: 90, centerX: SRC_X, top: BOT + 6 } );

    // load: capacitor and resistor
    const capTopY = ( TOP + BOT ) / 2 - PLATE_GAP / 2;
    const capBotY = capTopY + PLATE_GAP;
    this.capLayer = new Node( {
      children: [
        wire( [ [ CAP_X, TOP ], [ CAP_X, capTopY ] ] ),
        wire( [ [ CAP_X, capBotY ], [ CAP_X, BOT ] ] ),
        new Line( CAP_X - 22, capTopY, CAP_X + 22, capTopY, { stroke: SemiconductorColors.outline, lineWidth: 4 } ),
        new Line( CAP_X - 22, capBotY, CAP_X + 22, capBotY, { stroke: SemiconductorColors.outline, lineWidth: 4 } ),
        new Circle( 4, { fill: SemiconductorColors.wire, x: CAP_X, y: TOP } ),
        new Circle( 4, { fill: SemiconductorColors.wire, x: CAP_X, y: BOT } )
      ]
    } );
    const capLabel = new RichText( '', { font: LABEL_FONT, maxWidth: 80 } );
    const zig = new Shape().moveTo( RES_X, 82 );
    for ( let i = 0; i < 7; i++ ) { zig.lineTo( RES_X + ( i % 2 === 0 ? 10 : -10 ), 88 + i * 11 ); }
    zig.lineTo( RES_X, 164 );
    const resistor = new Node( {
      children: [
        wire( [ [ RES_X, TOP ], [ RES_X, 82 ] ] ),
        new Path( zig, { stroke: SemiconductorColors.outline, lineWidth: 2.5, lineJoin: 'round' } ),
        wire( [ [ RES_X, 164 ], [ RES_X, BOT ] ] )
      ]
    } );
    const resLabel = new RichText( '', { font: LABEL_FONT, maxWidth: 110 } );
    const loadRails = new Node( { children: [ wire( [ [ CAP_X, TOP ], [ RES_X, TOP ] ] ), wire( [ [ CAP_X, BOT ], [ RES_X, BOT ] ] ) ] } );

    // half-wave layout
    this.halfDiode = new DiodeSymbol( [ 160, TOP ], [ 196, TOP ] );
    this.halfLayer = new Node( {
      children: [
        wire( [ [ SRC_X, SRC_Y - SRC_R ], [ SRC_X, TOP ], [ CAP_X, TOP ] ] ),
        wire( [ [ SRC_X, SRC_Y + SRC_R ], [ SRC_X, BOT ], [ CAP_X, BOT ] ] ),
        this.halfDiode
      ]
    } );

    // bridge layout: AC at the top and bottom corners, + output at the right corner, − at the left corner
    const T: Pt = [ 200, 50 ];
    const B: Pt = [ 200, 190 ];
    const L: Pt = [ 140, 120 ];
    const R: Pt = [ 260, 120 ];
    const hopY = 190;
    const hop = new Shape().moveTo( 100, 120 ).lineTo( 100, hopY - 7 ).arc( 100, hopY, 7, -Math.PI / 2, Math.PI / 2, false ).lineTo( 100, BOT ).lineTo( CAP_X, BOT );
    const bridgeWires = [
      wire( [ [ SRC_X, SRC_Y - SRC_R ], [ SRC_X, T[ 1 ] ], T ] ),
      wire( [ [ SRC_X, SRC_Y + SRC_R ], [ SRC_X, B[ 1 ] ], B ] ),
      wire( [ T, R ] ), wire( [ B, R ] ), wire( [ L, T ] ), wire( [ L, B ] ),
      wire( [ R, [ 300, R[ 1 ] ], [ 300, TOP ], [ CAP_X, TOP ] ] ),
      wire( [ L, [ 100, L[ 1 ] ] ] ),
      new Path( hop, { stroke: SemiconductorColors.wire, lineWidth: 2.5 } )
    ];
    const at = ( a: Pt, b: Pt, u: number ): Pt => [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * u, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * u ];
    const diodeOn = ( a: Pt, b: Pt ) => new DiodeSymbol( at( a, b, 0.3 ), at( a, b, 0.7 ) );
    const dTR = diodeOn( T, R );
    const dBR = diodeOn( B, R );
    const dLT = diodeOn( L, T );
    const dLB = diodeOn( L, B );
    this.bridgeDiodes.push( { diode: dTR, positiveHalf: true }, { diode: dLB, positiveHalf: true },
      { diode: dBR, positiveHalf: false }, { diode: dLT, positiveHalf: false } );
    const plus = new Text( '+', { font: TITLE_FONT, left: R[ 0 ] + 6, bottom: R[ 1 ] - 4 } );
    const minus = new Text( '−', { font: TITLE_FONT, right: L[ 0 ] - 6, bottom: L[ 1 ] - 4 } );
    this.bridgeLayer = new Node( { children: [ ...bridgeWires, dTR, dBR, dLT, dLB, plus, minus ] } );

    // flows
    const iD = () => this.iD;
    const iR = () => this.vOut / model.loadResistanceProperty.value;
    const iC = () => this.iD - iR();
    const signed = () => ( this.vIn >= 0 ? 1 : -1 ) * this.iD;
    const pair = ( positiveHalf: boolean ) => () => ( ( this.vIn >= 0 ) === positiveHalf ? this.iD : 0 );
    const half = ( points: Pt[], current: () => number ) => this.halfBranches.push( { branch: new FlowBranch( points ), current: current } );
    const bridge = ( points: Pt[], current: () => number ) => this.bridgeBranches.push( { branch: new FlowBranch( points ), current: current } );
    half( [ [ SRC_X, SRC_Y - SRC_R ], [ SRC_X, TOP ], [ CAP_X, TOP ] ], iD );
    half( [ [ CAP_X, BOT ], [ SRC_X, BOT ], [ SRC_X, SRC_Y + SRC_R ] ], iD );
    bridge( [ [ SRC_X, SRC_Y - SRC_R ], [ SRC_X, T[ 1 ] ], T ], signed );
    bridge( [ B, [ SRC_X, B[ 1 ] ], [ SRC_X, SRC_Y + SRC_R ] ], signed );
    bridge( [ T, R ], pair( true ) );
    bridge( [ L, B ], pair( true ) );
    bridge( [ B, R ], pair( false ) );
    bridge( [ L, T ], pair( false ) );
    bridge( [ R, [ 300, R[ 1 ] ], [ 300, TOP ], [ CAP_X, TOP ] ], iD );
    bridge( [ [ CAP_X, BOT ], [ 100, BOT ], [ 100, L[ 1 ] ], L ], iD );
    this.loadBranches.push(
      { branch: new FlowBranch( [ [ CAP_X, TOP ], [ RES_X, TOP ], [ RES_X, BOT ], [ CAP_X, BOT ] ] ), current: iR } );
    const capTop = new FlowBranch( [ [ CAP_X, TOP ], [ CAP_X, capTopY - 3 ] ] );
    const capBottom = new FlowBranch( [ [ CAP_X, capBotY + 3 ], [ CAP_X, BOT ] ] );
    this.loadBranches.push( { branch: capTop, current: iC }, { branch: capBottom, current: iC } );
    this.halfBranches.forEach( b => this.halfLayer.addChild( b.branch ) );
    this.bridgeBranches.forEach( b => this.bridgeLayer.addChild( b.branch ) );
    this.capLayer.addChild( capTop );
    this.capLayer.addChild( capBottom );
    const loadFlow = this.loadBranches[ 0 ].branch;

    const probes = new Node( {
      children: [
        probe( SRC_X, TOP, SemiconductorColors.scopeInput, BsshsSemiconductorStrings.rectifier.probeInputStringProperty ),
        probe( RES_X, TOP, SemiconductorColors.scopeOutput, BsshsSemiconductorStrings.rectifier.probeOutputStringProperty )
      ]
    } );

    this.children = [ this.halfLayer, this.bridgeLayer, loadRails, this.capLayer, resistor, loadFlow, source, sourceLabel,
      capLabel, resLabel, probes ];

    Multilink.multilink( [ model.circuitProperty, model.capacitorConnectedProperty ], ( circuit, hasC ) => {
      this.halfLayer.visible = circuit === 'halfWave';
      this.bridgeLayer.visible = circuit === 'bridge';
      this.capLayer.visible = hasC;
      capLabel.visible = hasC;
      probes.children[ 0 ].y = circuit === 'halfWave' ? 0 : T[ 1 ] - TOP;
    } );
    Multilink.multilink( [ model.loadResistanceProperty, BsshsSemiconductorStrings.units.ohmsStringProperty ], ( r, pattern ) => {
      resLabel.string = `R = ${StringUtils.fillIn( pattern, { value: formatFixed( r, 0 ) } )}`;
      resLabel.left = RES_X + 16;
      resLabel.centerY = ( TOP + BOT ) / 2;
    } );
    Multilink.multilink( [ model.capacitanceProperty, BsshsSemiconductorStrings.units.microfaradsStringProperty ], ( c, pattern ) => {
      capLabel.string = `C = ${StringUtils.fillIn( pattern, { value: formatNumber( c, 3 ) } )}`;
      capLabel.right = CAP_X - 26;
      capLabel.top = ( TOP + BOT ) / 2 + PLATE_GAP / 2 + 6;
    } );
    this.step( 0 );
  }

  public step( dt: number ): void {
    const t = this.model.timeProperty.value;
    this.vIn = this.model.inputVoltageAt( t );
    this.vOut = this.model.outputVoltageAt( t );
    this.iD = this.model.diodeCurrentAt( t );
    const on = this.iD > 1e-7;
    this.halfDiode.setConducting( on );
    this.bridgeDiodes.forEach( d => d.diode.setConducting( on && ( this.vIn >= 0 ) === d.positiveHalf ) );
    const active = this.model.circuitProperty.value === 'halfWave' ? this.halfBranches : this.bridgeBranches;
    active.forEach( b => b.branch.update( b.current(), dt ) );
    this.loadBranches.forEach( b => b.branch.update( b.current(), dt ) );
  }
}

bsshsSemiconductor.register( 'RectifierCircuitNode', RectifierCircuitNode );
