# File-Based Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace in-memory sample data with disk-based project files using the File System Access API. Projects live as folders on disk with a `.ganttapp` marker file and `project.json`. The sidebar opens folders, detects valid projects, loads data from disk, and auto-saves every change. Recent project folders persist across sessions via IndexedDB.

**Architecture:** A new `PersistenceStore` wraps the File System Access API — it holds `FileSystemDirectoryHandle` references, reads/writes project JSON, and manages recent project handles in IndexedDB. `ProjectStore` loses its hardcoded sample data and instead receives data from the persistence layer. A reactive `$effect` in GanttStore watches for data mutations and triggers debounced auto-save. The sidebar gets "Open Folder" / "New Project Folder" actions.

**Tech Stack:** File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`), IndexedDB (via `idb-keyval` or raw), Svelte 5 runes

---

## File Format

Each project is a **directory** on the user's disk:

```
my-project/
├── .ganttapp           # Marker file — JSON: { "version": 1, "createdAt": "2026-03-30" }
└── project.json        # Full Project object: { id, name, description, children: [...] }
```

- `.ganttapp` identifies the directory as a gantt-app project (like `.obsidian` for Obsidian vaults)
- `project.json` is the single source of truth — the entire `Project` type serialized as pretty-printed JSON
- The directory name IS the project's display location (but `project.json.name` is the canonical name)

---

## Recent Projects (IndexedDB)

Across sessions, the app remembers recently-opened project folders:

```typescript
interface RecentProject {
  name: string;               // Project name from project.json
  lastOpened: string;          // ISO datetime
  dirHandle: FileSystemDirectoryHandle;  // Serializable to IndexedDB
}
```

Stored in IndexedDB database `ganttapp` → object store `recent-projects`, keyed by project ID.

On app start:
1. Load all recent handles from IndexedDB
2. For each, attempt to verify the handle is still valid (the directory still exists)
3. Show valid ones in the sidebar "Recent Projects" list
4. Clicking a recent project re-opens it (may prompt for permission)

---

## Architecture Changes

### Current Flow
```
ProjectStore (in-memory projects[]) → GanttStore (UI state) → Components
```

### New Flow
```
PersistenceStore (File System Access API + IndexedDB)
  ↕ read/write
ProjectStore (single active project + recent list)
  ↕ data
GanttStore (UI state + auto-save trigger)
  ↕ render
Components
```

### Key Change: ProjectStore Simplification

Currently `ProjectStore` holds an **array** of all projects in memory. This doesn't scale with file-based persistence (can't load all project folders upfront).

New model:
- `ProjectStore` holds **one active project** (the currently open one)
- Recent projects are metadata only (name + handle) — loaded on demand
- Opening a project = reading its `project.json` from disk into `ProjectStore.project`
- "New Project" = creating a folder + writing empty `project.json` + `.ganttapp`

---

## Implementation Tasks

### Task 1: Create Persistence Utility Module
**Files:**
- Create: `src/lib/stores/persistence/fileSystem.ts`

Pure utility functions wrapping the File System Access API. No store, no state — just async functions.

```typescript
// --- Types ---

export interface ProjectMeta {
  id: string;
  name: string;
  version: number;
}

// --- Constants ---

const MARKER_FILE = '.ganttapp';
const PROJECT_FILE = 'project.json';
const MARKER_VERSION = 1;

// --- Directory Validation ---

/** Check if a directory handle contains a .ganttapp marker. */
export async function isGanttProject(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(MARKER_FILE);
    return true;
  } catch {
    return false;
  }
}

// --- Read ---

/** Read and parse project.json from a directory handle. */
export async function readProject(dirHandle: FileSystemDirectoryHandle): Promise<Project> {
  const fileHandle = await dirHandle.getFileHandle(PROJECT_FILE);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text) as Project;
}

// --- Write ---

/** Write project data as pretty-printed JSON. */
export async function writeProject(dirHandle: FileSystemDirectoryHandle, project: Project): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(PROJECT_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(project, null, 2));
  await writable.close();
}

/** Write the .ganttapp marker file. */
export async function writeMarker(dirHandle: FileSystemDirectoryHandle): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(MARKER_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify({
    version: MARKER_VERSION,
    createdAt: new Date().toISOString().slice(0, 10),
  }, null, 2));
  await writable.close();
}

// --- Pickers ---

/** Open directory picker and validate it's a gantt project. Returns null if not. */
export async function pickProjectFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return dirHandle;
  } catch {
    return null; // user cancelled
  }
}

/** Request readwrite permission on a stored handle (needed after page reload). */
export async function verifyPermission(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
  if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
  return false;
}
```

**Step 1:** Create the file with all the functions above.

**Step 2:** Run `npx svelte-check --tsconfig ./tsconfig.json` — should pass (no imports from this file yet).

**Step 3:** Commit.

---

### Task 2: Create IndexedDB Recent Projects Store
**Files:**
- Create: `src/lib/stores/persistence/recentProjects.ts`

Manages the recent-projects list in IndexedDB. Uses raw IndexedDB (no library needed — it's simple key-value).

```typescript
const DB_NAME = 'ganttapp';
const DB_VERSION = 1;
const STORE_NAME = 'recent-projects';

export interface RecentEntry {
  id: string;
  name: string;
  lastOpened: string;
  dirHandle: FileSystemDirectoryHandle;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getRecentProjects(): Promise<RecentEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const entries = (req.result as RecentEntry[])
        .sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
      resolve(entries);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecentProject(entry: RecentEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeRecentProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

**Step 1:** Create the file.

**Step 2:** Run type check.

**Step 3:** Commit.

---

### Task 3: Create PersistenceStore
**Files:**
- Create: `src/lib/stores/persistence/persistenceStore.svelte.ts`
- Create: `src/lib/stores/persistence/index.ts`

The reactive store that ties file system operations to the app state.

```typescript
import type { Project, GanttNode } from '$lib/types';
import {
  isGanttProject, readProject, writeProject, writeMarker,
  pickProjectFolder, verifyPermission,
} from './fileSystem.js';
import {
  getRecentProjects, saveRecentProject, removeRecentProject,
  type RecentEntry,
} from './recentProjects.js';

class PersistenceStore {
  // --- State ---
  recentProjects = $state<RecentEntry[]>([]);
  activeDirHandle = $state<FileSystemDirectoryHandle | null>(null);
  isSaving = $state(false);
  lastSaved = $state<string | null>(null);
  error = $state<string | null>(null);

  /** True if File System Access API is available in this browser. */
  isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // --- Debounced save ---
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _saveDelay = 500; // ms

  /** Schedule a debounced save of the active project. */
  scheduleSave(project: Project): void {
    if (!this.activeDirHandle) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._doSave(project), this._saveDelay);
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
      console.error('Auto-save failed:', e);
    } finally {
      this.isSaving = false;
    }
  }

  /** Force immediate save (e.g. before closing). */
  async saveNow(project: Project): Promise<void> {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    await this._doSave(project);
  }

  // --- Load recent projects from IndexedDB ---
  async loadRecents(): Promise<void> {
    if (!this.isSupported) return;
    try {
      this.recentProjects = await getRecentProjects();
    } catch {
      this.recentProjects = [];
    }
  }

  // --- Open an existing project folder ---
  async openFolder(): Promise<Project | null> {
    const dirHandle = await pickProjectFolder();
    if (!dirHandle) return null; // cancelled

    if (!(await isGanttProject(dirHandle))) {
      this.error = 'Not a Gantt App project (missing .ganttapp file)';
      return null;
    }

    const ok = await verifyPermission(dirHandle);
    if (!ok) {
      this.error = 'Permission denied';
      return null;
    }

    try {
      const project = await readProject(dirHandle);
      this.activeDirHandle = dirHandle;
      this.error = null;

      // Update recents
      await saveRecentProject({
        id: project.id,
        name: project.name,
        lastOpened: new Date().toISOString(),
        dirHandle,
      });
      await this.loadRecents();

      return project;
    } catch (e) {
      this.error = `Failed to read project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  // --- Open a recent project by handle ---
  async openRecent(entry: RecentEntry): Promise<Project | null> {
    const ok = await verifyPermission(entry.dirHandle);
    if (!ok) {
      this.error = 'Permission denied — please re-open the folder';
      await removeRecentProject(entry.id);
      await this.loadRecents();
      return null;
    }

    if (!(await isGanttProject(entry.dirHandle))) {
      this.error = 'Folder is no longer a valid Gantt App project';
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

  // --- Create a new project in a folder ---
  async createInFolder(): Promise<Project | null> {
    const dirHandle = await pickProjectFolder();
    if (!dirHandle) return null;

    const ok = await verifyPermission(dirHandle);
    if (!ok) { this.error = 'Permission denied'; return null; }

    // Check if folder already has a project
    if (await isGanttProject(dirHandle)) {
      this.error = 'This folder already contains a Gantt App project';
      return null;
    }

    const project: Project = {
      id: `proj-${Date.now()}`,
      name: dirHandle.name, // use folder name as project name
      description: '',
      children: [],
    };

    try {
      await writeMarker(dirHandle);
      await writeProject(dirHandle, project);
      this.activeDirHandle = dirHandle;
      this.error = null;

      await saveRecentProject({
        id: project.id,
        name: project.name,
        lastOpened: new Date().toISOString(),
        dirHandle,
      });
      await this.loadRecents();

      return project;
    } catch (e) {
      this.error = `Failed to create project: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
  }

  // --- Remove from recents (doesn't delete files) ---
  async forgetRecent(id: string): Promise<void> {
    await removeRecentProject(id);
    await this.loadRecents();
  }
}

export const persistenceStore = new PersistenceStore();
```

Index file:
```typescript
export { persistenceStore } from './persistenceStore.svelte.js';
```

**Step 1:** Create both files.

**Step 2:** Run type check.

**Step 3:** Commit.

---

### Task 4: Refactor ProjectStore for Persistence
**Files:**
- Modify: `src/lib/stores/project/projectStore.svelte.ts`

The ProjectStore currently holds a hardcoded array of sample projects. Refactor it to:
1. Hold a **single active project** (loaded from disk or in-memory fallback)
2. Keep sample data as a fallback for when no project is loaded (first launch)
3. Expose methods to load/replace the active project

```typescript
class ProjectStore {
  // The active project — starts with sample data, replaced when opening from disk
  project = $state<Project>(deepClone(SAMPLE_PROJECT));

  // --- Methods called by persistence layer ---

  /** Replace the active project entirely (when loading from disk). */
  loadProject(project: Project): void {
    this.project = project;
  }

  /** Create a new empty project and set it as active. */
  setNewProject(project: Project): void {
    this.project = project;
  }
}
```

Remove:
- The `projects` array (no longer needed — only one project is active at a time)
- The `activeProjectId` state
- The `switchProject`, `createProject`, `deleteProject` methods (these move to orchestration in GanttStore)
- Sample projects 2 and 3 (keep SAMPLE_PROJECT as the default fallback)

**Important:** The GanttStore delegates to projectStore, so its `switchProject`/`createProject`/`deleteProject` methods also need updating (Task 5).

**Step 1:** Simplify ProjectStore to single-project model.

**Step 2:** Run type check — will have errors in GanttStore and sidebar (expected).

**Step 3:** Commit.

---

### Task 5: Wire GanttStore to Persistence
**Files:**
- Modify: `src/lib/stores/gantt/ganttStore.svelte.ts`

Update GanttStore methods to use PersistenceStore for file operations and trigger auto-save.

**Changes:**

1. **Import persistenceStore**

2. **Replace `switchProject`** — now it opens a recent or picks a folder:
```typescript
async openProject(entry: RecentEntry): Promise<void> {
  const project = await persistenceStore.openRecent(entry);
  if (project) {
    projectStore.loadProject(project);
    this.focusPath = [];
    this.selectedTaskId = null;
    this.hoveredTaskId = null;
  }
}

async openFolder(): Promise<void> {
  const project = await persistenceStore.openFolder();
  if (project) {
    projectStore.loadProject(project);
    this.focusPath = [];
    this.selectedTaskId = null;
    this.hoveredTaskId = null;
  }
}

async createProjectFolder(): Promise<void> {
  const project = await persistenceStore.createInFolder();
  if (project) {
    projectStore.loadProject(project);
    this.focusPath = [];
    this.selectedTaskId = null;
    this.hoveredTaskId = null;
  }
}
```

3. **Add auto-save trigger** — after every mutation, schedule a save:
```typescript
private _triggerSave(): void {
  persistenceStore.scheduleSave(projectStore.project);
}
```

Call `this._triggerSave()` at the end of: `addChild`, `updateTask`, `deleteTask`, `toggleExpand`.

4. **Init on construction** — load recents:
```typescript
constructor() {
  persistenceStore.loadRecents();
}
```

**Step 1:** Update all methods.

**Step 2:** Run type check, fix errors.

**Step 3:** Commit.

---

### Task 6: Update Sidebar for File-Based Projects
**Files:**
- Modify: `src/lib/components/app-sidebar.svelte`

The sidebar currently shows `projectStore.projects` (the in-memory array). Replace with:

1. **Header dropdown**: "Open Folder" + "New Project Folder" (instead of the old project list)
2. **Recent Projects**: Read from `persistenceStore.recentProjects` instead of `projectStore.projects`
3. **Active indicator**: Compare `persistenceStore.activeDirHandle` to each recent's handle
4. **Remove from recents**: Trash icon calls `persistenceStore.forgetRecent(id)` instead of deleting the project

```svelte
<script>
  import { ganttStore } from '$lib/stores/gantt/index.js';
  import { projectStore } from '$lib/stores/project/index.js';
  import { persistenceStore } from '$lib/stores/persistence/index.js';

  let recentProjects = $derived(persistenceStore.recentProjects);
  let activeProject = $derived(projectStore.project);

  async function handleOpenFolder() {
    await ganttStore.openFolder();
  }

  async function handleNewProject() {
    await ganttStore.createProjectFolder();
  }

  async function handleOpenRecent(entry: RecentEntry) {
    await ganttStore.openProject(entry);
  }

  async function handleForgetRecent(id: string, e: MouseEvent) {
    e.stopPropagation();
    await persistenceStore.forgetRecent(id);
  }
</script>

<!-- Dropdown menu -->
<DropdownMenu.Item onclick={handleOpenFolder}>
  <FolderOpenIcon class="size-4" />
  <span>Open Folder</span>
</DropdownMenu.Item>
<DropdownMenu.Item onclick={handleNewProject}>
  <FolderIcon class="size-4" />
  <span>New Project Folder</span>
</DropdownMenu.Item>

<!-- Recent Projects list -->
{#each recentProjects as entry (entry.id)}
  <Sidebar.MenuButton onclick={() => handleOpenRecent(entry)}>
    <span class="size-2 shrink-0 rounded-full bg-muted-foreground/40"></span>
    <span class="flex-1 truncate">{entry.name}</span>
  </Sidebar.MenuButton>
{/each}
```

**Step 1:** Rewrite the sidebar.

**Step 2:** Run type check.

**Step 3:** Commit.

---

### Task 7: Add Save Status Indicator
**Files:**
- Modify: `src/lib/components/gantt-pane.svelte`

Show a subtle save status in the toolbar — users need feedback that their changes are being persisted.

Add next to the breadcrumb (or at the far right):
```svelte
{#if persistenceStore.activeDirHandle}
  <span class="text-xs text-muted-foreground">
    {#if persistenceStore.isSaving}
      Saving...
    {:else if persistenceStore.error}
      <span class="text-destructive">{persistenceStore.error}</span>
    {:else if persistenceStore.lastSaved}
      Saved
    {/if}
  </span>
{/if}
```

**Step 1:** Add the indicator.

**Step 2:** Run type check.

**Step 3:** Commit.

---

### Task 8: Handle First Launch (No Project Loaded)
**Files:**
- Modify: `src/lib/components/gantt-chart.svelte` (or gantt-pane)

On first launch with no project folder opened, show a welcome screen instead of sample data:

```svelte
{#if !persistenceStore.activeDirHandle && persistenceStore.recentProjects.length === 0}
  <!-- Welcome: no project loaded and no recents -->
  <div class="flex h-full flex-col items-center justify-center gap-4">
    <h2 class="text-lg font-semibold">Welcome to Gantt App</h2>
    <p class="text-sm text-muted-foreground">Open an existing project or create a new one</p>
    <div class="flex gap-2">
      <Button onclick={() => ganttStore.openFolder()}>Open Folder</Button>
      <Button variant="outline" onclick={() => ganttStore.createProjectFolder()}>New Project</Button>
    </div>
  </div>
{:else}
  <!-- Normal gantt view -->
  <GanttChart />
{/if}
```

Actually — keep the sample project as the default so the app is immediately usable. The welcome screen only shows if the user has never opened any project AND the default sample data is empty. For now, keep sample data as the fallback but mark it clearly as "Demo Project".

**Step 1:** Update the empty state and add buttons for opening/creating.

**Step 2:** Run type check.

**Step 3:** Commit.

---

### Task 9: Final Integration & Testing

**Step 1:** Run full type check: `npx svelte-check --tsconfig ./tsconfig.json`

**Step 2:** Open the app and test:
1. App loads with sample project (no file system needed)
2. Click "New Project Folder" → pick an empty folder → creates `.ganttapp` + `project.json`
3. Add some tasks → verify `project.json` updates on disk (debounced)
4. Refresh the page → recent projects show in sidebar
5. Click a recent project → loads from disk
6. Click "Open Folder" → pick the project folder → loads
7. Modify tasks → auto-save triggers
8. Save indicator shows "Saving..." then "Saved"

**Step 3:** Commit final integration.

---

## Testing Checklist

1. **Sample project fallback** — app works without File System Access API (Firefox, etc.)
2. **New project creation** — folder picker → `.ganttapp` + `project.json` written
3. **Auto-save** — change a task name → `project.json` updates within 500ms
4. **Open existing project** — folder picker → validates `.ganttapp` → loads `project.json`
5. **Recent projects** — survive page reload via IndexedDB handles
6. **Permission re-grant** — after reload, clicking recent may prompt for permission
7. **Invalid folder** — opening a non-project folder shows error message
8. **Already-a-project** — creating in a folder that has `.ganttapp` shows error
9. **Save status** — shows "Saving..." during write, "Saved" after
10. **Error handling** — shows error if write fails (e.g. folder deleted)

---

## Out of Scope

- Multi-file project format (splitting children into separate files)
- File watching (detecting external changes)
- Conflict resolution
- Encryption
- Cloud sync
- Import/export (separate feature)
