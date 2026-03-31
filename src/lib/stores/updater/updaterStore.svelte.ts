import { isTauri } from '../persistence/isTauri.js';

class UpdaterStore {
  available = $state(false);
  version = $state<string | null>(null);
  checking = $state(false);
  downloading = $state(false);
  error = $state<string | null>(null);

  private _update: Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>> | null = null;

  async check(): Promise<void> {
    if (!isTauri) return;
    this.checking = true;
    this.error = null;
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        this.available = true;
        this.version = update.version;
        this._update = update;
      } else {
        this.available = false;
        this.version = null;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.checking = false;
    }
  }

  async install(): Promise<void> {
    if (!this._update) return;
    this.downloading = true;
    this.error = null;
    try {
      await this._update.downloadAndInstall();
      // Relaunch after install
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.downloading = false;
    }
  }
}

export const updaterStore = new UpdaterStore();
