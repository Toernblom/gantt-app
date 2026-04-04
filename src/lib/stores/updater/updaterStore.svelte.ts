import { isTauri } from '../persistence/isTauri.js';

const LAST_SEEN_VERSION_KEY = 'ganttapp_last_seen_version';

class UpdaterStore {
  available = $state(false);
  version = $state<string | null>(null);
  checking = $state(false);
  downloading = $state(false);
  error = $state<string | null>(null);

  /** Set to true when the app version changed since last launch — drives the "What's New" dialog. */
  showChangelog = $state(false);
  /** The version that was just installed. */
  updatedToVersion = $state<string | null>(null);
  /** Release notes from the update (if available). */
  changelogBody = $state<string | null>(null);

  private _update: Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>> | null = null;

  async check(): Promise<void> {
    if (!isTauri) return;
    this.checking = true;
    this.error = null;
    try {
      // Detect version change (works even if installer clears nothing)
      await this._detectVersionChange();

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
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
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

  /** Manually show the changelog for the current running version. */
  async showCurrentChangelog(): Promise<void> {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      const currentVersion = await getVersion();
      this.updatedToVersion = currentVersion;
      this.changelogBody = null;
      this.showChangelog = true;
      this._fetchReleaseNotes(currentVersion);
    } catch {
      // Not in Tauri — ignore
    }
  }

  /**
   * Compare the running app version against the last seen version in localStorage.
   * If different, the app was updated — show the changelog dialog.
   * Works regardless of how the update was installed (auto-update, manual reinstall, etc.)
   */
  private async _detectVersionChange(): Promise<void> {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      const currentVersion = await getVersion();
      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);

      if (lastSeen && lastSeen !== currentVersion) {
        // Version changed — show changelog
        this.updatedToVersion = currentVersion;
        this.showChangelog = true;
        // Try to fetch release notes from GitHub
        this._fetchReleaseNotes(currentVersion);
      }

      // Always update the stored version
      localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
    } catch {
      // Tauri API not available or localStorage error — ignore
    }
  }

  /** Fetch release notes from the GitHub release for this version. */
  private async _fetchReleaseNotes(version: string): Promise<void> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/Toernblom/gantt-app/releases/tags/v${version}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.body) {
          this.changelogBody = data.body;
        }
      }
    } catch {
      // Network error — changelog body stays null, dialog shows fallback text
    }
  }
}

export const updaterStore = new UpdaterStore();
