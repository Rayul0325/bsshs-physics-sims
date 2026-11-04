// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * A ScreenView with two arrangements of the same nodes:
 *   - landscape (and square-ish windows): joist's stock layout of the 1024 × 618 layout bounds;
 *   - portrait (phones held upright): subclasses stack the nodes in a narrow column, and the whole column is scaled
 *     to the window width (not to 1024), so text and touch targets stay usable from 390 px wide.
 * Subclasses implement arrange( portrait ) and return the bounds of the arranged content in view coordinates.
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import ScreenView, { type ScreenViewOptions } from '../../../joist/js/ScreenView.js';
import bsshsPolarization from '../bsshsPolarization.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';

export default abstract class ResponsiveScreenView extends ScreenView {

  private portrait: boolean | null = null;
  private contentBounds: Bounds2;

  protected constructor( options: ScreenViewOptions ) {
    super( options );
    this.contentBounds = this.layoutBounds;
  }

  /** Positions the children for one arrangement; returns the content bounds (view coordinates). */
  protected abstract arrange( portrait: boolean ): Bounds2;

  /** Whether the portrait arrangement is in use (null before the first layout). */
  protected get isPortrait(): boolean | null {
    return this.portrait;
  }

  /** Arranges the children for the first time, before the sim's first resize. Call at the end of the constructor. */
  protected arrangeInitial(): void {
    this.portrait = false;
    this.contentBounds = this.arrange( false );
  }

  public override layout( viewBounds: Bounds2 ): void {
    const portrait = viewBounds.width < viewBounds.height * PolarizationViewConstants.PORTRAIT_ASPECT;
    if ( portrait !== this.portrait ) {
      this.portrait = portrait;
      this.contentBounds = this.arrange( portrait );
    }
    if ( !portrait ) {
      super.layout( viewBounds );
      return;
    }
    const cb = this.contentBounds;
    const scale = Math.min( viewBounds.width / cb.width, viewBounds.height / cb.height );
    const dx = viewBounds.left + ( viewBounds.width - cb.width * scale ) / 2 - cb.left * scale;
    const dy = viewBounds.top + ( viewBounds.height - cb.height * scale ) / 2 - cb.top * scale;
    this.matrix = Matrix3.rowMajor( scale, 0, dx, 0, scale, dy, 0, 0, 1 );
    this.visibleBoundsProperty.value = this.parentToLocalBounds( viewBounds );
  }
}

bsshsPolarization.register( 'ResponsiveScreenView', ResponsiveScreenView );
