import { projectStore } from '../project/index.js';
import type { Project } from '$lib/types';

const MAX_HISTORY = 50;

class HistoryStore {
  private _undoStack: string[] = [];  // JSON snapshots
  private _redoStack: string[] = [];
  private _skipNextSnapshot = false;

  canUndo = $state(false);
  canRedo = $state(false);

  /** Call BEFORE a mutation to save the current state. */
  snapshot(): void {
    if (this._skipNextSnapshot) {
      this._skipNextSnapshot = false;
      return;
    }
    this._undoStack.push(JSON.stringify(projectStore.project));
    if (this._undoStack.length > MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._redoStack = [];  // new action clears redo
    this._updateFlags();
  }

  undo(): void {
    if (this._undoStack.length === 0) return;
    this._redoStack.push(JSON.stringify(projectStore.project));
    const prev = this._undoStack.pop()!;
    projectStore.loadProject(JSON.parse(prev) as Project);
    this._skipNextSnapshot = false;
    this._updateFlags();
  }

  redo(): void {
    if (this._redoStack.length === 0) return;
    this._undoStack.push(JSON.stringify(projectStore.project));
    const next = this._redoStack.pop()!;
    projectStore.loadProject(JSON.parse(next) as Project);
    this._skipNextSnapshot = false;
    this._updateFlags();
  }

  /** Reset history (e.g. on project load). */
  clear(): void {
    this._undoStack = [];
    this._redoStack = [];
    this._updateFlags();
  }

  private _updateFlags(): void {
    this.canUndo = this._undoStack.length > 0;
    this.canRedo = this._redoStack.length > 0;
  }
}

export const historyStore = new HistoryStore();
