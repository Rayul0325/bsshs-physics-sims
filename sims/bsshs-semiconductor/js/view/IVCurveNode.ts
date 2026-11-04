// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Current–voltage curve of the diode (Shockley equation with the present material, doping, temperature and
 * ideality factor), the load line of the series circuit I = (V_s − V)/R, and the operating point where they meet.
 * Reverse currents are far too small to see on this scale; their exact value is in the readout.
 */

import Multilink from '../../../axon/js/Multilink.js';
import ChartRectangle from '../../../bamboo/js/ChartRectangle.js';
import ChartTransform from '../../../bamboo/js/ChartTransform.js';
import GridLineSet from '../../../bamboo/js/GridLineSet.js';
import LinePlot from '../../../bamboo/js/LinePlot.js';
import TickLabelSet from '../../../bamboo/js/TickLabelSet.js';
import Range from '../../../dot/js/Range.js';
import Vector2 from '../../../dot/js/Vector2.js';
import Orientation from '../../../phet-core/js/Orientation.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Line from '../../../scenery/js/nodes/Line.js';
import Node from '../../../scenery/js/nodes/Node.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Text from '../../../scenery/js/nodes/Text.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import BsshsSemiconductorStrings from '../BsshsSemiconductorStrings.js';
import JunctionModel from '../model/JunctionModel.js';
import SemiconductorConstants from '../model/SemiconductorConstants.js';
import SemiconductorColors from './SemiconductorColors.js';
import { formatFixed, LABEL_FONT, SMALL_FONT, withMinus } from './ViewUtils.js';

const X_RANGE = new Range( -1, 1.5 ); // V
const Y_RANGE = new Range( -1, 6 );   // mA

export default class IVCurveNode extends Node {

  public constructor( model: JunctionModel, width: number, height: number ) {
    super();
    const left = 62;
    const top = 12;
    const chartWidth = width - left - 16;
    const chartHeight = height - top - 58;
    const transform = new ChartTransform( {
      viewWidth: chartWidth, viewHeight: chartHeight, modelXRange: X_RANGE, modelYRange: Y_RANGE
    } );
    const rect = new ChartRectangle( transform, { fill: SemiconductorColors.idle, stroke: SemiconductorColors.outline } );
    const gridX = new GridLineSet( transform, Orientation.HORIZONTAL, 0.5, { stroke: SemiconductorColors.gridLine } );
    const gridY = new GridLineSet( transform, Orientation.VERTICAL, 1, { stroke: SemiconductorColors.gridLine } );
    const xAxis = new Line( 0, transform.modelToViewY( 0 ), chartWidth, transform.modelToViewY( 0 ), { stroke: SemiconductorColors.outline } );
    const yAxis = new Line( transform.modelToViewX( 0 ), 0, transform.modelToViewX( 0 ), chartHeight, { stroke: SemiconductorColors.outline } );
    const label = ( v: number ) => new Text( withMinus( String( v ) ), { font: SMALL_FONT } );
    const xLabels = new TickLabelSet( transform, Orientation.HORIZONTAL, 0.5, { edge: 'min', createLabel: label } );
    const yLabels = new TickLabelSet( transform, Orientation.VERTICAL, 1, { edge: 'min', createLabel: label } );

    const curve = new LinePlot( transform, [], { stroke: SemiconductorColors.plotCurve, lineWidth: 2.5 } );
    const loadLine = new LinePlot( transform, [], { stroke: SemiconductorColors.muted, lineWidth: 1.5, lineDash: [ 6, 4 ] } );
    const point = new Circle( 6, { fill: SemiconductorColors.operatingPoint, stroke: SemiconductorColors.outline } );
    const pointLabel = new Text( BsshsSemiconductorStrings.junction.operatingPointStringProperty, { font: SMALL_FONT, maxWidth: 80 } );
    const loadLabel = new Text( BsshsSemiconductorStrings.junction.loadLineStringProperty, { font: SMALL_FONT, maxWidth: 80, fill: SemiconductorColors.muted } );
    const offScale = new RichText( '', { font: SMALL_FONT, maxWidth: chartWidth - 20 } );

    const plotArea = new Node( {
      children: [ gridX, gridY, xAxis, yAxis, loadLine, curve, point, pointLabel, loadLabel ],
      clipArea: rect.getShape()
    } );
    const chart = new Node( { x: left, y: top, children: [ rect, plotArea, xLabels, yLabels, offScale ] } );
    const xTitle = new RichText( BsshsSemiconductorStrings.units.voltAxisStringProperty, { font: LABEL_FONT, maxWidth: 260 } );
    const yTitle = new RichText( BsshsSemiconductorStrings.units.currentAxisStringProperty, { font: LABEL_FONT, maxWidth: chartHeight, rotation: -Math.PI / 2 } );
    this.children = [ chart, xTitle, yTitle ];
    xTitle.centerX = left + chartWidth / 2;
    xTitle.top = top + chartHeight + 24;
    yTitle.centerY = top + chartHeight / 2;
    yTitle.left = 2;

    const r = SemiconductorConstants.SERIES_RESISTANCE;
    Multilink.multilink( [ model.saturationCurrentProperty, model.thermalVoltageProperty, model.idealityFactorProperty,
        model.sourceVoltageProperty, model.diodeVoltageProperty, model.diodeCurrentProperty,
        BsshsSemiconductorStrings.junction.offScaleLeftStringProperty, BsshsSemiconductorStrings.junction.offScaleRightStringProperty,
        BsshsSemiconductorStrings.units.voltsStringProperty ],
      ( is, vt, n, vs, vd, id, leftPattern, rightPattern, voltPattern ) => {
        const pts: Vector2[] = [];
        for ( let v = X_RANGE.min; v <= X_RANGE.max + 1e-9; v += 0.0025 ) {
          const iMa = is * Math.expm1( v / ( n * vt ) ) * 1e3;
          if ( iMa > Y_RANGE.max * 2 ) { pts.push( new Vector2( v, Y_RANGE.max * 2 ) ); break; }
          pts.push( new Vector2( v, iMa ) );
        }
        curve.setDataSet( pts );
        // I = (V_s − V)/R in mA, drawn across the visible range
        loadLine.setDataSet( [ new Vector2( X_RANGE.min, ( vs - X_RANGE.min ) / r * 1e3 ), new Vector2( X_RANGE.max, ( vs - X_RANGE.max ) / r * 1e3 ) ] );
        const lx = Math.min( X_RANGE.max - 0.05, Math.max( X_RANGE.min + 0.05, vs - 4.5e-3 * r ) );
        loadLabel.left = transform.modelToViewX( lx ) + 4;
        loadLabel.bottom = transform.modelToViewY( Math.min( Y_RANGE.max - 0.3, Math.max( Y_RANGE.min + 0.6, ( vs - lx ) / r * 1e3 ) ) ) - 2;
        const inX = vd >= X_RANGE.min && vd <= X_RANGE.max;
        const iMa = id * 1e3;
        point.visible = inX;
        pointLabel.visible = inX;
        point.center = transform.modelToViewXY( vd, Math.min( Y_RANGE.max, Math.max( Y_RANGE.min, iMa ) ) );
        pointLabel.left = point.right + 4;
        pointLabel.bottom = point.top;
        offScale.visible = !inX;
        offScale.string = StringUtils.fillIn( vd < X_RANGE.min ? leftPattern : rightPattern, {
          value: StringUtils.fillIn( voltPattern, { value: formatFixed( vd, 2 ) } )
        } );
        offScale.top = 6;
        if ( vd < X_RANGE.min ) { offScale.left = 8; }
        else { offScale.right = chartWidth - 8; }
      } );
  }
}

bsshsSemiconductor.register( 'IVCurveNode', IVCurveNode );
