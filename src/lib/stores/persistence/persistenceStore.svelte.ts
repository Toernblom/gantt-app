import type { Project } from '$lib/types';
import {
  isGanttProject, readProject, writeProject, writeMarker,
  pickProjectFolder, getProjectFilePath,
} from './fileSystem.js';
import {
  getRecentProjects, saveRecentProject, removeRecentProject,
  type RecentEntry,
} from './recentProjects.js';
import { watch, type UnwatchFn } from '@tauri-apps/plugin-fs';
import { isTauri } from './isTauri.js';

class PersistenceStore {
  recentProjects = $state<RecentEntry[]>([]);
  activeDirPath = $state<string | null>(null);
  isSaving = $state(false);
  lastSaved = $state<string | null>(null);
  error = $state<string | null>(null);

  /** Callback invoked when an external file change is detected. Set by ganttStore. */
  onExternalChange: ((project: Project) => void) | null = null;

  // Debounced auto-save
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  // File watcher cleanup
  private _unwatchFn: UnwatchFn | null = null;
  // Write guard: timestamp of our last write, used to suppress watcher reload
  private _lastWriteTime = 0;
  private static readonly WRITE_GUARD_MS = 2000;

  scheduleSave(project: Project): void {
    if (!isTauri || !this.activeDirPath) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._doSave(project), 500);
  }

  private async _doSave(project: Project): Promise<void> {
    if (!this.activeDirPath) return;
    this.isSaving = true;
    this.error = null;
    try {
      this._lastWriteTime = Date.now();
      await writeProject(this.activeDirPath, project);
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
    if (!isTauri) return null;
    const dirPath = await pickProjectFolder();
    if (!dirPath) return null;
    if (!(await isGanttProject(dirPath))) {
      this.error = 'Not a Gantt App project (missing .ganttapp file)';
      return null;
    }
    try {
      const project = await readProject(dirPath);
      await this._setActiveDir(dirPath);
      this.error = null;
      await saveRecentProject({ id: project.id, name: project.name, lastOpened: new Date().toISOString(), dirPath });
      await this.loadRecents();
      return project;
    } catch (e) {
      this.error = `Failed to read project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  async openRecent(entry: RecentEntry): Promise<Project | null> {
    if (!isTauri) return null;
    if (!(await isGanttProject(entry.dirPath))) {
      this.error = 'Folder is no longer a valid project';
      await removeRecentProject(entry.id);
      await this.loadRecents();
      return null;
    }
    try {
      const project = await readProject(entry.dirPath);
      await this._setActiveDir(entry.dirPath);
      this.error = null;
      await saveRecentProject({ ...entry, lastOpened: new Date().toISOString() });
      await this.loadRecents();
      return project;
    } catch (e) {
      this.error = `Failed to read project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  async createInFolder(): Promise<Project | null> {
    if (!isTauri) return null;
    const dirPath = await pickProjectFolder();
    if (!dirPath) return null;
    if (await isGanttProject(dirPath)) {
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
      await writeMarker(dirPath);
      this._lastWriteTime = Date.now();
      await writeProject(dirPath, project);
      await this._setActiveDir(dirPath);
      this.error = null;
      await saveRecentProject({ id: project.id, name: project.name, lastOpened: new Date().toISOString(), dirPath });
      await this.loadRecents();
      return project;
    } catch (e) {
      this.error = `Failed to create project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  async forgetRecent(id: string): Promise<void> {
    if (!isTauri) return;
    await removeRecentProject(id);
    await this.loadRecents();
  }

  // ---- File Watcher ----

  /** Start watching project.json in the active directory for external changes. */
  private async _startWatching(dirPath: string): Promise<void> {
    await this._stopWatching();
    if (!isTauri) return;
    const projectFilePath = await getProjectFilePath(dirPath);
    this._unwatchFn = await watch(projectFilePath, async (event) => {
      // Only react to modify events
      if (!event.type || typeof event.type !== 'object') return;
      const eventType = Object.keys(event.type)[0];
      if (eventType !== 'modify') return;

      // Write guard: ignore changes we just wrote ourselves
      if (Date.now() - this._lastWriteTime < PersistenceStore.WRITE_GUARD_MS) return;

      // External change detected — reload
      try {
        const project = await readProject(dirPath);
        if (this.onExternalChange) {
          this.onExternalChange(project);
        }
      } catch {
        // File might be mid-write by another process, ignore transient errors
      }
    }, { recursive: false });
  }

  private async _stopWatching(): Promise<void> {
    if (this._unwatchFn) {
      await this._unwatchFn();
      this._unwatchFn = null;
    }
  }

  /** Set the active directory and start the file watcher. */
  private async _setActiveDir(dirPath: string): Promise<void> {
    this.activeDirPath = dirPath;
    // Start watcher in background — don't let failure block project open
    this._startWatching(dirPath).catch(() => {});
  }
}

export const persistenceStore = new PersistenceStore();
