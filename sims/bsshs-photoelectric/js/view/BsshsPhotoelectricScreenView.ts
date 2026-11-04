// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * View of the photoelectric experiment. Two arrangements of the same parts:
 * - landscape (wider than tall): apparatus and the I–V graph on the left, the light / metal / circuit panels in a
 *   column on the right, in PhET's standard 1024 × 618 layout bounds;
 * - portrait (phones): everything in one column of fixed width, scaled to fit the width (and the height if
 *   needed) and pinned to the top, so the text stays readable on a 390 px wide screen instead of shrinking the
 *   landscape layout to a third of its size.
 * The apparatus's top-right corner is kept free; that is where the class drawer's button sits on phones.
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import ScreenView from '../../../joist/js/ScreenView.js';
import ResetAllButton from '../../../scenery-phet/js/buttons/ResetAllButton.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';
import BsshsPhotoelectricModel from '../model/BsshsPhotoelectricModel.js';
import ApparatusNode from './ApparatusNode.js';
import { CircuitPanel, LightPanel, MetalPanel } from './ControlPanels.js';
import CurrentVoltageChartNode from './CurrentVoltageChartNode.js';
import PhotoelectricViewConstants from './PhotoelectricViewConstants.js';

const C = PhotoelectricViewConstants;
const PORTRAIT_WIDTH = 560; // view units of the one-column layout
const PORTRAIT_MARGIN = 8;

export default class BsshsPhotoelectricScreenView extends ScreenView {

  private readonly apparatus: ApparatusNode;
  private readonly lightPanel: LightPanel;
  private readonly metalPanel: MetalPanel;
  private readonly circuitPanel: CircuitPanel;
  private readonly landscapeChart: CurrentVoltageChartNode;
  private readonly portraitChart: CurrentVoltageChartNode;
  private readonly resetAllButton: ResetAllButton;
  private portraitHeight = 0;

  public constructor( model: BsshsPhotoelectricModel, tandem: Tandem ) {
    super( { tandem: tandem } );

    this.apparatus = new ApparatusNode( model, tandem.createTandem( 'apparatus' ) );
    this.lightPanel = new LightPanel( model, tandem.createTandem( 'lightPanel' ) );
    this.metalPanel = new MetalPanel( model, tandem.createTandem( 'metalPanel' ) );
    this.circuitPanel = new CircuitPanel( model, tandem.createTandem( 'circuitPanel' ) );

    // The graph has a different size in each arrangement; only one is shown at a time.
    this.landscapeChart = new CurrentVoltageChartNode( model, this.circuitPanel.showEnergyProperty, 420, 108 );
    this.portraitChart = new CurrentVoltageChartNode( model, this.circuitPanel.showEnergyProperty, 470, 170 );

    this.resetAllButton = new ResetAllButton( {
      listener: () => {
        this.interruptSubtreeInput();
        model.reset();
        this.reset();
      },
      touchAreaDilation: C.TOUCH_DILATION,
      tandem: tandem.createTandem( 'resetAllButton' )
    } );

    this.children = [
      this.apparatus, this.landscapeChart, this.portraitChart,
      this.lightPanel, this.metalPanel, this.circuitPanel, this.resetAllButton
    ];
    this.arrangeLandscape();
  }

  /** Right column of panels, apparatus and graph on the left (layout bounds 1024 × 618). */
  private arrangeLandscape(): void {
    const b = this.layoutBounds;
    const m = C.MARGIN;
    this.landscapeChart.visible = true;
    this.portraitChart.visible = false;

    this.apparatus.left = m;
    this.apparatus.top = 6;
    this.landscapeChart.left = m;
    this.landscapeChart.bottom = b.maxY - 8;

    // Keep about 40 units free at the right edge for the drawer's open button.
    const columnRight = b.maxX - 40;
    this.lightPanel.right = columnRight;
    this.lightPanel.top = 8;
    this.metalPanel.right = columnRight;
    this.metalPanel.top = this.lightPanel.bottom + C.PANEL_SPACING;
    this.circuitPanel.right = columnRight;
    this.circuitPanel.top = this.metalPanel.bottom + C.PANEL_SPACING;
    // Reset All sits in the gap between the graph and the panel column.
    this.resetAllButton.centerX = ( this.landscapeChart.right + this.lightPanel.left ) / 2;
    this.resetAllButton.bottom = b.maxY - 8;
  }

  /** One column, PORTRAIT_WIDTH wide, starting at y = 0. Returns nothing; stores the total height. */
  private arrangePortrait(): void {
    const s = C.PANEL_SPACING;
    const centerX = PORTRAIT_WIDTH / 2;
    this.landscapeChart.visible = false;
    this.portraitChart.visible = true;

    this.apparatus.left = 0;
    this.apparatus.top = 0;
    let y = this.apparatus.bottom + s;
    const place = ( node: Node ) => {
      node.centerX = centerX;
      node.top = y;
      y = node.bottom + s;
    };
    place( this.lightPanel );
    place( this.metalPanel );
    place( this.circuitPanel );
    place( this.portraitChart );
    this.resetAllButton.right = this.portraitChart.right;
    this.resetAllButton.top = y;
    this.portraitHeight = this.resetAllButton.bottom;
  }

  public override layout( viewBounds: Bounds2 ): void {
    if ( viewBounds.width >= viewBounds.height ) {
      this.arrangeLandscape();
      super.layout( viewBounds );
      return;
    }
    this.arrangePortrait();
    const fullWidth = PORTRAIT_WIDTH + 2 * PORTRAIT_MARGIN;
    const fullHeight = this.portraitHeight + 2 * PORTRAIT_MARGIN;
    const scale = Math.min( viewBounds.width / fullWidth, viewBounds.height / fullHeight );
    const dx = ( viewBounds.width / scale - PORTRAIT_WIDTH ) / 2; // centered horizontally
    this.matrix = Matrix3.rowMajor(
      scale, 0, viewBounds.left + dx * scale,
      0, scale, viewBounds.top + PORTRAIT_MARGIN * scale,
      0, 0, 1
    );
    this.visibleBoundsProperty.value = this.parentToLocalBounds( viewBounds );
  }

  public override step( dt: number ): void {
    this.apparatus.step( dt );
  }

  public reset(): void {
    this.apparatus.reset();
    this.circuitPanel.reset();
  }
}

bsshsPhotoelectric.register( 'BsshsPhotoelectricScreenView', BsshsPhotoelectricScreenView );
