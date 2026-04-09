import { readTextFile, writeTextFile, exists, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';

const RECENTS_FILE = 'recent-projects.json';

export interface RecentEntry {
  id: string;
  name: string;
  lastOpened: string;
  /** Absolute path to the project directory on disk. */
  dirPath: string;
}

async function ensureAppDataDir(): Promise<void> {
  if (!(await exists('', { baseDir: BaseDirectory.AppData }))) {
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

async function readRecents(): Promise<RecentEntry[]> {
  await ensureAppDataDir();
  if (!(await exists(RECENTS_FILE, { baseDir: BaseDirectory.AppData }))) return [];
  try {
    const text = await readTextFile(RECENTS_FILE, { baseDir: BaseDirectory.AppData });
    return JSON.parse(text) as RecentEntry[];
  } catch {
    return [];
  }
}

async function writeRecents(entries: RecentEntry[]): Promise<void> {
  await ensureAppDataDir();
  await writeTextFile(RECENTS_FILE, JSON.stringify(entries, null, 2), { baseDir: BaseDirectory.AppData });
}

export async function getRecentProjects(): Promise<RecentEntry[]> {
  const entries = await readRecents();
  return entries.sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
}

export async function saveRecentProject(entry: RecentEntry): Promise<void> {
  const entries = await readRecents();
  const idx = entries.findIndex(e => e.id === entry.id);
  if (idx !== -1) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  await writeRecents(entries);
}

export async function removeRecentProject(id: string): Promise<void> {
  const entries = await readRecents();
  await writeRecents(entries.filter(e => e.id !== id));
}
