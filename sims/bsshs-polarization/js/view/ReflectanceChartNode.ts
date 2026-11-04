// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * A live chart of the Fresnel reflectances Rₛ and Rₚ against the incidence angle (0–90°) for the current n₂, with a
 * marker at the current θ₁ and a dashed line at Brewster's angle (where the Rₚ curve touches zero).
 */

import Multilink from '../../../axon/js/Multilink.js';
import Shape from '../../../kite/js/Shape.js';
import PhetColorScheme from '../../../scenery-phet/js/PhetColorScheme.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Path from '../../../scenery/js/nodes/Path.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Color from '../../../scenery/js/util/Color.js';
import bsshsPolarization from '../bsshsPolarization.js';
import BsshsPolarizationStrings from '../BsshsPolarizationStrings.js';
import ReflectionModel from '../model/ReflectionModel.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';

const C = PolarizationViewConstants;
const PLOT_WIDTH = 420;
const PLOT_HEIGHT = 120;
const S_COLOR = PhetColorScheme.RED_COLORBLIND;
const P_COLOR = Color.BLUE;

export default class ReflectanceChartNode extends Node {

  public constructor( model: ReflectionModel ) {
    super();

    const x = ( theta: number ) => theta / 90 * PLOT_WIDTH;
    const y = ( r: number ) => PLOT_HEIGHT * ( 1 - r );

    const background = new Rectangle( 0, 0, PLOT_WIDTH, PLOT_HEIGHT, { fill: Color.WHITE, stroke: Color.GRAY } );
    const grid = new Shape();
    [ 30, 60 ].forEach( t => grid.moveTo( x( t ), 0 ).lineTo( x( t ), PLOT_HEIGHT ) );
    grid.moveTo( 0, y( 0.5 ) ).lineTo( PLOT_WIDTH, y( 0.5 ) );
    const gridPath = new Path( grid, { stroke: Color.LIGHT_GRAY, lineWidth: 1 } );

    const tickLabels: Node[] = [];
    [ 0, 30, 60, 90 ].forEach( t => tickLabels.push( new Text( `${t}`, { font: C.DRAWING_SMALL_FONT, centerX: x( t ), top: PLOT_HEIGHT + 3 } ) ) );
    [ 0, 0.5, 1 ].forEach( r => tickLabels.push( new Text( `${r}`, { font: C.DRAWING_SMALL_FONT, right: -5, centerY: y( r ) } ) ) );
    const axisLabel = new Text( BsshsPolarizationStrings.chartAxisStringProperty, { font: C.DRAWING_SMALL_FONT, maxWidth: 140 } );
    axisLabel.right = PLOT_WIDTH;
    axisLabel.top = PLOT_HEIGHT + 20;

    const sCurve = new Path( null, { stroke: S_COLOR, lineWidth: 2.5 } );
    const pCurve = new Path( null, { stroke: P_COLOR, lineWidth: 2.5 } );
    const brewsterLine = new Line( 0, 0, 0, PLOT_HEIGHT, { stroke: Color.DARK_GRAY, lineWidth: 1.5, lineDash: [ 5, 4 ] } );
    const brewsterLabel = new Text( 'θ_B', { font: C.DRAWING_SMALL_FONT, bottom: -2 } );
    const marker = new Line( 0, 0, 0, PLOT_HEIGHT, { stroke: Color.BLACK, lineWidth: 1.5 } );
    const sDot = new Circle( 5, { fill: S_COLOR } );
    const pDot = new Circle( 5, { fill: P_COLOR } );

    const title = new Text( BsshsPolarizationStrings.chartTitleStringProperty, { font: C.TITLE_FONT, maxWidth: 200 } );
    const legendItem = ( color: Color, label: Text ) => new HBox( { spacing: 5, children: [ new Line( 0, 0, 22, 0, { stroke: color, lineWidth: 3 } ), label ] } );
    const legend = new HBox( {
      spacing: 14,
      children: [
        legendItem( S_COLOR, new Text( BsshsPolarizationStrings.legendSStringProperty, { font: C.DRAWING_SMALL_FONT, maxWidth: 110 } ) ),
        legendItem( P_COLOR, new Text( BsshsPolarizationStrings.legendPStringProperty, { font: C.DRAWING_SMALL_FONT, maxWidth: 110 } ) )
      ]
    } );
    const header = new HBox( { spacing: 18, children: [ title, legend ] } );
    header.left = 0;
    header.bottom = -18;

    this.children = [ background, gridPath, ...tickLabels, axisLabel, brewsterLine, brewsterLabel, sCurve, pCurve, marker, sDot, pDot, header ];

    model.refractiveIndex2Property.link( n2 => {
      const s = new Shape();
      const p = new Shape();
      for ( let i = 0; i <= 180; i++ ) {
        const theta = Math.min( i * 0.5, 89.99 );
        const R = ReflectionModel.reflectancesAt( theta, n2 );
        i === 0 ? s.moveTo( x( theta ), y( R.s ) ) : s.lineTo( x( theta ), y( R.s ) );
        i === 0 ? p.moveTo( x( theta ), y( R.p ) ) : p.lineTo( x( theta ), y( R.p ) );
      }
      // Both curves reach R = 1 at grazing incidence.
      s.lineTo( x( 90 ), y( 1 ) );
      p.lineTo( x( 90 ), y( 1 ) );
      sCurve.shape = s;
      pCurve.shape = p;
    } );
    Multilink.multilink( [ model.incidentAngleProperty, model.reflectanceSProperty, model.reflectancePProperty, model.brewsterAngleProperty ],
      ( theta1, Rs, Rp, thetaB ) => {
        marker.x = x( theta1 );
        sDot.setTranslation( x( theta1 ), y( Rs ) );
        pDot.setTranslation( x( theta1 ), y( Rp ) );
        brewsterLine.x = x( thetaB );
        brewsterLabel.centerX = x( thetaB );
      } );
  }
}

bsshsPolarization.register( 'ReflectanceChartNode', ReflectanceChartNode );
