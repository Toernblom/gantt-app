import type { Project } from '$lib/types';

const MARKER_FILE = '.ganttapp';
const PROJECT_FILE = 'project.json';
const MARKER_VERSION = 1;

/** Check if a directory contains a .ganttapp marker. */
export async function isGanttProject(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(MARKER_FILE);
    return true;
  } catch {
    return false;
  }
}

/** Normalize dependency type strings that LLMs or humans may write longhand. */
const DEP_TYPE_ALIASES: Record<string, string> = {
  'finish-to-start': 'FS', 'finish to start': 'FS',
  'start-to-start': 'SS',  'start to start': 'SS',
  'finish-to-finish': 'FF','finish to finish': 'FF',
  'start-to-finish': 'SF', 'start to finish': 'SF',
  'fs': 'FS', 'ss': 'SS', 'ff': 'FF', 'sf': 'SF',
};

function normalizeDependencyType(type: string): 'FS' | 'SS' | 'FF' | 'SF' {
  const alias = DEP_TYPE_ALIASES[type.toLowerCase()];
  if (alias) return alias as 'FS' | 'SS' | 'FF' | 'SF';
  if (['FS', 'SS', 'FF', 'SF'].includes(type)) return type as 'FS' | 'SS' | 'FF' | 'SF';
  return 'FS'; // Unknown → default to finish-to-start
}

/** Apply defaults for fields added in newer schema versions (forward-compat migration). */
function migrateProject(project: Project): Project {
  // Ensure kanbanColumns exists
  if (!project.kanbanColumns) {
    project.kanbanColumns = [{ id: 'backlog', name: 'Backlog' }];
  }
  // Ensure every node has todos, kanbanColumnId, and valid dependency types
  function migrateNode(node: Project['children'][number]): void {
    if (!node.todos) node.todos = [];
    if (!node.kanbanColumnId) node.kanbanColumnId = 'backlog';
    for (const dep of node.dependencies ?? []) {
      dep.type = normalizeDependencyType(dep.type);
      if (dep.lag === undefined) dep.lag = 0;
    }
    for (const child of node.children ?? []) {
      migrateNode(child);
    }
  }
  for (const node of project.children ?? []) {
    migrateNode(node);
  }
  return project;
}

/** Read and parse project.json from a directory. */
export async function readProject(dirHandle: FileSystemDirectoryHandle): Promise<Project> {
  const fileHandle = await dirHandle.getFileHandle(PROJECT_FILE);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return migrateProject(JSON.parse(text) as Project);
}

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
  await writable.write(JSON.stringify({ version: MARKER_VERSION, createdAt: new Date().toISOString().slice(0, 10) }, null, 2));
  await writable.close();
}

/** Open directory picker. Returns null if user cancels. */
export async function pickProjectFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return null;
  }
}

/** Request readwrite permission on a stored handle. */
export async function verifyPermission(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as FileSystemPermissionMode };
  if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
  if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
  return false;
}
