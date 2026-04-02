# LLM Project Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically export a `project_llm.json` alongside `project.json` on every save, containing a lean, LLM-friendly view of the project with an "Up Next" section.

**Architecture:** A pure function `buildLlmExport(project, priorityItems)` transforms the full project + priority store output into a stripped-down JSON structure. Both persistence paths (Tauri + Browser FS) call it during save and write the second file.

**Tech Stack:** TypeScript, existing persistence layer, existing PriorityStore

---

### Task 1: Create the LLM export builder function

**Files:**
- Create: `src/lib/stores/persistence/llmExport.ts`

**Step 1: Write the export builder**

This pure function takes the project and priority items and returns a clean object. It strips: `color`, `expanded`, `kanbanColumnId`, `isMilestone` (unless true), empty arrays, and IDs (uses names for dependencies instead).

```typescript
import type { Project, GanttNode } from '$lib/types';
import type { PriorityItem } from '../priority/priorityStore.svelte.js';

interface LlmTask {
  name: string;
  progress: number;
  startDate: string;
  endDate: string;
  description?: string;
  isMilestone?: true;
  dependencies?: string[];
  todos?: { text: string; done: boolean }[];
  children?: LlmTask[];
}

interface LlmUpNextItem {
  name: string;
  progress: number;
  reason: string;
  blockedBy?: string[];
  unblocksCount?: number;
}

interface LlmExport {
  name: string;
  description?: string;
  upNext: LlmUpNextItem[];
  blocked: LlmUpNextItem[];
  tasks: LlmTask[];
}

function buildLlmTask(node: GanttNode, allNodes: GanttNode[]): LlmTask {
  const task: LlmTask = {
    name: node.name,
    progress: node.progress,
    startDate: node.startDate,
    endDate: node.endDate,
  };
  if (node.description) task.description = node.description;
  if (node.isMilestone) task.isMilestone = true;
  if (node.dependencies.length > 0) {
    task.dependencies = node.dependencies.map(d => d.targetName ?? d.targetId);
  }
  if (node.todos.length > 0) {
    task.todos = node.todos.map(t => ({ text: t.text, done: t.done }));
  }
  if (node.children.length > 0) {
    task.children = node.children.map(c => buildLlmTask(c, allNodes));
  }
  return task;
}

function buildUpNextItem(item: PriorityItem): LlmUpNextItem {
  const entry: LlmUpNextItem = {
    name: item.task.name,
    progress: item.progress,
    reason: item.reason,
  };
  if (item.blockedBy.length > 0) entry.blockedBy = item.blockedBy;
  if (item.unblocksCount > 0) entry.unblocksCount = item.unblocksCount;
  return entry;
}

export function buildLlmExport(
  project: Project,
  readyItems: PriorityItem[],
  blockedItems: PriorityItem[],
): LlmExport {
  const allNodes: GanttNode[] = [];
  const collect = (nodes: GanttNode[]) => {
    for (const n of nodes) { allNodes.push(n); collect(n.children); }
  };
  collect(project.children);

  const result: LlmExport = {
    name: project.name,
    tasks: project.children.map(c => buildLlmTask(c, allNodes)),
    upNext: readyItems.map(buildUpNextItem),
    blocked: blockedItems.map(buildUpNextItem),
  };
  if (project.description) result.description = project.description;
  return result;
}
```

**Step 2: Commit**

```bash
git add src/lib/stores/persistence/llmExport.ts
git commit -m "feat: add LLM export builder function"
```

---

### Task 2: Wire LLM export into Tauri persistence

**Files:**
- Modify: `src/lib/stores/persistence/fileSystem.ts` (add `writeLlmExport` function)
- Modify: `src/lib/stores/persistence/persistenceStore.svelte.ts` (call it during save)

**Step 1: Add writeLlmExport to fileSystem.ts**

After the existing `writeProject` function, add:

```typescript
const LLM_EXPORT_FILE = 'project_llm.json';

export async function writeLlmExport(dirPath: string, data: object): Promise<void> {
  const filePath = await join(dirPath, LLM_EXPORT_FILE);
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
}
```

**Step 2: Import and call in persistenceStore**

In `persistenceStore.svelte.ts`:
- Import `writeLlmExport as writeLlmExportTauri` from `./fileSystem.js`
- Import `buildLlmExport` from `./llmExport.js`
- Import `priorityStore` from `../priority/index.js`
- In `_doSave`, after writing `project.json`, also write the LLM export:

```typescript
// Inside _doSave, after the existing writeProject call:
const llmData = buildLlmExport(project, priorityStore.readyItems, priorityStore.blockedItems);
if (isTauri && this.activeDirPath) {
  await writeLlmExportTauri(this.activeDirPath, llmData);
}
```

**Step 3: Commit**

```bash
git add src/lib/stores/persistence/fileSystem.ts src/lib/stores/persistence/persistenceStore.svelte.ts
git commit -m "feat: write project_llm.json on every Tauri save"
```

---

### Task 3: Wire LLM export into Browser FS persistence

**Files:**
- Modify: `src/lib/stores/persistence/fileSystemBrowser.ts` (add `writeLlmExportBrowser`)
- Modify: `src/lib/stores/persistence/persistenceStore.svelte.ts` (add browser path)

**Step 1: Add writeLlmExportBrowser**

In `fileSystemBrowser.ts`, after `writeProjectBrowser`:

```typescript
const LLM_EXPORT_FILE = 'project_llm.json';

export async function writeLlmExportBrowser(dirHandle: FileSystemDirectoryHandle, data: object): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(LLM_EXPORT_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}
```

**Step 2: Add browser path in persistenceStore._doSave**

```typescript
// After the existing browser writeProject call:
else if (this.isBrowserFS) {
  const handle = getActiveDirHandle();
  if (handle) {
    await writeProjectBrowser(handle, project);
    await writeLlmExportBrowser(handle, llmData);
  }
}
```

Note: compute `llmData` once before the if/else branch so both paths use it.

**Step 3: Commit**

```bash
git add src/lib/stores/persistence/fileSystemBrowser.ts src/lib/stores/persistence/persistenceStore.svelte.ts
git commit -m "feat: write project_llm.json on browser FS save"
```

---

### Task 4: Type check and verify

**Step 1: Run type checker**

```bash
npm run check
```

Expected: 0 errors.

**Step 2: Manual test**

- Open a project in dev mode
- Make any change (edit a task name)
- Verify `project_llm.json` appears alongside `project.json`
- Verify it contains `upNext`, `blocked`, and `tasks` with no `color`, `expanded`, `kanbanColumnId`, or `id` fields

**Step 3: Final commit if any fixes needed**
