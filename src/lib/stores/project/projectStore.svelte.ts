import type { Project } from '$lib/types';

// ---------------------------------------------------------------------------
// Empty default project (shown before any folder is opened)
// ---------------------------------------------------------------------------

const EMPTY_PROJECT: Project = {
  id: 'empty',
  name: 'No Project',
  description: '',
  children: [],
  kanbanColumns: [{ id: 'backlog', name: 'Backlog' }],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class ProjectStore {
  project = $state<Project>(structuredClone(EMPTY_PROJECT));

  loadProject(project: Project): void {
    this.project = project;
  }
}

export const projectStore = new ProjectStore();
