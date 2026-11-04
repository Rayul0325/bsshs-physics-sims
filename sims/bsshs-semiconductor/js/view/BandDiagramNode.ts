// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Energy-band diagram of the junction on the same horizontal scale as JunctionCrystalNode (so the bent region
 * lines up with the depletion layer above it), and a fixed vertical scale (PX_PER_EV) so the barrier visibly
 * grows under reverse bias and shrinks under forward bias.
 *
 * Energies are electron energies. The p side is anchored: its conduction-band edge E_c sits at a fixed height,
 * the valence-band edge E_v is E_g below, and the Fermi level E_F lies (kT)ln(N_A/n_i) below midgap. The n side
 * is lower by the barrier e(V_bi − V_D). Inside the depletion layer the band edge follows the abrupt-junction
 * parabolas, with the drop shared in proportion to x_p and x_n (from N_A x_p = N_D x_n).
 */

import Multilink from '../../../axon/js/Multilink.js';
import Shape from '../../../kite/js/Shape.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import ArrowNode from '../../../scenery-phet/js/ArrowNode.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Text from '../../../scenery/js/nodes/Text.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import BsshsSemiconductorStrings from '../BsshsSemiconductorStrings.js';
import JunctionModel from '../model/JunctionModel.js';
import { BAR_LEFT, BAR_RIGHT, JUNCTION_X, PX_PER_UM } from './JunctionCrystalNode.js';
import SemiconductorColors from './SemiconductorColors.js';
import { formatNumber, LABEL_FONT, SMALL_FONT } from './ViewUtils.js';

export const BAND_HEIGHT = 300;
const PX_PER_EV = 32;
const TOP_EC = 46;          // y of the p-side conduction-band edge
const BAND_THICKNESS = 20;  // drawn depth of the filled bands
const SAMPLES = 241;
const CARRIERS = 9;


export default class BandDiagramNode extends Node {

  private readonly model: JunctionModel;
  private readonly electrons: Circle[] = [];
  private readonly holes: Circle[] = [];
  private nBandY = 0;   // y of E_c on the n side
  private pValenceY = 0; // y of E_v on the p side
  private time = 0;

  public constructor( model: JunctionModel ) {
    super();
    this.model = model;

    const cbFill = new Path( null, { fill: SemiconductorColors.conductionBandFill } );
    const vbFill = new Path( null, { fill: SemiconductorColors.valenceBandFill } );
    const ecPath = new Path( null, { stroke: SemiconductorColors.bandEdge, lineWidth: 2.5 } );
    const evPath = new Path( null, { stroke: SemiconductorColors.bandEdge, lineWidth: 2.5 } );
    const fermi = new Path( null, { stroke: SemiconductorColors.fermiLevel, lineWidth: 1.5, lineDash: [ 6, 4 ] } );
    const reference = new Line( 0, 0, 1, 0, { stroke: SemiconductorColors.muted, lineWidth: 1, lineDash: [ 2, 3 ] } );

    const gapArrow = new ArrowNode( 0, 0, 0, 1, { doubleHead: true, headHeight: 6, headWidth: 8, tailWidth: 1.5 } );
    const gapLabel = new RichText( '', { font: SMALL_FONT, maxWidth: 140 } );
    const barrierArrow = new ArrowNode( 0, 0, 0, 1, { doubleHead: true, headHeight: 6, headWidth: 8, tailWidth: 1.5,
      fill: SemiconductorColors.hole, stroke: null } );
    const barrierLabel = new RichText( '', { font: SMALL_FONT, maxWidth: 170 } );
    const cbLabel = new Text( BsshsSemiconductorStrings.junction.conductionBandStringProperty, { font: SMALL_FONT, maxWidth: 90 } );
    const vbLabel = new Text( BsshsSemiconductorStrings.junction.valenceBandStringProperty, { font: SMALL_FONT, maxWidth: 90 } );
    const fermiLabel = new Text( BsshsSemiconductorStrings.junction.fermiLevelStringProperty, { font: SMALL_FONT, maxWidth: 90 } );
    const pLabel = new Text( BsshsSemiconductorStrings.junction.pTypeStringProperty, { font: LABEL_FONT } );
    const nLabel = new Text( BsshsSemiconductorStrings.junction.nTypeStringProperty, { font: LABEL_FONT } );

    // energy axis
    const axis = new ArrowNode( 14, BAND_HEIGHT - 10, 14, 6, { headHeight: 8, headWidth: 9, tailWidth: 1.5 } );
    const axisLabel = new Text( BsshsSemiconductorStrings.junction.electronEnergyStringProperty, {
      font: SMALL_FONT, rotation: -Math.PI / 2, maxWidth: 160, centerX: 28, centerY: BAND_HEIGHT / 2
    } );

    const carrierLayer = new Node();
    for ( let k = 0; k < CARRIERS; k++ ) {
      const e = new Circle( 4, { fill: SemiconductorColors.electron } );
      const h = new Circle( 4, { fill: SemiconductorColors.idle, stroke: SemiconductorColors.hole, lineWidth: 2 } );
      this.electrons.push( e );
      this.holes.push( h );
      carrierLayer.addChild( e );
      carrierLayer.addChild( h );
    }

    const content = new Node( {
      children: [ cbFill, vbFill, reference, ecPath, evPath, fermi, carrierLayer, gapArrow, gapLabel, barrierArrow,
        barrierLabel, cbLabel, vbLabel, fermiLabel, pLabel, nLabel ],
      clipArea: Shape.rect( BAR_LEFT - 12, 0, BAR_RIGHT - BAR_LEFT + 24, BAND_HEIGHT )
    } );
    this.children = [ content, axis, axisLabel ];

    Multilink.multilink( [ model.bandGapProperty, model.barrierHeightProperty, model.depletionWidthPProperty,
        model.depletionWidthNProperty, model.pFermiDepthProperty, model.nFermiHeightProperty,
        BsshsSemiconductorStrings.units.electronVoltsStringProperty, BsshsSemiconductorStrings.junction.barrierStringProperty ],
      ( eg, barrier, xpM, xnM, pDepth, nHeight, evPattern, barrierTitle ) => {
        const xp = xpM * 1e6;
        const xn = xnM * 1e6;
        const w = xp + xn;
        // drop of the electron energy (eV) at position x (μm) relative to the neutral p side
        const drop = ( x: number ) => {
          if ( w <= 0 ) { return x < 0 ? 0 : barrier; }
          if ( x <= -xp ) { return 0; }
          if ( x >= xn ) { return barrier; }
          const bp = barrier * xp / w;
          const bn = barrier * xn / w;
          return x <= 0 ? bp * Math.pow( ( x + xp ) / xp, 2 ) : barrier - bn * Math.pow( ( xn - x ) / xn, 2 );
        };
        const toX = ( um: number ) => JUNCTION_X + um * PX_PER_UM;
        const yOf = ( energyBelowTop: number ) => TOP_EC + energyBelowTop * PX_PER_EV;
        const halfSpan = ( BAR_RIGHT - BAR_LEFT ) / 2 / PX_PER_UM + 0.2;
        const ec = new Shape();
        const ev = new Shape();
        const cb = new Shape();
        const vb = new Shape();
        const xs: number[] = [];
        for ( let i = 0; i < SAMPLES; i++ ) { xs.push( -halfSpan + 2 * halfSpan * i / ( SAMPLES - 1 ) ); }
        // Include the exact depletion edges so the kinks are sharp.
        xs.push( -xp, xn, 0 );
        xs.sort( ( a, b ) => a - b );
        xs.forEach( ( x, i ) => {
          const d = drop( x );
          const px = toX( x );
          if ( i === 0 ) { ec.moveTo( px, yOf( d ) ); ev.moveTo( px, yOf( d + eg ) ); }
          else { ec.lineTo( px, yOf( d ) ); ev.lineTo( px, yOf( d + eg ) ); }
        } );
        // filled bands: from the edge away from the gap by BAND_THICKNESS
        xs.forEach( ( x, i ) => { const p = [ toX( x ), yOf( drop( x ) ) ]; if ( i === 0 ) { cb.moveTo( p[ 0 ], p[ 1 ] ); } else { cb.lineTo( p[ 0 ], p[ 1 ] ); } } );
        for ( let i = xs.length - 1; i >= 0; i-- ) { cb.lineTo( toX( xs[ i ] ), yOf( drop( xs[ i ] ) ) - BAND_THICKNESS ); }
        cb.close();
        xs.forEach( ( x, i ) => { const p = [ toX( x ), yOf( drop( x ) + eg ) ]; if ( i === 0 ) { vb.moveTo( p[ 0 ], p[ 1 ] ); } else { vb.lineTo( p[ 0 ], p[ 1 ] ); } } );
        for ( let i = xs.length - 1; i >= 0; i-- ) { vb.lineTo( toX( xs[ i ] ), yOf( drop( xs[ i ] ) + eg ) + BAND_THICKNESS ); }
        vb.close();
        ecPath.shape = ec;
        evPath.shape = ev;
        cbFill.shape = cb;
        vbFill.shape = vb;

        // Fermi levels: midgap is eg/2 below E_c; E_F,p is pDepth below midgap, E_F,n is nHeight above n-side midgap.
        const yFp = yOf( eg / 2 + pDepth );
        const yFn = yOf( barrier + eg / 2 - nHeight );
        const leftEdge = toX( -xp );
        const rightEdge = toX( xn );
        fermi.shape = new Shape().moveTo( BAR_LEFT - 10, yFp ).lineTo( leftEdge, yFp ).moveTo( rightEdge, yFn ).lineTo( BAR_RIGHT + 10, yFn );
        fermiLabel.right = BAR_RIGHT - 4;
        fermiLabel.top = yFn + 3;

        // labels anchored on the p side (fixed height)
        cbLabel.left = BAR_LEFT + 4;
        cbLabel.centerY = TOP_EC - BAND_THICKNESS / 2;
        vbLabel.left = BAR_LEFT + 4;
        vbLabel.centerY = yOf( eg ) + BAND_THICKNESS / 2;
        pLabel.left = BAR_LEFT + 4;
        pLabel.top = yOf( eg ) + BAND_THICKNESS + 6;
        nLabel.right = BAR_RIGHT - 4;
        nLabel.top = Math.min( BAND_HEIGHT - nLabel.height - 2, yOf( barrier + eg ) + BAND_THICKNESS + 6 );

        // band gap arrow on the p side
        const gx = BAR_LEFT + 120;
        gapArrow.setTailAndTip( gx, TOP_EC, gx, yOf( eg ) );
        gapLabel.string = `E<sub>g</sub> = ${StringUtils.fillIn( evPattern, { value: formatNumber( eg ) } )}`;
        gapLabel.left = gx + 6;
        gapLabel.centerY = ( TOP_EC + yOf( eg ) ) / 2;

        // barrier: from the n-side E_c up to the p-side E_c level
        const bx = Math.min( BAR_RIGHT - 30, rightEdge + 40 );
        reference.setLine( BAR_LEFT, TOP_EC, bx + 8, TOP_EC );
        barrierArrow.visible = barrier * PX_PER_EV > 12;
        if ( barrierArrow.visible ) { barrierArrow.setTailAndTip( bx, yOf( barrier ), bx, TOP_EC ); }
        barrierLabel.string = `${barrierTitle} e(V<sub>bi</sub> − V<sub>D</sub>) = ${StringUtils.fillIn( evPattern, { value: formatNumber( barrier ) } )}`;
        barrierLabel.right = bx - 8;
        barrierLabel.bottom = TOP_EC - BAND_THICKNESS - 4;
        if ( barrierLabel.left < BAR_LEFT + 190 ) { barrierLabel.left = BAR_LEFT + 190; }

        this.nBandY = yOf( barrier );
        this.pValenceY = yOf( eg );
        this.placeCarriers();
      } );
  }

  /** Electrons ride just above E_c in the neutral n side, holes just below E_v in the neutral p side. */
  private placeCarriers(): void {
    const xn = this.model.depletionWidthNProperty.value * 1e6 * PX_PER_UM;
    const xp = this.model.depletionWidthPProperty.value * 1e6 * PX_PER_UM;
    const nStart = Math.min( BAR_RIGHT - 20, JUNCTION_X + xn + 14 );
    const pEnd = Math.max( BAR_LEFT + 20, JUNCTION_X - xp - 14 );
    for ( let k = 0; k < CARRIERS; k++ ) {
      const u = ( k + 0.5 ) / CARRIERS;
      const jiggle = 3 * Math.sin( 2.7 * this.time + k * 1.9 );
      const ex = nStart + u * ( BAR_RIGHT - 10 - nStart ) + jiggle;
      const hx = BAR_LEFT + 10 + u * ( pEnd - BAR_LEFT - 10 ) - jiggle;
      this.electrons[ k ].visible = ex < BAR_RIGHT - 4;
      this.holes[ k ].visible = hx > BAR_LEFT + 80;
      this.electrons[ k ].setTranslation( ex, this.nBandY - 6 - 3 * ( k % 2 ) );
      this.holes[ k ].setTranslation( hx, this.pValenceY + 6 + 3 * ( k % 2 ) );
    }
  }

  public step( dt: number ): void {
    this.time += dt;
    this.placeCarriers();
  }
}

bsshsSemiconductor.register( 'BandDiagramNode', BandDiagramNode );
