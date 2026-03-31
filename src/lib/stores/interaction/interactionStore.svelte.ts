import { ganttStore } from '../gantt/index.js';
import { ROW_HEIGHT } from '$lib/types';

/**
 * Manages transient interaction state for the Gantt timeline.
 *
 * Dependency linking: Shift+click a source bar, then click a target bar.
 * A rubber-band line follows the cursor between the two clicks.
 * Press Escape or click empty space to cancel.
 */
class InteractionStore {
  // --- Dependency linking state ---
  isLinking = $state(false);
  linkSourceId = $state<string | null>(null);
  /** Source anchor point in SVG-space (right edge center of source bar). */
  linkSourceX = $state(0);
  linkSourceY = $state(0);
  /** Live cursor position in SVG-space for the rubber-band line. */
  linkCursorX = $state(0);
  linkCursorY = $state(0);

  // --- SVG coordinate helper ---
  private _svgEl: SVGSVGElement | null = null;
  private _svgPoint: DOMPoint | null = null;

  private _clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
    if (!this._svgEl) return { x: clientX, y: clientY };
    if (!this._svgPoint) this._svgPoint = this._svgEl.createSVGPoint();
    this._svgPoint.x = clientX;
    this._svgPoint.y = clientY;
    const ctm = this._svgEl.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const p = this._svgPoint.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  captureSvg(target: EventTarget | null): void {
    if (this._svgEl) return;
    let el = target as Element | null;
    while (el && el.tagName !== 'svg') el = el.parentElement;
    if (el) this._svgEl = el as SVGSVGElement;
  }

  // --- Start linking (Shift+click on source bar) ---
  startLink(sourceId: string, sourceX: number, sourceY: number, e: MouseEvent): void {
    this.captureSvg(e.target);
    this.isLinking = true;
    this.linkSourceId = sourceId;
    this.linkSourceX = sourceX;
    this.linkSourceY = sourceY;
    const p = this._clientToSvg(e.clientX, e.clientY);
    this.linkCursorX = p.x;
    this.linkCursorY = p.y;

    document.body.style.cursor = 'crosshair';
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('keydown', this._onKeyDown);
  }

  // --- Complete linking (click on target bar) ---
  completeLink(targetId: string): void {
    if (!this.isLinking || !this.linkSourceId) return;
    if (targetId === this.linkSourceId) return; // can't link to self

    ganttStore.addDependency(targetId, this.linkSourceId, 'FS');
    this.cancelLink();
  }

  // --- Cancel linking ---
  cancelLink(): void {
    this.isLinking = false;
    this.linkSourceId = null;
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  /** Called by bar click handler: if linking, complete it; otherwise ignore. */
  handleBarClick(rowId: string): boolean {
    if (this.isLinking) {
      this.completeLink(rowId);
      return true; // consumed the click
    }
    return false; // not linking, let normal click proceed
  }

  private _onMouseMove = (e: MouseEvent): void => {
    const p = this._clientToSvg(e.clientX, e.clientY);
    this.linkCursorX = p.x;
    this.linkCursorY = p.y;
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.cancelLink();
    }
  };
}

export const interactionStore = new InteractionStore();
