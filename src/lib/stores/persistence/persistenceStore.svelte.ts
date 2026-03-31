import type { Project } from '$lib/types';
import {
  isGanttProject, readProject, writeProject, writeMarker,
  pickProjectFolder, verifyPermission,
} from './fileSystem.js';
import {
  getRecentProjects, saveRecentProject, removeRecentProject,
  type RecentEntry,
} from './recentProjects.js';

class PersistenceStore {
  recentProjects = $state<RecentEntry[]>([]);
  activeDirHandle = $state<FileSystemDirectoryHandle | null>(null);
  isSaving = $state(false);
  lastSaved = $state<string | null>(null);
  error = $state<string | null>(null);

  isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // Debounced auto-save
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  scheduleSave(project: Project): void {
    if (!this.activeDirHandle) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._doSave(project), 500);
  }

  private async _doSave(project: Project): Promise<void> {
    if (!this.activeDirHandle) return;
    this.isSaving = true;
    this.error = null;
    try {
      await writeProject(this.activeDirHandle, project);
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
    if (!this.isSupported) return;
    try {
      this.recentProjects = await getRecentProjects();
    } catch {
      this.recentProjects = [];
    }
  }

  async openFolder(): Promise<Project | null> {
    const dirHandle = await pickProjectFolder();
    if (!dirHandle) return null;
    if (!(await isGanttProject(dirHandle))) {
      this.error = 'Not a Gantt App project (missing .ganttapp file)';
      return null;
    }
    const ok = await verifyPermission(dirHandle);
    if (!ok) { this.error = 'Permission denied'; return null; }
    try {
      const project = await readProject(dirHandle);
      this.activeDirHandle = dirHandle;
      this.error = null;
      await saveRecentProject({ id: project.id, name: project.name, lastOpened: new Date().toISOString(), dirHandle });
      await this.loadRecents();
      return project;
    } catch (e) {
      this.error = `Failed to read project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  async openRecent(entry: RecentEntry): Promise<Project | null> {
    const ok = await verifyPermission(entry.dirHandle);
    if (!ok) {
      this.error = 'Permission denied — please re-open the folder';
      await removeRecentProject(entry.id);
      await this.loadRecents();
      return null;
    }
    if (!(await isGanttProject(entry.dirHandle))) {
      this.error = 'Folder is no longer a valid project';
      await removeRecentProject(entry.id);
      await this.loadRecents();
      return null;
    }
    try {
      const project = await readProject(entry.dirHandle);
      this.activeDirHandle = entry.dirHandle;
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
    const dirHandle = await pickProjectFolder();
    if (!dirHandle) return null;
    const ok = await verifyPermission(dirHandle);
    if (!ok) { this.error = 'Permission denied'; return null; }
    if (await isGanttProject(dirHandle)) {
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
      await writeMarker(dirHandle);
      await writeProject(dirHandle, project);
      this.activeDirHandle = dirHandle;
      this.error = null;
      await saveRecentProject({ id: project.id, name: project.name, lastOpened: new Date().toISOString(), dirHandle });
      await this.loadRecents();
      return project;
    } catch (e) {
      this.error = `Failed to create project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  async forgetRecent(id: string): Promise<void> {
    await removeRecentProject(id);
    await this.loadRecents();
  }
}

export const persistenceStore = new PersistenceStore();
