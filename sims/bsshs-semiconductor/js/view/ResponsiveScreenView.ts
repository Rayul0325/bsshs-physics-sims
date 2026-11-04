// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * A ScreenView with two arrangements of the same nodes:
 *   - landscape: the usual 1024×618 layout bounds, scaled and centered by ScreenView;
 *   - portrait (phones held upright): one column PORTRAIT_WIDTH view units wide, scaled to the screen width and
 *     stacked from the top, so controls stay large enough to touch instead of shrinking to a letterboxed strip.
 * Subclasses position their nodes in layoutLandscape() / layoutPortrait() and return the portrait column height.
 *
 * The top of a portrait screen stays clear (TOP_CLEARANCE CSS px) for the class drawer's opener, which sits in
 * the top-right corner on phones; on wider portrait screens the opener sits on the right edge, so the column
 * keeps SIDE_CLEARANCE CSS px free on both sides.
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import ScreenView, { type ScreenViewOptions } from '../../../joist/js/ScreenView.js';
import Node from '../../../scenery/js/nodes/Node.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';

const PORTRAIT_WIDTH = 600;      // view units
const PORTRAIT_RATIO = 1.15;     // height / width above which the portrait arrangement is used
const TOP_CLEARANCE = 64;        // CSS px
const SIDE_CLEARANCE = 52;       // CSS px, only when the screen is at least SHEET_WIDTH wide
const SHEET_WIDTH = 600;         // CSS px

export default abstract class ResponsiveScreenView extends ScreenView {

  public static readonly PORTRAIT_WIDTH = PORTRAIT_WIDTH;

  /** Whether the last layout() used the portrait arrangement. */
  protected isPortrait = false;
  private lastViewBounds: Bounds2 | null = null;
  private relayingOut = false;

  protected constructor( options?: ScreenViewOptions ) {
    super( options );
  }

  /** Positions every node inside this.layoutBounds (1024×618). */
  protected abstract layoutLandscape(): void;

  /** Positions every node in a column [0, PORTRAIT_WIDTH] from y = 0 down; returns the column height. */
  protected abstract layoutPortrait(): number;

  /** Lays the screen out again whenever one of these nodes changes size (e.g. a readout row appears). */
  protected relayoutWhenResized( ...nodes: Node[] ): void {
    nodes.forEach( node => node.localBoundsProperty.lazyLink( () => {
      if ( this.lastViewBounds && !this.relayingOut ) {
        this.relayingOut = true;
        this.layout( this.lastViewBounds );
        this.relayingOut = false;
      }
    } ) );
  }

  public override layout( viewBounds: Bounds2, layoutMatrixOptions?: Parameters<ScreenView[ 'layout' ]>[ 1 ] ): void {
    this.lastViewBounds = viewBounds;
    const portrait = viewBounds.height > viewBounds.width * PORTRAIT_RATIO;
    this.isPortrait = portrait;
    if ( !portrait ) {
      this.layoutLandscape();
      super.layout( viewBounds, layoutMatrixOptions );
      return;
    }
    const height = this.layoutPortrait();
    const side = viewBounds.width >= SHEET_WIDTH ? SIDE_CLEARANCE : 0;
    const scale = Math.min( ( viewBounds.width - 2 * side ) / PORTRAIT_WIDTH,
      ( viewBounds.height - TOP_CLEARANCE ) / height );
    const dx = ( viewBounds.width - PORTRAIT_WIDTH * scale ) / 2;
    this.matrix = Matrix3.rowMajor(
      scale, 0, viewBounds.left + dx,
      0, scale, viewBounds.top + TOP_CLEARANCE,
      0, 0, 1
    );
    this.visibleBoundsProperty.value = this.parentToLocalBounds( viewBounds );
  }
}

bsshsSemiconductor.register( 'ResponsiveScreenView', ResponsiveScreenView );
