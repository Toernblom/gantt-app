import { ganttStore } from '../gantt/ganttStore.svelte.js';
import { ROW_HEIGHT } from '$lib/types';

/**
 * Manages transient interaction state for the Gantt timeline.
 *
 * Dependency linking: long-press a bar (500ms), drag to target bar, release.
 * A rubber-band line follows the cursor during the drag.
 * Press Escape to cancel.
 *
 * Dependency selection: click an arrow to select it, Delete to remove.
 */
class InteractionStore {
  // --- Dependency linking state ---
  isLinking = $state(false);
  linkSourceId = $state<string | null>(null);
  linkSourceX = $state(0);
  linkSourceY = $state(0);
  linkCursorX = $state(0);
  linkCursorY = $state(0);

  // --- Dependency selection state ---
  /** Selected dependency: { taskId, targetId } — taskId is the dependent, targetId is the prereq. */
  selectedDep = $state<{ taskId: string; targetId: string } | null>(null);

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

  // --- Start linking (long-press on source bar) ---
  startLink(sourceId: string, sourceX: number, sourceY: number, e: MouseEvent): void {
    this.captureSvg(e.target);
    this.isLinking = true;
    this.linkSourceId = sourceId;
    this.linkSourceX = sourceX;
    this.linkSourceY = sourceY;
    this.selectedDep = null; // clear dep selection when linking
    const p = this._clientToSvg(e.clientX, e.clientY);
    this.linkCursorX = p.x;
    this.linkCursorY = p.y;

    document.body.style.cursor = 'crosshair';
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('keydown', this._onKeyDown);
  }

  // --- Complete linking (mouseup over a target bar) ---
  completeLink(targetId: string): void {
    if (!this.isLinking || !this.linkSourceId) return;
    if (targetId === this.linkSourceId) return;

    ganttStore.addDependency(targetId, this.linkSourceId, 'FS');
    this.cancelLink();
  }

  // --- Cancel linking ---
  cancelLink(): void {
    this.isLinking = false;
    this.linkSourceId = null;
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  /** Called by bar mouseenter: if linking, show crosshair target feedback. */
  handleBarMouseUp(rowId: string): boolean {
    if (this.isLinking) {
      this.completeLink(rowId);
      return true;
    }
    return false;
  }

  // --- Dependency selection ---
  selectDependency(taskId: string, targetId: string): void {
    // Clear task selection so Delete applies to the dep, not a task
    ganttStore.selectTask(null);
    this.selectedDep = { taskId, targetId };
  }

  clearDependencySelection(): void {
    this.selectedDep = null;
  }

  deleteSelectedDependency(): void {
    if (!this.selectedDep) return;
    ganttStore.removeDependency(this.selectedDep.taskId, this.selectedDep.targetId);
    this.selectedDep = null;
  }

  private _onMouseMove = (e: MouseEvent): void => {
    const p = this._clientToSvg(e.clientX, e.clientY);
    this.linkCursorX = p.x;
    this.linkCursorY = p.y;
  };

  private _onMouseUp = (): void => {
    // Released over empty space — cancel linking
    this.cancelLink();
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.cancelLink();
    }
  };
}

export const interactionStore = new InteractionStore();
