/** Returns true when running inside a Tauri webview. */
export const isTauri: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
