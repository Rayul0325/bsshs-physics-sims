// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Photocurrent–voltage graph for the present light and metal, with a dot at the present voltage. The curve is the
 * model's I(V) over the whole voltage range; the vertical scale is fixed (the largest possible current), so a brighter
 * light visibly raises the saturation current while the cutoff stays put. When "show K_max, V₀" is on, a dashed line
 * marks −V₀.
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import Range from '../../../dot/js/Range.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import Vector2 from '../../../dot/js/Vector2.js';
import Shape from '../../../kite/js/Shape.js';
import AxisLine from '../../../bamboo/js/AxisLine.js';
import ChartRectangle from '../../../bamboo/js/ChartRectangle.js';
import ChartTransform from '../../../bamboo/js/ChartTransform.js';
import GridLineSet from '../../../bamboo/js/GridLineSet.js';
import LinePlot from '../../../bamboo/js/LinePlot.js';
import TickLabelSet from '../../../bamboo/js/TickLabelSet.js';
import Orientation from '../../../phet-core/js/Orientation.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Panel from '../../../sun/js/Panel.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';
import BsshsPhotoelectricStrings from '../BsshsPhotoelectricStrings.js';
import BsshsPhotoelectricModel from '../model/BsshsPhotoelectricModel.js';
import PhotoelectricViewConstants from './PhotoelectricViewConstants.js';

const C = PhotoelectricViewConstants;
const SAMPLES = 400;
const CURRENT_MAX = 1.8; // μA, a little above the largest photocurrent (1.60 μA)

export default class CurrentVoltageChartNode extends Panel {

  public constructor( model: BsshsPhotoelectricModel, showStoppingVoltageProperty: BooleanProperty, chartWidth: number, chartHeight: number ) {
    const voltageRange = BsshsPhotoelectricModel.VOLTAGE_RANGE;
    const chartTransform = new ChartTransform( {
      viewWidth: chartWidth,
      viewHeight: chartHeight,
      modelXRange: voltageRange,
      modelYRange: new Range( -0.06, CURRENT_MAX ) // a little below 0, so the zero-current line stays visible
    } );
    const background = new ChartRectangle( chartTransform, { fill: C.CARD_FILL, stroke: C.GLASS_STROKE } );
    const gridX = new GridLineSet( chartTransform, Orientation.HORIZONTAL, 2, { stroke: C.GRID_STROKE, lineWidth: 0.5 } );
    const gridY = new GridLineSet( chartTransform, Orientation.VERTICAL, 0.5, { stroke: C.GRID_STROKE, lineWidth: 0.5 } );
    const xAxis = new AxisLine( chartTransform, Orientation.HORIZONTAL, { stroke: C.AXIS_STROKE, lineWidth: 1 } );
    const yAxis = new AxisLine( chartTransform, Orientation.VERTICAL, { stroke: C.AXIS_STROKE, lineWidth: 1 } );
    const xLabels = new TickLabelSet( chartTransform, Orientation.HORIZONTAL, 2, {
      edge: 'min',
      createLabel: v => new Text( toFixed( v, 0 ), { font: C.SMALL_FONT } )
    } );
    const yLabels = new TickLabelSet( chartTransform, Orientation.VERTICAL, 0.5, {
      edge: 'min',
      createLabel: v => new Text( toFixed( v, 1 ), { font: C.SMALL_FONT } )
    } );

    const curve = new LinePlot( chartTransform, [], { stroke: C.ELECTRON_COLOR, lineWidth: 2.5 } );
    const marker = new Circle( 6, { fill: C.MARKER_FILL, stroke: C.CARD_FILL, lineWidth: 1.5 } );
    const cutoffLine = new Line( 0, 0, 0, chartHeight, { stroke: C.CUTOFF_STROKE, lineDash: [ 5, 4 ], lineWidth: 1.5 } );

    Multilink.multilink( [ model.saturationCurrentProperty, model.stoppingVoltageProperty ], () => {
      const data: Vector2[] = [];
      for ( let i = 0; i <= SAMPLES; i++ ) {
        const v = voltageRange.min + voltageRange.getLength() * i / SAMPLES;
        data.push( new Vector2( v, model.photocurrentAt( v ) ) );
      }
      // Put the exact cutoff point in, so the corner at −V₀ is sharp.
      const v0 = model.stoppingVoltageProperty.value;
      if ( v0 !== null && v0 < -voltageRange.min ) {
        data.push( new Vector2( -v0, 0 ) );
        data.sort( ( a, b ) => a.x - b.x );
      }
      curve.setDataSet( data );
    } );
    Multilink.multilink( [ model.photocurrentProperty, model.voltageProperty ], ( current, voltage ) => {
      marker.center = chartTransform.modelToViewXY( voltage, Math.min( current, CURRENT_MAX ) );
    } );
    Multilink.multilink( [ model.stoppingVoltageProperty, showStoppingVoltageProperty ], ( v0, show ) => {
      cutoffLine.visible = show && v0 !== null && v0 <= -voltageRange.min;
      if ( v0 !== null ) {
        cutoffLine.x1 = cutoffLine.x2 = chartTransform.modelToViewX( -v0 );
      }
    } );

    const plotArea = new Node( {
      children: [ background, gridX, gridY, xAxis, yAxis, cutoffLine, curve, marker ],
      clipArea: Shape.bounds( background.bounds.dilated( 8 ) )
    } );
    const chart = new Node( { children: [ plotArea, xLabels, yLabels ] } );

    const title = new Text( BsshsPhotoelectricStrings.graphTitleStringProperty, { font: C.TITLE_FONT, maxWidth: chartWidth } );
    const xTitle = new Text( BsshsPhotoelectricStrings.graphVoltageAxisStringProperty, { font: C.SMALL_FONT, maxWidth: 120 } );
    const yTitle = new Text( BsshsPhotoelectricStrings.graphCurrentAxisStringProperty, { font: C.SMALL_FONT, maxWidth: chartHeight, rotation: -Math.PI / 2 } );

    // Fixed frame: title on top, the rotated y title at the far left, tick labels just outside the plot.
    const chartX = 56;
    const chartY = 30;
    chart.translation = new Vector2( chartX, chartY );
    title.boundsProperty.link( () => { title.left = 0; title.top = 0; } );
    yTitle.boundsProperty.link( () => { yTitle.left = 0; yTitle.centerY = chartY + chartHeight / 2; } );
    xTitle.boundsProperty.link( () => { xTitle.right = chartX + chartWidth; xTitle.top = chartY + chartHeight + 22; } );
    const content = new Node( { children: [ title, chart, xTitle, yTitle ] } );

    super( content, { xMargin: 12, yMargin: 10 } );
  }
}

bsshsPhotoelectric.register( 'CurrentVoltageChartNode', CurrentVoltageChartNode );
