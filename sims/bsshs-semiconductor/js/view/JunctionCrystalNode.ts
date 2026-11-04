// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The p-n junction drawn to scale (80 view units per μm, ±3 μm around the metallurgical junction), wired to a
 * DC source and the protective resistor.
 *
 * Each lattice site holds one dopant: an acceptor on the p side, a donor on the n side. Outside the depletion
 * layer the site shows its majority carrier (a hole or an electron, jiggling thermally); inside it the carrier is
 * gone and the fixed ionized dopant (− or +) shows, so the layer's edges move with the model's x_p and x_n.
 * Under forward bias carriers are injected across the layer and fade out (recombination); electrons in the wire
 * drift with a speed that grows with the current (and stand still for the tiny reverse current).
 */

import Multilink from '../../../axon/js/Multilink.js';
import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import Shape from '../../../kite/js/Shape.js';
import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Text from '../../../scenery/js/nodes/Text.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import BsshsSemiconductorStrings from '../BsshsSemiconductorStrings.js';
import JunctionModel from '../model/JunctionModel.js';
import SemiconductorColors from './SemiconductorColors.js';
import { formatFixed, formatNumber, LABEL_FONT, SMALL_FONT, TITLE_FONT } from './ViewUtils.js';

export const BAR_LEFT = 40;
export const BAR_RIGHT = 520;
export const JUNCTION_X = ( BAR_LEFT + BAR_RIGHT ) / 2;
export const PX_PER_UM = 80;
const BAR_TOP = 96;
const BAR_BOTTOM = 172;
const WIRE_Y = 30;
const CONTACT_W = 10;
const SITE_DX = 16;
const SITE_DY = 15;
const ROWS = 5;
const JIGGLE = 2.6;
const MAX_INJECTED = 24;


/** Minus and plus glyphs for ions (shared shapes). */
const MINUS_SHAPE = new Shape().moveTo( -3, 0 ).lineTo( 3, 0 );
const PLUS_SHAPE = new Shape().moveTo( -3, 0 ).lineTo( 3, 0 ).moveTo( 0, -3 ).lineTo( 0, 3 );

function ionNode( positive: boolean ): Node {
  return new Node( {
    children: [
      new Circle( 5.5, { stroke: SemiconductorColors.ion, lineWidth: 1 } ),
      new Path( positive ? PLUS_SHAPE : MINUS_SHAPE, { stroke: positive ? SemiconductorColors.electron : SemiconductorColors.hole, lineWidth: 1.6 } )
    ]
  } );
}
function electronNode(): Node { return new Circle( 4.5, { fill: SemiconductorColors.electron } ); }
function holeNode(): Node { return new Circle( 4.5, { fill: SemiconductorColors.idle, stroke: SemiconductorColors.hole, lineWidth: 2 } ); }

type Site = { x: number; y: number; pSide: boolean; carrier: Node; ion: Node; phase1: number; phase2: number };
type Injected = { node: Node; x: number; y: number; dir: number; travelled: number; alive: boolean };

export default class JunctionCrystalNode extends Node {

  private readonly model: JunctionModel;
  private readonly sites: Site[] = [];
  private readonly injected: Injected[] = [];
  private readonly wireDots: Node[] = [];
  private readonly wirePath: { x: number; y: number }[];
  private readonly wireLength: number;
  private wireOffset = 0;
  private time = 0;
  private spawnDebt = 0;

  public constructor( model: JunctionModel ) {
    super();
    this.model = model;

    // --- the circuit: contacts, wire, resistor, DC source
    const leftWireX = BAR_LEFT - CONTACT_W / 2;
    const rightWireX = BAR_RIGHT + CONTACT_W / 2;
    this.wirePath = [
      { x: leftWireX, y: BAR_TOP - 2 }, { x: leftWireX, y: WIRE_Y }, { x: rightWireX, y: WIRE_Y }, { x: rightWireX, y: BAR_TOP - 2 }
    ];
    this.wireLength = ( BAR_TOP - 2 - WIRE_Y ) * 2 + ( rightWireX - leftWireX );
    const wire = new Path( new Shape().moveTo( leftWireX, BAR_TOP ).lineTo( leftWireX, WIRE_Y ).lineTo( rightWireX, WIRE_Y )
      .lineTo( rightWireX, BAR_TOP ), { stroke: SemiconductorColors.wire, lineWidth: 3 } );

    // resistor on the top wire
    const rX = 150;
    const zig = new Shape().moveTo( rX - 34, WIRE_Y );
    for ( let i = 0; i < 6; i++ ) { zig.lineTo( rX - 28 + i * 11.2, WIRE_Y + ( i % 2 === 0 ? -9 : 9 ) ); }
    zig.lineTo( rX + 34, WIRE_Y );
    const resistorGap = new Line( rX - 34, WIRE_Y, rX + 34, WIRE_Y, { stroke: SemiconductorColors.idle, lineWidth: 5 } );
    const resistor = new Path( zig, { stroke: SemiconductorColors.outline, lineWidth: 2.5, lineJoin: 'round' } );
    const resistorLabel = new Text( BsshsSemiconductorStrings.junction.resistorLabelStringProperty, { font: SMALL_FONT, centerX: rX, top: WIRE_Y + 14, maxWidth: 120 } );

    // DC source (battery symbol); the long (+) plate faces the side at the higher potential.
    const bX = 360;
    const batteryGap = new Line( bX - 12, WIRE_Y, bX + 12, WIRE_Y, { stroke: SemiconductorColors.idle, lineWidth: 5 } );
    const longPlate = new Line( 0, -17, 0, 17, { stroke: SemiconductorColors.outline, lineWidth: 3 } );
    const shortPlate = new Line( 0, -9, 0, 9, { stroke: SemiconductorColors.outline, lineWidth: 6 } );
    const plusSign = new Text( '+', { font: TITLE_FONT } );
    const minusSign = new Text( '−', { font: TITLE_FONT } );
    const battery = new Node( { children: [ batteryGap, longPlate, shortPlate, plusSign, minusSign ] } );
    const sourceLabel = new RichText( '', { font: LABEL_FONT, maxWidth: 160 } );

    Multilink.multilink( [ model.sourceVoltageProperty, BsshsSemiconductorStrings.junction.sourceVoltageStringProperty,
      BsshsSemiconductorStrings.units.voltsStringProperty ], ( vs, title, pattern ) => {
      const positiveLeft = vs >= 0;
      const leftX = bX - 6;
      const rightX = bX + 6;
      longPlate.setLine( positiveLeft ? leftX : rightX, WIRE_Y - 17, positiveLeft ? leftX : rightX, WIRE_Y + 17 );
      shortPlate.setLine( positiveLeft ? rightX : leftX, WIRE_Y - 9, positiveLeft ? rightX : leftX, WIRE_Y + 9 );
      plusSign.centerX = positiveLeft ? leftX - 12 : rightX + 12;
      minusSign.centerX = positiveLeft ? rightX + 12 : leftX - 12;
      plusSign.bottom = minusSign.bottom = WIRE_Y - 8;
      plusSign.visible = minusSign.visible = vs !== 0;
      sourceLabel.string = `${title} = ${StringUtils.fillIn( pattern, { value: formatFixed( vs, 2 ) } )}`;
      sourceLabel.centerX = bX;
      sourceLabel.top = WIRE_Y + 20;
    } );

    // --- the crystal
    const pRegion = new Rectangle( BAR_LEFT, BAR_TOP, JUNCTION_X - BAR_LEFT, BAR_BOTTOM - BAR_TOP, { fill: SemiconductorColors.pRegion } );
    const nRegion = new Rectangle( JUNCTION_X, BAR_TOP, BAR_RIGHT - JUNCTION_X, BAR_BOTTOM - BAR_TOP, { fill: SemiconductorColors.nRegion } );
    const depletion = new Rectangle( 0, BAR_TOP, 1, BAR_BOTTOM - BAR_TOP, { fill: SemiconductorColors.depletionRegion } );
    const depletionEdges = new Path( null, { stroke: SemiconductorColors.muted, lineWidth: 1, lineDash: [ 4, 3 ] } );
    const junctionLine = new Line( JUNCTION_X, BAR_TOP, JUNCTION_X, BAR_BOTTOM, { stroke: SemiconductorColors.muted, lineWidth: 1 } );
    const barOutline = new Rectangle( BAR_LEFT, BAR_TOP, BAR_RIGHT - BAR_LEFT, BAR_BOTTOM - BAR_TOP, { stroke: SemiconductorColors.outline, lineWidth: 1.5 } );
    const leftContact = new Rectangle( BAR_LEFT - CONTACT_W, BAR_TOP - 4, CONTACT_W, BAR_BOTTOM - BAR_TOP + 8, { fill: SemiconductorColors.contact } );
    const rightContact = new Rectangle( BAR_RIGHT, BAR_TOP - 4, CONTACT_W, BAR_BOTTOM - BAR_TOP + 8, { fill: SemiconductorColors.contact } );
    const pLabel = new Text( BsshsSemiconductorStrings.junction.pTypeStringProperty, { font: TITLE_FONT, left: BAR_LEFT + 6, bottom: BAR_TOP - 4, maxWidth: 80 } );
    const nLabel = new Text( BsshsSemiconductorStrings.junction.nTypeStringProperty, { font: TITLE_FONT, right: BAR_RIGHT - 6, bottom: BAR_TOP - 4, maxWidth: 80 } );

    const siteLayer = new Node();
    for ( let x = BAR_LEFT + SITE_DX / 2; x < BAR_RIGHT; x += SITE_DX ) {
      if ( Math.abs( x - JUNCTION_X ) < 1 ) { continue; }
      for ( let j = 0; j < ROWS; j++ ) {
        const y = BAR_TOP + 9 + j * SITE_DY;
        const pSide = x < JUNCTION_X;
        const carrier = pSide ? holeNode() : electronNode();
        const ion = ionNode( !pSide );
        ion.setTranslation( x, y );
        carrier.setTranslation( x, y );
        siteLayer.addChild( ion );
        siteLayer.addChild( carrier );
        this.sites.push( { x: x, y: y, pSide: pSide, carrier: carrier, ion: ion, phase1: Math.random() * 6.28, phase2: Math.random() * 6.28 } );
      }
    }
    const injectedLayer = new Node();
    for ( let k = 0; k < MAX_INJECTED; k++ ) {
      const node = k % 2 === 0 ? electronNode() : holeNode();
      node.visible = false;
      injectedLayer.addChild( node );
      this.injected.push( { node: node, x: 0, y: 0, dir: 0, travelled: 0, alive: false } );
    }
    const crystalClip = new Node( {
      children: [ pRegion, nRegion, depletion, depletionEdges, junctionLine, siteLayer, injectedLayer ],
      clipArea: Shape.rect( BAR_LEFT, BAR_TOP, BAR_RIGHT - BAR_LEFT, BAR_BOTTOM - BAR_TOP )
    } );

    // width readout under the bar
    const widthArrow = new ArrowNode( 0, 0, 1, 0, { doubleHead: true, headHeight: 6, headWidth: 8, tailWidth: 1.5 } );
    const widthLabel = new RichText( '', { font: LABEL_FONT, maxWidth: 200 } );
    const depletionLabel = new Text( BsshsSemiconductorStrings.junction.depletionLayerStringProperty, { font: SMALL_FONT, maxWidth: 90 } );

    // scale bar and legend
    const scaleBar = new Node( {
      children: [
        new Line( 0, 0, PX_PER_UM, 0, { stroke: SemiconductorColors.outline, lineWidth: 2 } ),
        new Line( 0, -4, 0, 4, { stroke: SemiconductorColors.outline, lineWidth: 2 } ),
        new Line( PX_PER_UM, -4, PX_PER_UM, 4, { stroke: SemiconductorColors.outline, lineWidth: 2 } ),
        new Text( BsshsSemiconductorStrings.units.oneMicrometreStringProperty, { font: SMALL_FONT, centerX: PX_PER_UM / 2, top: 6 } )
      ],
      left: BAR_LEFT,
      top: BAR_BOTTOM + 34
    } );
    const legendItem = ( icon: Node, label: typeof BsshsSemiconductorStrings.junction.electronLegendStringProperty ) =>
      new HBox( { spacing: 5, children: [ icon, new Text( label, { font: SMALL_FONT, maxWidth: 80 } ) ] } );
    const legend = new HBox( {
      spacing: 14,
      children: [
        legendItem( electronNode(), BsshsSemiconductorStrings.junction.electronLegendStringProperty ),
        legendItem( holeNode(), BsshsSemiconductorStrings.junction.holeLegendStringProperty ),
        legendItem( ionNode( true ), BsshsSemiconductorStrings.junction.donorLegendStringProperty ),
        legendItem( ionNode( false ), BsshsSemiconductorStrings.junction.acceptorLegendStringProperty )
      ],
      right: BAR_RIGHT + CONTACT_W,
      top: BAR_BOTTOM + 36
    } );

    const dotLayer = new Node();
    for ( let k = 0; k * 24 < this.wireLength; k++ ) {
      const dot = new Circle( 3, { fill: SemiconductorColors.electron } );
      dotLayer.addChild( dot );
      this.wireDots.push( dot );
    }

    this.children = [ wire, resistorGap, resistor, resistorLabel, battery, sourceLabel, dotLayer, leftContact, rightContact,
      crystalClip, barOutline, pLabel, nLabel, widthArrow, widthLabel, depletionLabel, scaleBar, legend ];

    const widthText = new DerivedProperty( [ model.depletionWidthProperty, BsshsSemiconductorStrings.units.micrometresStringProperty ],
      ( w, pattern ) => `W = ${StringUtils.fillIn( pattern, { value: formatNumber( w * 1e6 ) } )}` );
    Multilink.multilink( [ model.depletionWidthPProperty, model.depletionWidthNProperty, widthText ], ( xp, xn, text ) => {
      const left = Math.max( BAR_LEFT, JUNCTION_X - xp * 1e6 * PX_PER_UM );
      const right = Math.min( BAR_RIGHT, JUNCTION_X + xn * 1e6 * PX_PER_UM );
      depletion.setRect( left, BAR_TOP, Math.max( 0, right - left ), BAR_BOTTOM - BAR_TOP );
      depletionEdges.shape = right - left > 0.5 ?
                             new Shape().moveTo( left, BAR_TOP ).lineTo( left, BAR_BOTTOM ).moveTo( right, BAR_TOP ).lineTo( right, BAR_BOTTOM ) :
                             null;
      const y = BAR_BOTTOM + 10;
      widthArrow.visible = right - left > 10;
      if ( widthArrow.visible ) { widthArrow.setTailAndTip( left, y, right, y ); }
      widthLabel.string = text;
      widthLabel.centerX = Math.min( BAR_RIGHT - widthLabel.width / 2, Math.max( BAR_LEFT + widthLabel.width / 2, ( left + right ) / 2 ) );
      widthLabel.top = y + 6;
      depletionLabel.centerX = Math.min( BAR_RIGHT - 50, Math.max( BAR_LEFT + 50, ( left + right ) / 2 ) );
      depletionLabel.bottom = BAR_TOP - 4;
      depletionLabel.visible = right - left > 2;
      // Which sites are inside the depletion layer: show the ion there, the carrier elsewhere.
      for ( const s of this.sites ) {
        const inside = s.x >= left && s.x <= right;
        s.ion.visible = inside;
        s.carrier.visible = !inside;
      }
    } );
    this.step( 0 );
  }

  /** Thermal jiggle, injected carriers, and wire electrons. dt in seconds. */
  public step( dt: number ): void {
    this.time += dt;
    const model = this.model;
    const amp = JIGGLE * Math.sqrt( model.temperatureProperty.value / 300 );
    const t = this.time;
    for ( const s of this.sites ) {
      if ( s.carrier.visible ) {
        s.carrier.setTranslation( s.x + amp * Math.sin( 3.1 * t + s.phase1 ), s.y + amp * Math.cos( 2.3 * t + s.phase2 ) );
      }
    }

    // Forward current: inject carriers across the layer (rate grows with log current).
    const iMa = model.diodeCurrentProperty.value * 1e3;
    const xp = model.depletionWidthPProperty.value * 1e6 * PX_PER_UM;
    const xn = model.depletionWidthNProperty.value * 1e6 * PX_PER_UM;
    if ( iMa > 1e-4 ) {
      this.spawnDebt += dt * Math.min( 10, 2.5 * Math.log10( 1 + iMa * 1e3 ) );
      while ( this.spawnDebt >= 1 ) {
        this.spawnDebt -= 1;
        const free = this.injected.find( c => !c.alive );
        if ( !free ) { break; }
        const electron = this.injected.indexOf( free ) % 2 === 0;
        free.alive = true;
        free.travelled = 0;
        free.dir = electron ? -1 : 1;
        free.x = electron ? JUNCTION_X + xn : JUNCTION_X - xp;
        free.y = BAR_TOP + 8 + Math.random() * ( BAR_BOTTOM - BAR_TOP - 16 );
        free.node.visible = true;
      }
    }
    for ( const c of this.injected ) {
      if ( !c.alive ) { continue; }
      const step = 45 * dt;
      c.x += c.dir * step;
      c.travelled += step;
      c.node.opacity = Math.max( 0, 1 - c.travelled / ( 70 + xp + xn ) );
      c.node.setTranslation( c.x, c.y );
      if ( c.node.opacity <= 0 ) { c.alive = false; c.node.visible = false; }
    }

    // Electrons in the wire move against the conventional current (I > 0: p → n inside the diode).
    const speed = Math.sign( iMa ) * Math.min( 70, 28 * Math.log10( 1 + Math.abs( iMa ) * 10 ) );
    this.wireOffset = ( ( this.wireOffset + speed * dt ) % 24 + 24 ) % 24;
    for ( let k = 0; k < this.wireDots.length; k++ ) {
      const d = k * 24 + this.wireOffset;
      const p = this.pointAlongWire( d );
      this.wireDots[ k ].visible = p !== null && Math.abs( iMa ) > 1e-6;
      if ( p ) { this.wireDots[ k ].setTranslation( p.x, p.y ); }
    }
  }

  /** Point at arc length d along the wire from the left contact, or null past its end. */
  private pointAlongWire( d: number ): { x: number; y: number } | null {
    let rest = d;
    for ( let i = 0; i < this.wirePath.length - 1; i++ ) {
      const a = this.wirePath[ i ];
      const b = this.wirePath[ i + 1 ];
      const len = Math.hypot( b.x - a.x, b.y - a.y );
      if ( rest <= len ) { return { x: a.x + ( b.x - a.x ) * rest / len, y: a.y + ( b.y - a.y ) * rest / len }; }
      rest -= len;
    }
    return null;
  }
}

bsshsSemiconductor.register( 'JunctionCrystalNode', JunctionCrystalNode );
