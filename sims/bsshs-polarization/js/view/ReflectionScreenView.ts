// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * View of the 「반사와 브루스터각」 screen: the ray diagram, the live reflectance chart, the controls (θ₁, n₂ with
 * material presets, polarization of the incoming light), the measurement table and Reset All.
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Range from '../../../dot/js/Range.js';
import ResetAllButton from '../../../scenery-phet/js/buttons/ResetAllButton.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Text from '../../../scenery/js/nodes/Text.js';
import RectangularRadioButtonGroup from '../../../sun/js/buttons/RectangularRadioButtonGroup.js';
import TextPushButton from '../../../sun/js/buttons/TextPushButton.js';
import Panel from '../../../sun/js/Panel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';
import BsshsPolarizationStrings from '../BsshsPolarizationStrings.js';
import ReflectionModel, { type IncidentLight } from '../model/ReflectionModel.js';
import PolarizationControls from './PolarizationControls.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';
import RayDiagramNode from './RayDiagramNode.js';
import ReflectanceChartNode from './ReflectanceChartNode.js';
import ResponsiveScreenView from './ResponsiveScreenView.js';

const C = PolarizationViewConstants;
const TRACK_WIDTH = 200;

// Typical refractive indices (visible light): water, crown glass, diamond.
const PRESETS: { name: typeof BsshsPolarizationStrings.waterStringProperty; n: number; tandemName: string }[] = [
  { name: BsshsPolarizationStrings.waterStringProperty, n: 1.33, tandemName: 'waterButton' },
  { name: BsshsPolarizationStrings.glassStringProperty, n: 1.5, tandemName: 'glassButton' },
  { name: BsshsPolarizationStrings.diamondStringProperty, n: 2.42, tandemName: 'diamondButton' }
];

export default class ReflectionScreenView extends ResponsiveScreenView {

  private readonly diagram: Node;
  private readonly chart: Node;
  private readonly controlPanel: Panel;
  private readonly measurementPanel: Panel;
  private readonly resetAllButton: ResetAllButton;

  public constructor( model: ReflectionModel, tandem: Tandem ) {
    super( { tandem: tandem } );

    this.diagram = new RayDiagramNode( model, tandem.createTandem( 'rayDiagramNode' ) );
    this.chart = new ReflectanceChartNode( model );

    const angleControl = PolarizationControls.numberControl( BsshsPolarizationStrings.incidentAngleStringProperty, model.incidentAngleProperty,
      ReflectionModel.INCIDENT_ANGLE_RANGE, {
        delta: 0.1, decimalPlaces: 1, valuePattern: BsshsPolarizationStrings.anglePatternStringProperty, trackWidth: TRACK_WIDTH
      }, tandem.createTandem( 'incidentAngleControl' ) );
    const indexControl = PolarizationControls.numberControl( BsshsPolarizationStrings.refractiveIndex2StringProperty, model.refractiveIndex2Property,
      ReflectionModel.INDEX_RANGE, {
        delta: 0.01, decimalPlaces: 2, trackWidth: TRACK_WIDTH
      }, tandem.createTandem( 'refractiveIndex2Control' ) );
    const presetButtons = new HBox( {
      spacing: 14,
      children: PRESETS.map( preset => new TextPushButton( preset.name, {
        font: C.FONT,
        maxTextWidth: 80,
        xMargin: 18,
        yMargin: 10,
        touchAreaXDilation: 7,
        touchAreaYDilation: 14,
        listener: () => { model.refractiveIndex2Property.value = preset.n; },
        tandem: tandem.createTandem( preset.tandemName )
      } ) )
    } );
    const lightRadio = new RectangularRadioButtonGroup<IncidentLight>( model.lightTypeProperty, [
      { value: 'unpolarized', createNode: () => new Text( BsshsPolarizationStrings.lightUnpolarizedStringProperty, { font: C.FONT, maxWidth: 90 } ), tandemName: 'unpolarizedRadioButton' },
      { value: 's', createNode: () => new Text( BsshsPolarizationStrings.lightSStringProperty, { font: C.FONT, maxWidth: 70 } ), tandemName: 'sRadioButton' },
      { value: 'p', createNode: () => new Text( BsshsPolarizationStrings.lightPStringProperty, { font: C.FONT, maxWidth: 70 } ), tandemName: 'pRadioButton' }
    ], {
      orientation: 'horizontal',
      spacing: 8,
      touchAreaYDilation: 16,
      radioButtonOptions: { xMargin: 10, yMargin: 12 },
      tandem: tandem.createTandem( 'lightRadioButtonGroup' )
    } );
    this.controlPanel = new Panel( new VBox( {
      spacing: C.SPACING,
      align: 'left',
      children: [
        angleControl,
        indexControl,
        presetButtons,
        new Text( BsshsPolarizationStrings.incidentLightStringProperty, { font: C.TITLE_FONT, maxWidth: 260 } ),
        lightRadio,
        new Text( BsshsPolarizationStrings.markerLegendStringProperty, { font: C.SMALL_FONT, maxWidth: 290 } )
      ]
    } ), { xMargin: 12, yMargin: 10 } );

    this.measurementPanel = new Panel( PolarizationControls.readoutTable( BsshsPolarizationStrings.measurementsStringProperty, [
      { label: BsshsPolarizationStrings.refractionAngleStringProperty, property: model.refractionAngleProperty, range: new Range( 0, 90 ), decimalPlaces: 2, valuePattern: BsshsPolarizationStrings.anglePatternStringProperty },
      { label: BsshsPolarizationStrings.reflectanceSStringProperty, property: model.reflectanceSProperty, range: new Range( 0, 1 ), decimalPlaces: 4 },
      { label: BsshsPolarizationStrings.reflectancePStringProperty, property: model.reflectancePProperty, range: new Range( 0, 1 ), decimalPlaces: 4 },
      { label: BsshsPolarizationStrings.reflectanceStringProperty, property: model.reflectanceProperty, range: new Range( 0, 1 ), decimalPlaces: 4 },
      { label: BsshsPolarizationStrings.brewsterAngleStringProperty, property: model.brewsterAngleProperty, range: new Range( 0, 90 ), decimalPlaces: 2, valuePattern: BsshsPolarizationStrings.anglePatternStringProperty },
      { label: BsshsPolarizationStrings.raysAngleStringProperty, property: model.raysAngleProperty, range: new Range( 0, 180 ), decimalPlaces: 2, valuePattern: BsshsPolarizationStrings.anglePatternStringProperty }
    ] ), { xMargin: 12, yMargin: 10 } );

    this.resetAllButton = new ResetAllButton( {
      listener: () => {
        this.interruptSubtreeInput();
        model.reset();
      },
      touchAreaDilation: 22,
      tandem: tandem.createTandem( 'resetAllButton' )
    } );

    this.children = [ this.diagram, this.chart, this.controlPanel, this.measurementPanel, this.resetAllButton ];
    this.arrangeInitial();
  }

  protected arrange( portrait: boolean ): Bounds2 {
    const nodes: Node[] = [ this.diagram, this.chart, this.controlPanel, this.measurementPanel ];
    nodes.forEach( n => n.setScaleMagnitude( 1 ) );
    if ( !portrait ) {
      const lb = this.layoutBounds;
      const columnWidth = Math.max( this.controlPanel.width, this.measurementPanel.width );
      const columnLeft = lb.maxX - C.RIGHT_MARGIN - columnWidth;
      this.controlPanel.left = columnLeft;
      this.controlPanel.top = lb.minY + C.MARGIN;
      this.measurementPanel.left = columnLeft;
      this.measurementPanel.top = this.controlPanel.bottom + C.SPACING;
      const leftWidth = columnLeft - lb.minX - 2 * C.MARGIN;
      const chartHeight = this.chart.height;
      const diagramScale = Math.min( leftWidth / this.diagram.width,
        ( lb.height - 2 * C.MARGIN - chartHeight - 3 * C.SPACING ) / this.diagram.height );
      this.diagram.setScaleMagnitude( diagramScale );
      this.diagram.left = lb.minX + C.MARGIN;
      this.diagram.top = lb.minY + C.MARGIN;
      this.chart.left = this.diagram.left + 30;
      this.chart.bottom = lb.maxY - C.MARGIN;
      this.resetAllButton.right = lb.maxX - C.RIGHT_MARGIN;
      this.resetAllButton.bottom = lb.maxY - C.MARGIN;
      return lb;
    }
    const W = C.PORTRAIT_WIDTH;
    const inner = W - 2 * C.MARGIN;
    let y = C.PORTRAIT_TOP_BAND;
    this.diagram.setScaleMagnitude( inner / this.diagram.width );
    this.diagram.centerX = W / 2;
    this.diagram.top = y;
    y = this.diagram.bottom + C.SPACING;
    this.chart.setScaleMagnitude( Math.min( 1, inner / this.chart.width ) );
    this.chart.centerX = W / 2;
    this.chart.top = y;
    y = this.chart.bottom + C.SPACING;
    for ( const panel of [ this.controlPanel, this.measurementPanel ] ) {
      panel.setScaleMagnitude( Math.min( 1.3, inner / panel.width ) );
      panel.centerX = W / 2;
      panel.top = y;
      y = panel.bottom + C.SPACING;
    }
    this.resetAllButton.right = W - C.MARGIN;
    this.resetAllButton.top = y;
    return C.portraitBounds( this.resetAllButton.bottom + C.MARGIN );
  }
}

bsshsPolarization.register( 'ReflectionScreenView', ReflectionScreenView );
