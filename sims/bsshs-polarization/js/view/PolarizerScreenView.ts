// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * View of the 「편광판」 screen: the optical bench, a light-source panel, a panel with the three polarizers (put in or
 * take out with the checkbox, turn with the slider or by dragging the disc), the measurement table and Reset All.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import Bounds2 from '../../../dot/js/Bounds2.js';
import Range from '../../../dot/js/Range.js';
import ResetAllButton from '../../../scenery-phet/js/buttons/ResetAllButton.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Text from '../../../scenery/js/nodes/Text.js';
import RectangularRadioButtonGroup from '../../../sun/js/buttons/RectangularRadioButtonGroup.js';
import Checkbox from '../../../sun/js/Checkbox.js';
import Panel from '../../../sun/js/Panel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';
import BsshsPolarizationStrings from '../BsshsPolarizationStrings.js';
import Polarizer from '../model/Polarizer.js';
import PolarizerModel, { type SourceLight } from '../model/PolarizerModel.js';
import BenchNode from './BenchNode.js';
import PolarizationControls from './PolarizationControls.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';
import ResponsiveScreenView from './ResponsiveScreenView.js';

const C = PolarizationViewConstants;
const TRACK_WIDTH = 190;

export default class PolarizerScreenView extends ResponsiveScreenView {

  private readonly bench: BenchNode;
  private readonly lightPanel: Panel;
  private readonly polarizerPanel: Panel;
  private readonly measurementPanel: Panel;
  private readonly resetAllButton: ResetAllButton;

  public constructor( model: PolarizerModel, tandem: Tandem ) {
    super( { tandem: tandem } );

    this.bench = new BenchNode( model, tandem.createTandem( 'benchNode' ) );

    // Light source
    const lightRadio = new RectangularRadioButtonGroup<SourceLight>( model.lightTypeProperty, [
      { value: 'unpolarized', createNode: () => new Text( BsshsPolarizationStrings.unpolarizedLightStringProperty, { font: C.FONT, maxWidth: 130 } ), tandemName: 'unpolarizedRadioButton' },
      { value: 'polarized', createNode: () => new Text( BsshsPolarizationStrings.polarizedLightStringProperty, { font: C.FONT, maxWidth: 130 } ), tandemName: 'polarizedRadioButton' }
    ], {
      orientation: 'horizontal',
      spacing: 8,
      touchAreaYDilation: 16,
      radioButtonOptions: { xMargin: 10, yMargin: 12 },
      tandem: tandem.createTandem( 'lightRadioButtonGroup' )
    } );
    const sourceAngleControl = PolarizationControls.numberControl( BsshsPolarizationStrings.sourceAngleStringProperty, model.sourceAngleProperty,
      PolarizerModel.SOURCE_ANGLE_RANGE, {
        delta: 1, decimalPlaces: 0, valuePattern: BsshsPolarizationStrings.anglePatternStringProperty, trackWidth: TRACK_WIDTH,
        enabledProperty: new DerivedProperty( [ model.lightTypeProperty ], light => light === 'polarized' )
      }, tandem.createTandem( 'sourceAngleControl' ) );
    const sourceIntensityControl = PolarizationControls.numberControl( BsshsPolarizationStrings.sourceIntensityStringProperty, model.sourceIntensityProperty,
      PolarizerModel.SOURCE_INTENSITY_RANGE, {
        delta: 1, decimalPlaces: 0, valuePattern: BsshsPolarizationStrings.intensityPatternStringProperty, trackWidth: TRACK_WIDTH
      }, tandem.createTandem( 'sourceIntensityControl' ) );
    this.lightPanel = new Panel( new VBox( {
      spacing: C.SPACING,
      align: 'left',
      children: [ new Text( BsshsPolarizationStrings.lightSourceStringProperty, { font: C.TITLE_FONT, maxWidth: 260 } ), lightRadio, sourceAngleControl, sourceIntensityControl ]
    } ), { xMargin: 12, yMargin: 10 } );

    // Polarizers: each title is a checkbox that puts the polarizer in or out of the beam
    const names = [ BsshsPolarizationStrings.polarizer1StringProperty, BsshsPolarizationStrings.polarizer2StringProperty, BsshsPolarizationStrings.polarizer3StringProperty ];
    const polarizerControls = model.polarizers.map( ( p, i ) => {
      const checkbox = new Checkbox( p.insertedProperty, new Text( names[ i ], { font: C.CONTROL_FONT, maxWidth: 110 } ), {
        boxWidth: 20,
        spacing: 8,
        touchAreaXDilation: C.TOUCH_DILATION,
        touchAreaYDilation: C.TOUCH_DILATION,
        tandem: tandem.createTandem( `polarizer${i + 1}Checkbox` )
      } );
      return PolarizationControls.numberControl( checkbox, p.angleProperty, Polarizer.ANGLE_RANGE, {
        delta: 1, decimalPlaces: 0, valuePattern: BsshsPolarizationStrings.anglePatternStringProperty, trackWidth: TRACK_WIDTH
      }, tandem.createTandem( `polarizer${i + 1}Control` ) );
    } );
    const fieldCheckbox = new Checkbox( model.fieldIndicatorsVisibleProperty,
      new Text( BsshsPolarizationStrings.fieldIndicatorsStringProperty, { font: C.FONT, maxWidth: 220 } ), {
        boxWidth: 20,
        spacing: 8,
        touchAreaXDilation: C.TOUCH_DILATION,
        touchAreaYDilation: C.TOUCH_DILATION,
        tandem: tandem.createTandem( 'fieldIndicatorsCheckbox' )
      } );
    this.polarizerPanel = new Panel( new VBox( {
      spacing: C.SPACING,
      align: 'left',
      children: [ new Text( BsshsPolarizationStrings.polarizersStringProperty, { font: C.TITLE_FONT, maxWidth: 260 } ), ...polarizerControls, fieldCheckbox ]
    } ), { xMargin: 12, yMargin: 10 } );

    // Measurements (what the detector and the last polarizer show)
    const max = PolarizerModel.SOURCE_INTENSITY_RANGE.max;
    this.measurementPanel = new Panel( PolarizationControls.readoutTable( BsshsPolarizationStrings.measurementsStringProperty, [
      { label: BsshsPolarizationStrings.detectorIntensityStringProperty, property: model.transmittedIntensityProperty, range: new Range( 0, max ), decimalPlaces: 2, valuePattern: BsshsPolarizationStrings.intensityPatternStringProperty },
      { label: BsshsPolarizationStrings.lastIncidentStringProperty, property: model.incidentIntensityProperty, range: new Range( 0, max ), decimalPlaces: 2, valuePattern: BsshsPolarizationStrings.intensityPatternStringProperty },
      { label: BsshsPolarizationStrings.lastAngleStringProperty, property: model.polarizerAngleProperty, range: new Range( 0, 90 ), decimalPlaces: 1, valuePattern: BsshsPolarizationStrings.anglePatternStringProperty },
      { label: BsshsPolarizationStrings.cosSquaredStringProperty, property: model.cosSquaredProperty, range: new Range( 0, 1 ), decimalPlaces: 3 },
      { label: BsshsPolarizationStrings.intensityRatioStringProperty, property: model.intensityRatioProperty, range: new Range( 0, 1 ), decimalPlaces: 3 },
      { label: BsshsPolarizationStrings.sourceFractionStringProperty, property: model.transmittedFractionProperty, range: new Range( 0, 1 ), decimalPlaces: 3 }
    ] ), { xMargin: 12, yMargin: 10 } );

    this.resetAllButton = new ResetAllButton( {
      listener: () => {
        this.interruptSubtreeInput();
        model.reset();
      },
      touchAreaDilation: 22,
      tandem: tandem.createTandem( 'resetAllButton' )
    } );

    this.children = [ this.bench, this.measurementPanel, this.lightPanel, this.polarizerPanel, this.resetAllButton ];
    this.arrangeInitial();
  }

  protected arrange( portrait: boolean ): Bounds2 {
    const nodes: Node[] = [ this.bench, this.measurementPanel, this.lightPanel, this.polarizerPanel ];
    nodes.forEach( n => n.setScaleMagnitude( 1 ) );
    if ( !portrait ) {
      const lb = this.layoutBounds;
      const columnWidth = Math.max( this.lightPanel.width, this.polarizerPanel.width );
      const columnLeft = lb.maxX - C.RIGHT_MARGIN - columnWidth;
      this.lightPanel.left = columnLeft;
      this.lightPanel.top = lb.minY + C.MARGIN;
      this.polarizerPanel.left = columnLeft;
      this.polarizerPanel.top = this.lightPanel.bottom + C.SPACING;
      const benchWidth = columnLeft - lb.minX - 2 * C.MARGIN;
      this.bench.setScaleMagnitude( Math.min( 1, benchWidth / this.bench.width ) );
      this.bench.left = lb.minX + C.MARGIN;
      this.bench.top = lb.minY + C.MARGIN + 10;
      this.measurementPanel.left = this.bench.left;
      this.measurementPanel.top = this.bench.bottom + 2 * C.SPACING;
      this.resetAllButton.right = columnLeft - C.MARGIN;
      this.resetAllButton.bottom = lb.maxY - C.MARGIN;
      return lb;
    }
    const W = C.PORTRAIT_WIDTH;
    const inner = W - 2 * C.MARGIN;
    let y = C.PORTRAIT_TOP_BAND;
    this.bench.setScaleMagnitude( inner / this.bench.width );
    this.bench.centerX = W / 2;
    this.bench.top = y;
    y = this.bench.bottom + C.SPACING;
    for ( const panel of [ this.lightPanel, this.polarizerPanel, this.measurementPanel ] ) {
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

bsshsPolarization.register( 'PolarizerScreenView', PolarizerScreenView );
