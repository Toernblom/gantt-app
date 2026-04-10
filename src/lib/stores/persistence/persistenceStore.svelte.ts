import type { Project } from '$lib/types';
import { isTauri } from './isTauri.js';

// Tauri imports (used only when isTauri)
import {
  isGanttProject as isGanttProjectTauri,
  readProject as readProjectTauri,
  writeProject as writeProjectTauri,
  writeLlmExport as writeLlmExportTauri,
  writeMarker as writeMarkerTauri,
  pickProjectFolder as pickProjectFolderTauri,
} from './fileSystem.js';
import {
  getRecentProjects, saveRecentProject, removeRecentProject,
  type RecentEntry,
} from './recentProjects.js';

// Browser imports
import {
  isGanttProjectBrowser,
  readProjectBrowser,
  writeProjectBrowser,
  writeLlmExportBrowser,
  writeMarkerBrowser,
  pickProjectFolderBrowser,
  verifyPermission,
  getActiveDirHandle,
  setActiveDirHandle,
} from './fileSystemBrowser.js';

import { buildLlmExport } from './llmExport.js';
import { priorityStore } from '../priority/index.js';

class PersistenceStore {
  recentProjects = $state<RecentEntry[]>([]);
  activeDirPath = $state<string | null>(null);
  isSaving = $state(false);
  lastSaved = $state<string | null>(null);
  error = $state<string | null>(null);

  /** True when running in a browser with File System Access API support. */
  isBrowserFS = !isTauri && typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  /** Callback invoked when an external file change is detected. Set by ganttStore. */
  onExternalChange: ((project: Project) => void) | null = null;

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _unwatchFn: (() => Promise<void>) | null = null;
  private _lastWriteTime = 0;
  private static readonly WRITE_GUARD_MS = 2000;

  scheduleSave(project: Project): void {
    if (isTauri) {
      if (!this.activeDirPath) return;
    } else if (this.isBrowserFS) {
      if (!getActiveDirHandle()) return;
    } else {
      return;
    }
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._doSave(project), 500);
  }

  private async _doSave(project: Project): Promise<void> {
    this.isSaving = true;
    this.error = null;
    try {
      this._lastWriteTime = Date.now();
      const llmData = buildLlmExport(project, priorityStore.readyItems, priorityStore.blockedItems);
      if (isTauri && this.activeDirPath) {
        await writeProjectTauri(this.activeDirPath, project);
        await writeLlmExportTauri(this.activeDirPath, llmData);
      } else if (this.isBrowserFS) {
        const handle = getActiveDirHandle();
        if (handle) {
          await writeProjectBrowser(handle, project);
          await writeLlmExportBrowser(handle, llmData);
        }
      }
      this.lastSaved = new Date().toISOString();
    } catch (e) {
      this.error = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.isSaving = false;
    }
  }

  async saveNow(project: Project): Promise<void> {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    await this._doSave(project);
  }

  async loadRecents(): Promise<void> {
    if (!isTauri) return;
    try {
      this.recentProjects = await getRecentProjects();
    } catch {
      this.recentProjects = [];
    }
  }

  async openFolder(): Promise<Project | null> {
    if (isTauri) {
      return this._openFolderTauri();
    } else if (this.isBrowserFS) {
      return this._openFolderBrowser();
    }
    return null;
  }

  async openRecent(entry: RecentEntry): Promise<Project | null> {
    if (!isTauri) return null;
    if (!(await isGanttProjectTauri(entry.dirPath))) {
      this.error = 'Folder is no longer a valid project';
      await removeRecentProject(entry.id);
      await this.loadRecents();
      return null;
    }
    try {
      const project = await readProjectTauri(entry.dirPath);
      await this._setActiveDir(entry.dirPath);
      this.error = null;
      // Save recents separately — don't let APPDATA errors block project loading
      saveRecentProject({ ...entry, lastOpened: new Date().toISOString() }).catch(() => {});
      this.loadRecents().catch(() => {});
      return project;
    } catch (e) {
      this.error = `Failed to read project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  async createInFolder(): Promise<Project | null> {
    if (isTauri) {
      return this._createInFolderTauri();
    } else if (this.isBrowserFS) {
      return this._createInFolderBrowser();
    }
    return null;
  }

  async forgetRecent(id: string): Promise<void> {
    if (!isTauri) return;
    await removeRecentProject(id);
    await this.loadRecents();
  }

  // ---- Tauri implementations ----

  private async _openFolderTauri(): Promise<Project | null> {
    const dirPath = await pickProjectFolderTauri();
    if (!dirPath) return null;
    if (!(await isGanttProjectTauri(dirPath))) {
      this.error = 'Not a Gantt App project (missing .ganttapp file)';
      return null;
    }
    try {
      const project = await readProjectTauri(dirPath);
      await this._setActiveDir(dirPath);
      this.error = null;
      // Save recents separately — don't let APPDATA errors block project loading
      saveRecentProject({ id: project.id, name: project.name, lastOpened: new Date().toISOString(), dirPath }).catch(() => {});
      this.loadRecents().catch(() => {});
      return project;
    } catch (e) {
      this.error = `Failed to read project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  private async _createInFolderTauri(): Promise<Project | null> {
    const dirPath = await pickProjectFolderTauri();
    if (!dirPath) return null;
    if (await isGanttProjectTauri(dirPath)) {
      this.error = 'This folder already contains a Gantt App project';
      return null;
    }
    const project: Project = {
      id: `proj-${Date.now()}`,
      name: dirPath.split(/[\\/]/).pop() ?? 'Untitled',
      description: '',
      children: [],
      kanbanColumns: [{ id: 'backlog', name: 'Backlog' }],
    };
    try {
      await writeMarkerTauri(dirPath);
      this._lastWriteTime = Date.now();
      await writeProjectTauri(dirPath, project);
      await this._setActiveDir(dirPath);
      this.error = null;
      // Save recents separately — don't let APPDATA errors block project creation
      saveRecentProject({ id: project.id, name: project.name, lastOpened: new Date().toISOString(), dirPath }).catch(() => {});
      this.loadRecents().catch(() => {});
      return project;
    } catch (e) {
      this.error = `Failed to create project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  // ---- Browser implementations ----

  private async _openFolderBrowser(): Promise<Project | null> {
    const dirHandle = await pickProjectFolderBrowser();
    if (!dirHandle) return null;
    if (!(await verifyPermission(dirHandle))) {
      this.error = 'Permission denied';
      return null;
    }
    if (!(await isGanttProjectBrowser(dirHandle))) {
      this.error = 'Not a Gantt App project (missing .ganttapp file)';
      return null;
    }
    try {
      const project = await readProjectBrowser(dirHandle);
      setActiveDirHandle(dirHandle);
      this.activeDirPath = dirHandle.name;
      this.error = null;
      return project;
    } catch (e) {
      this.error = `Failed to read project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  private async _createInFolderBrowser(): Promise<Project | null> {
    const dirHandle = await pickProjectFolderBrowser();
    if (!dirHandle) return null;
    if (!(await verifyPermission(dirHandle))) {
      this.error = 'Permission denied';
      return null;
    }
    if (await isGanttProjectBrowser(dirHandle)) {
      this.error = 'This folder already contains a Gantt App project';
      return null;
    }
    const project: Project = {
      id: `proj-${Date.now()}`,
      name: dirHandle.name,
      description: '',
      children: [],
      kanbanColumns: [{ id: 'backlog', name: 'Backlog' }],
    };
    try {
      await writeMarkerBrowser(dirHandle);
      await writeProjectBrowser(dirHandle, project);
      setActiveDirHandle(dirHandle);
      this.activeDirPath = dirHandle.name;
      this.error = null;
      return project;
    } catch (e) {
      this.error = `Failed to create project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  // ---- File Watcher (Tauri only) ----

  private async _startWatching(dirPath: string): Promise<void> {
    await this._stopWatching();
    if (!isTauri) return;
    const { watch } = await import('@tauri-apps/plugin-fs');
    // Watch the parent DIRECTORY, not the file itself. Watching a single file
    // is unreliable on Windows when an external writer (LLM, editor) saves
    // atomically by renaming a temp file over project.json — the inode changes
    // and notify-rs loses the handle, silently dropping all future events.
    // Watching the directory sidesteps this entirely.
    const unwatchFn = await watch(dirPath, async (event) => {
      // Filter by path: only care about changes to project.json (ignore
      // project_llm.json, .ganttapp, etc.).
      const touchesProjectFile = event.paths?.some(
        (p) => (p.split(/[\\/]/).pop() ?? '').toLowerCase() === 'project.json'
      );
      if (!touchesProjectFile) return;

      // Filter by event kind. Tauri's WatchEvent.type is either a string
      // ('any' | 'other') or an object like { modify: {...} }, { create: {...} },
      // { access: {...} }, { remove: {...} }. Accept modify + create + any
      // (catch-all); skip access (reads only), remove (nothing to reload),
      // and 'other' (unknown).
      const type = event.type;
      let interesting = false;
      if (typeof type === 'string') {
        interesting = type === 'any';
      } else if (type && typeof type === 'object') {
        const kind = Object.keys(type)[0];
        interesting = kind === 'modify' || kind === 'create';
      }
      if (!interesting) return;

      // Skip if we have a pending or in-progress save — this is our own write
      if (this._saveTimer || this.isSaving) return;
      if (Date.now() - this._lastWriteTime < PersistenceStore.WRITE_GUARD_MS) return;
      try {
        const project = await readProjectTauri(dirPath);
        // Re-check after async read — a save may have been scheduled in the meantime
        if (this._saveTimer || this.isSaving) return;
        if (this.onExternalChange) {
          this.onExternalChange(project);
        }
      } catch {
        // File might be mid-write, ignore
      }
    }, { recursive: false });
    this._unwatchFn = async () => { await unwatchFn(); };
  }

  private async _stopWatching(): Promise<void> {
    if (this._unwatchFn) {
      await this._unwatchFn();
      this._unwatchFn = null;
    }
  }

  private async _setActiveDir(dirPath: string): Promise<void> {
    this.activeDirPath = dirPath;
    this._startWatching(dirPath).catch(() => {});
  }
}

export const persistenceStore = new PersistenceStore();
