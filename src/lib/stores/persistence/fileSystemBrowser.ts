import type { Project } from '$lib/types';

const MARKER_FILE = '.ganttapp';
const PROJECT_FILE = 'project.json';
const MARKER_VERSION = 1;

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
  return 'FS';
}

function migrateProject(project: Project): Project {
  if (!project.kanbanColumns) {
    project.kanbanColumns = [{ id: 'backlog', name: 'Backlog' }];
  }
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

// ---- Browser File System Access API ----

// We store the active dir handle so persistence store can use it
let _activeDirHandle: FileSystemDirectoryHandle | null = null;

export function getActiveDirHandle(): FileSystemDirectoryHandle | null {
  return _activeDirHandle;
}

export function setActiveDirHandle(handle: FileSystemDirectoryHandle | null): void {
  _activeDirHandle = handle;
}

async function verifyPermission(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as FileSystemPermissionMode };
  if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
  if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
  return false;
}

export async function isGanttProjectBrowser(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(MARKER_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function readProjectBrowser(dirHandle: FileSystemDirectoryHandle): Promise<Project> {
  const fileHandle = await dirHandle.getFileHandle(PROJECT_FILE);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return migrateProject(JSON.parse(text) as Project);
}

export async function writeProjectBrowser(dirHandle: FileSystemDirectoryHandle, project: Project): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(PROJECT_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(project, null, 2));
  await writable.close();
}

const LLM_EXPORT_FILE = 'project_llm.json';

export async function writeLlmExportBrowser(dirHandle: FileSystemDirectoryHandle, data: object): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(LLM_EXPORT_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

export async function writeMarkerBrowser(dirHandle: FileSystemDirectoryHandle): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(MARKER_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify({ version: MARKER_VERSION, createdAt: new Date().toISOString().slice(0, 10) }, null, 2));
  await writable.close();
}

export async function pickProjectFolderBrowser(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return null;
  }
}

export { verifyPermission };
