import { isTauri } from '../persistence/isTauri.js';

const PENDING_UPDATE_KEY = 'ganttapp_pending_update_version';
const CHANGELOG_KEY = 'ganttapp_changelog';

class UpdaterStore {
  available = $state(false);
  version = $state<string | null>(null);
  checking = $state(false);
  downloading = $state(false);
  error = $state<string | null>(null);

  /** Set to true when the app just updated — drives the "What's New" dialog. */
  showChangelog = $state(false);
  /** The version that was just installed. */
  updatedToVersion = $state<string | null>(null);
  /** Release notes for the just-installed version. */
  changelogBody = $state<string | null>(null);

  private _update: Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>> | null = null;

  async check(): Promise<void> {
    if (!isTauri) return;
    this.checking = true;
    this.error = null;
    try {
      // Check if we just rebooted after an update
      this._checkPostUpdate();

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
      // Save version + notes before relaunch so we can show changelog after restart
      if (this._update.version) {
        localStorage.setItem(PENDING_UPDATE_KEY, this._update.version);
        if (this._update.body) {
          localStorage.setItem(CHANGELOG_KEY, this._update.body);
        }
      }

      await this._update.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      // Clear the pending flag if install failed
      localStorage.removeItem(PENDING_UPDATE_KEY);
      localStorage.removeItem(CHANGELOG_KEY);
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Update install failed:', msg);
      this.error = msg;
      this.downloading = false;
      return;
    }
    this.downloading = false;
  }

  dismissChangelog(): void {
    this.showChangelog = false;
    this.updatedToVersion = null;
    this.changelogBody = null;
  }

  /** Check localStorage for a pending update flag left before relaunch. */
  private _checkPostUpdate(): void {
    try {
      const pendingVersion = localStorage.getItem(PENDING_UPDATE_KEY);
      if (pendingVersion) {
        this.updatedToVersion = pendingVersion;
        this.changelogBody = localStorage.getItem(CHANGELOG_KEY);
        this.showChangelog = true;
        localStorage.removeItem(PENDING_UPDATE_KEY);
        localStorage.removeItem(CHANGELOG_KEY);
      }
    } catch {
      // localStorage not available — ignore
    }
  }
}

export const updaterStore = new UpdaterStore();
