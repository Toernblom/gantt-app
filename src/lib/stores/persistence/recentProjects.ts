import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

const RECENTS_FILE = 'recent-projects.json';

export interface RecentEntry {
  id: string;
  name: string;
  lastOpened: string;
  /** Absolute path to the project directory on disk. */
  dirPath: string;
}

async function getRecentsPath(): Promise<string> {
  const appDir = await appDataDir();
  // Ensure the app data directory exists
  if (!(await exists(appDir))) {
    await mkdir(appDir, { recursive: true });
  }
  return join(appDir, RECENTS_FILE);
}

async function readRecents(): Promise<RecentEntry[]> {
  const path = await getRecentsPath();
  if (!(await exists(path))) return [];
  try {
    const text = await readTextFile(path);
    return JSON.parse(text) as RecentEntry[];
  } catch {
    return [];
  }
}

async function writeRecents(entries: RecentEntry[]): Promise<void> {
  const path = await getRecentsPath();
  await writeTextFile(path, JSON.stringify(entries, null, 2));
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
