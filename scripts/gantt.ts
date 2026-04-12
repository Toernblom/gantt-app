/**
 * Gantt App CLI — query and mutate project.json from the terminal.
 * Designed for LLM agents but works for humans too.
 *
 * Dev:  npm run gantt -- <command>
 * Prod: node gantt-cli.js <command>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types (mirrored from src/lib/types.ts to avoid $lib alias issues with tsx)
// ---------------------------------------------------------------------------

type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

interface Dependency {
  targetId: string;
  targetName?: string;
  type: DependencyType;
  lag: number;
}

interface KanbanColumn {
  id: string;
  name: string;
}

interface GanttNode {
  id: string;
  name: string;
  color: string;
  startDate: string;
  endDate: string;
  progress: number;
  description?: string;
  isMilestone: boolean;
  expanded: boolean;
  children: GanttNode[];
  dependencies: Dependency[];
  todos: Todo[];
  kanbanColumnId: string;
  requireDepsComplete?: boolean;
  hideFromPriority?: boolean;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  children: GanttNode[];
  kanbanColumns: KanbanColumn[];
}

// ---------------------------------------------------------------------------
// Tree helpers (from src/lib/stores/gantt/helpers.ts)
// ---------------------------------------------------------------------------

function findNodeById(nodes: GanttNode[], id: string): GanttNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

function deleteNodeById(nodes: GanttNode[], id: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) { nodes.splice(i, 1); return true; }
    if (deleteNodeById(nodes[i].children, id)) return true;
  }
  return false;
}

function cleanDependencies(nodes: GanttNode[], deletedId: string): void {
  for (const node of nodes) {
    node.dependencies = node.dependencies.filter(d => d.targetId !== deletedId);
    cleanDependencies(node.children, deletedId);
  }
}

function collectAll(nodes: GanttNode[]): GanttNode[] {
  const result: GanttNode[] = [];
  for (const n of nodes) {
    result.push(n);
    result.push(...collectAll(n.children));
  }
  return result;
}

function effectiveProgress(node: GanttNode): number {
  if (node.children.length > 0) {
    let totalWeight = 0, weightedSum = 0;
    for (const child of node.children) {
      const cp = effectiveProgress(child);
      const days = Math.max(1, Math.round((new Date(child.endDate).getTime() - new Date(child.startDate).getTime()) / 86_400_000) + 1);
      weightedSum += cp * days;
      totalWeight += days;
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }
  if (node.todos && node.todos.length > 0) {
    const done = node.todos.filter(t => t.done).length;
    return Math.round((done / node.todos.length) * 100);
  }
  return node.progress;
}

function getAncestors(targetId: string, roots: GanttNode[]): GanttNode[] {
  const trail: GanttNode[] = [];
  const find = (nodes: GanttNode[], path: GanttNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === targetId) { trail.push(...path); return true; }
      if (node.children.length > 0 && find(node.children, [...path, node])) return true;
    }
    return false;
  };
  find(roots, []);
  return trail;
}

function findParentOf(nodes: GanttNode[], targetId: string): GanttNode | null {
  for (const node of nodes) {
    for (const child of node.children) {
      if (child.id === targetId) return node;
    }
    const found = findParentOf(node.children, targetId);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Migration (from src/lib/stores/persistence/fileSystem.ts)
// ---------------------------------------------------------------------------

const DEP_TYPE_ALIASES: Record<string, string> = {
  'finish-to-start': 'FS', 'finish to start': 'FS',
  'start-to-start': 'SS', 'start to start': 'SS',
  'finish-to-finish': 'FF', 'finish to finish': 'FF',
  'start-to-finish': 'SF', 'start to finish': 'SF',
  fs: 'FS', ss: 'SS', ff: 'FF', sf: 'SF',
};

function normalizeDependencyType(type: string): DependencyType {
  return (DEP_TYPE_ALIASES[type.toLowerCase()] ?? ((['FS', 'SS', 'FF', 'SF'].includes(type)) ? type : 'FS')) as DependencyType;
}

function migrateProject(project: Project): Project {
  if (!project.kanbanColumns) project.kanbanColumns = [{ id: 'backlog', name: 'Backlog' }];
  function migrateNode(node: GanttNode): void {
    if (!node.todos) node.todos = [];
    if (!node.kanbanColumnId) node.kanbanColumnId = 'backlog';
    if (!node.dependencies) node.dependencies = [];
    if (!node.children) node.children = [];
    for (const dep of node.dependencies) {
      dep.type = normalizeDependencyType(dep.type);
      if (dep.lag === undefined) dep.lag = 0;
    }
    for (const child of node.children) migrateNode(child);
  }
  for (const node of project.children ?? []) migrateNode(node);
  return project;
}

// ---------------------------------------------------------------------------
// Project discovery
// ---------------------------------------------------------------------------

function discoverProjectDir(startDir?: string): string {
  let dir = startDir ? path.resolve(startDir) : process.cwd();
  const root = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, '.ganttapp'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir || parent === root) break;
    dir = parent;
  }
  die('No .ganttapp project found. Walk up from CWD failed. Use --project <path> to specify.');
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function readProject(dir: string): Project {
  const filePath = path.join(dir, 'project.json');
  if (!fs.existsSync(filePath)) die(`project.json not found in ${dir}`);
  const text = fs.readFileSync(filePath, 'utf-8');
  return migrateProject(JSON.parse(text) as Project);
}

/** Atomic write: write to .tmp, then rename over the target. */
function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function writeProject(dir: string, project: Project): void {
  atomicWrite(path.join(dir, 'project.json'), JSON.stringify(project, null, 2));
}

// ---------------------------------------------------------------------------
// LLM export (from src/lib/stores/persistence/llmExport.ts + priority logic)
// ---------------------------------------------------------------------------

interface PriorityItem {
  task: GanttNode;
  progress: number;
  score: number;
  ready: boolean;
  blockedBy: string[];
  unblocksCount: number;
  reason: string;
}

function computePriority(project: Project): { ready: PriorityItem[]; blocked: PriorityItem[] } {
  const allNodes = collectAll(project.children);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const unblocksMap = new Map<string, number>();
  for (const node of allNodes) {
    for (const dep of node.dependencies) {
      unblocksMap.set(dep.targetId, (unblocksMap.get(dep.targetId) ?? 0) + 1);
    }
  }

  const items: PriorityItem[] = [];

  for (const task of allNodes) {
    const progress = effectiveProgress(task);
    if (progress >= 100 || task.isMilestone || task.children.length > 0) continue;
    if (task.hideFromPriority) continue;
    const ancestors = getAncestors(task.id, project.children);
    if (ancestors.some(a => a.hideFromPriority)) continue;

    let score = 0;
    const reasons: string[] = [];

    // Dependency readiness
    const blockedBy: string[] = [];
    for (const dep of task.dependencies) {
      const target = findNodeById(project.children, dep.targetId);
      if (target && effectiveProgress(target) < 100) blockedBy.push(target.name);
    }
    for (const ancestor of ancestors) {
      if (!ancestor.requireDepsComplete) continue;
      for (const dep of ancestor.dependencies) {
        const target = findNodeById(project.children, dep.targetId);
        if (target && effectiveProgress(target) < 100 && !blockedBy.includes(target.name)) {
          blockedBy.push(target.name);
        }
      }
    }
    const ready = blockedBy.length === 0;
    if (!ready) { score -= 1000; reasons.push(`Blocked by ${blockedBy.length} task${blockedBy.length > 1 ? 's' : ''}`); }

    if (progress > 0) { score += 25; reasons.push(`${progress}% done`); }

    const unblocksCount = unblocksMap.get(task.id) ?? 0;
    if (unblocksCount > 0) { score += unblocksCount * 10; reasons.push(`Unblocks ${unblocksCount} task${unblocksCount > 1 ? 's' : ''}`); }

    const start = new Date(task.startDate); start.setHours(0, 0, 0, 0);
    const daysUntil = Math.round((start.getTime() - today.getTime()) / 86_400_000);
    if (daysUntil <= 0) { score += 30; reasons.push(daysUntil < 0 ? `Started ${-daysUntil}d ago` : 'Starts today'); }
    else if (daysUntil <= 7) { score += 15; reasons.push(`Starts in ${daysUntil}d`); }

    const incompleteTodos = task.todos.filter(t => !t.done).length;
    if (incompleteTodos > 0) { score += 5; reasons.push(`${incompleteTodos} todo${incompleteTodos > 1 ? 's' : ''} left`); }

    if (reasons.length === 0 && ready) reasons.push('Ready to start');

    items.push({ task, progress, score, ready, blockedBy, unblocksCount, reason: reasons[0] ?? '' });
  }

  items.sort((a, b) => b.score - a.score);
  return { ready: items.filter(i => i.ready), blocked: items.filter(i => !i.ready) };
}

function buildLlmExport(project: Project): object {
  const { ready, blocked } = computePriority(project);

  function buildTask(node: GanttNode): object {
    const t: Record<string, unknown> = {
      name: node.name,
      progress: effectiveProgress(node),
      startDate: node.startDate,
      endDate: node.endDate,
    };
    if (node.description) t.description = node.description;
    if (node.isMilestone) t.isMilestone = true;
    if (node.dependencies.length > 0) t.dependencies = node.dependencies.map(d => d.targetName ?? d.targetId);
    if (node.todos.length > 0) t.todos = node.todos.map(td => ({ text: td.text, done: td.done }));
    if (node.children.length > 0) t.children = node.children.map(c => buildTask(c));
    return t;
  }

  function buildUpNext(item: PriorityItem): object {
    const e: Record<string, unknown> = { name: item.task.name, progress: item.progress, reason: item.reason };
    if (item.blockedBy.length > 0) e.blockedBy = item.blockedBy;
    if (item.unblocksCount > 0) e.unblocksCount = item.unblocksCount;
    return e;
  }

  const result: Record<string, unknown> = {
    _comment: 'READ-ONLY. Auto-generated from project.json. Edit project.json to make changes.',
    name: project.name,
    tasks: project.children.map(c => buildTask(c)),
    upNext: ready.map(buildUpNext),
    blocked: blocked.map(buildUpNext),
  };
  if (project.description) result.description = project.description;
  return result;
}

function writeLlmExport(dir: string, project: Project): void {
  const data = buildLlmExport(project);
  atomicWrite(path.join(dir, 'project_llm.json'), JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Task & todo reference resolver
// ---------------------------------------------------------------------------

function resolveTask(project: Project, ref: string): GanttNode {
  const all = collectAll(project.children);

  // Try exact ID match
  const byId = all.find(n => n.id === ref);
  if (byId) return byId;

  // Try ID prefix match
  const byPrefix = all.filter(n => n.id.startsWith(ref));
  if (byPrefix.length === 1) return byPrefix[0];
  if (byPrefix.length > 1) die(`Ambiguous ID prefix "${ref}" — matches ${byPrefix.length} tasks: ${byPrefix.map(n => n.name).join(', ')}`);

  // Fuzzy name match (case-insensitive substring)
  const lower = ref.toLowerCase();
  const byName = all.filter(n => n.name.toLowerCase().includes(lower));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) die(`Ambiguous name "${ref}" — matches ${byName.length} tasks: ${byName.map(n => n.name).join(', ')}`);

  die(`No task found matching "${ref}"`);
}

function resolveTodo(project: Project, ref: string): { task: GanttNode; todo: Todo } {
  const all = collectAll(project.children);

  // Try ID match or prefix
  for (const node of all) {
    for (const todo of node.todos) {
      if (todo.id === ref || todo.id.startsWith(ref)) return { task: node, todo };
    }
  }

  // Fuzzy text match
  const lower = ref.toLowerCase();
  const matches: { task: GanttNode; todo: Todo }[] = [];
  for (const node of all) {
    for (const todo of node.todos) {
      if (todo.text.toLowerCase().includes(lower)) matches.push({ task: node, todo });
    }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) die(`Ambiguous todo "${ref}" — matches ${matches.length} todos: ${matches.map(m => m.todo.text).join(', ')}`);

  die(`No todo found matching "${ref}"`);
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function printTree(nodes: GanttNode[], indent = '', showDates = false): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const branch = indent ? (isLast ? '└─ ' : '├─ ') : '';
    const prog = effectiveProgress(node);
    const marker = node.isMilestone ? ' ◆' : '';
    const pct = prog > 0 ? ` [${prog}%]` : '';
    const dates = showDates ? `  (${node.startDate} → ${node.endDate})` : '';
    console.log(`${indent}${branch}${node.name}${marker}${pct}${dates}`);

    if (node.children.length > 0) {
      const childIndent = indent + (indent ? (isLast ? '   ' : '│  ') : '  ');
      printTree(node.children, childIndent, showDates);
    }
  }
}

function printTaskDetail(node: GanttNode, project: Project): void {
  const prog = effectiveProgress(node);
  console.log(`Name:     ${node.name}`);
  console.log(`ID:       ${node.id}`);
  console.log(`Dates:    ${node.startDate} → ${node.endDate}`);
  console.log(`Progress: ${prog}%`);
  if (node.color) console.log(`Color:    ${node.color}`);
  if (node.isMilestone) console.log(`Type:     Milestone`);
  if (node.description) console.log(`\nDescription:\n${node.description}`);
  if (node.dependencies.length > 0) {
    console.log(`\nDependencies:`);
    for (const dep of node.dependencies) {
      const target = findNodeById(project.children, dep.targetId);
      const name = target?.name ?? dep.targetId;
      console.log(`  ${dep.type} → ${name}${dep.lag ? ` (lag: ${dep.lag}d)` : ''}`);
    }
  }
  if (node.todos.length > 0) {
    console.log(`\nTodos:`);
    for (const todo of node.todos) {
      console.log(`  ${todo.done ? '[x]' : '[ ]'} ${todo.text}  (${todo.id})`);
    }
  }
  if (node.children.length > 0) {
    console.log(`\nSubtasks:`);
    printTree(node.children, '  ');
  }
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function newNodeId(): string { return `node-${Date.now()}`; }
function newTodoId(): string { return `todo-${Date.now()}`; }

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIso(): string { return isoDate(new Date()); }

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { command: string; positional: string[]; flags: Record<string, string | true> } {
  const command = argv[0] ?? '';
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  let i = 1;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { command, positional, flags };
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList(project: Project, showDates: boolean): void {
  if (project.children.length === 0) { console.log('(no tasks)'); return; }
  console.log(`Project: ${project.name}\n`);
  printTree(project.children, '', showDates);
}

function cmdShow(project: Project, ref: string): void {
  const node = resolveTask(project, ref);
  printTaskDetail(node, project);
}

function cmdUpNext(project: Project): void {
  const { ready, blocked } = computePriority(project);

  if (ready.length === 0 && blocked.length === 0) { console.log('No pending tasks.'); return; }

  if (ready.length > 0) {
    console.log('Ready:\n');
    for (const item of ready) {
      console.log(`  ${item.task.name}  [${item.progress}%]  — ${item.reason}`);
    }
  }

  if (blocked.length > 0) {
    if (ready.length > 0) console.log('');
    console.log('Blocked:\n');
    for (const item of blocked) {
      console.log(`  ${item.task.name}  [${item.progress}%]  — ${item.reason}  (by: ${item.blockedBy.join(', ')})`);
    }
  }
}

function cmdAddTask(
  project: Project,
  dir: string,
  name: string,
  flags: Record<string, string | true>,
): void {
  const parentRef = flags.parent as string | undefined;
  const parentNode = parentRef ? resolveTask(project, parentRef) : null;

  const startDate = (flags.start as string) ?? todayIso();
  const endDate = (flags.end as string) ?? addDays(startDate, 7);
  const color = (flags.color as string) ?? parentNode?.color ?? '#3b82f6';
  const isMilestone = flags.milestone === true;

  const node: GanttNode = {
    id: newNodeId(),
    name,
    color,
    startDate,
    endDate,
    progress: 0,
    isMilestone,
    expanded: true,
    children: [],
    dependencies: [],
    todos: [],
    kanbanColumnId: 'backlog',
  };

  if (parentNode) {
    parentNode.children.push(node);
  } else {
    project.children.push(node);
  }

  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Added task "${name}" (${node.id})`);
}

function cmdUpdate(
  project: Project,
  dir: string,
  ref: string,
  flags: Record<string, string | true>,
): void {
  const node = resolveTask(project, ref);

  if (flags.name) node.name = flags.name as string;
  if (flags.start) node.startDate = flags.start as string;
  if (flags.end) node.endDate = flags.end as string;
  if (flags.progress) node.progress = Math.min(100, Math.max(0, parseInt(flags.progress as string, 10)));
  if (flags.description) node.description = flags.description as string;
  if (flags.color) node.color = flags.color as string;

  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Updated "${node.name}"`);
}

function cmdDelete(project: Project, dir: string, ref: string): void {
  const node = resolveTask(project, ref);
  const name = node.name;
  const id = node.id;
  deleteNodeById(project.children, id);
  cleanDependencies(project.children, id);

  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Deleted "${name}"`);
}

function cmdAddTodo(project: Project, dir: string, taskRef: string, text: string): void {
  const node = resolveTask(project, taskRef);
  const todo: Todo = { id: newTodoId(), text, done: false };
  node.todos.push(todo);

  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Added todo "${text}" to "${node.name}" (${todo.id})`);
}

function cmdToggleTodo(project: Project, dir: string, taskRef: string, todoRef: string): void {
  const node = resolveTask(project, taskRef);
  const lower = todoRef.toLowerCase();
  const todo = node.todos.find(t => t.id === todoRef || t.id.startsWith(todoRef) || t.text.toLowerCase().includes(lower));
  if (!todo) die(`No todo matching "${todoRef}" in task "${node.name}"`);

  todo.done = !todo.done;
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`${todo.done ? 'Completed' : 'Uncompleted'} todo "${todo.text}"`);
}

function cmdRemoveTodo(project: Project, dir: string, taskRef: string, todoRef: string): void {
  const node = resolveTask(project, taskRef);
  const lower = todoRef.toLowerCase();
  const idx = node.todos.findIndex(t => t.id === todoRef || t.id.startsWith(todoRef) || t.text.toLowerCase().includes(lower));
  if (idx === -1) die(`No todo matching "${todoRef}" in task "${node.name}"`);

  const removed = node.todos.splice(idx, 1)[0];
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Removed todo "${removed.text}" from "${node.name}"`);
}

function cmdMoveTodo(project: Project, dir: string, todoRef: string, toTaskRef: string): void {
  const { task: srcTask, todo } = resolveTodo(project, todoRef);
  const dstTask = resolveTask(project, toTaskRef);

  if (srcTask.id === dstTask.id) die(`Todo is already in "${dstTask.name}"`);

  // Remove from source
  srcTask.todos = srcTask.todos.filter(t => t.id !== todo.id);
  // Add to destination
  dstTask.todos.push(todo);

  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Moved todo "${todo.text}" from "${srcTask.name}" to "${dstTask.name}"`);
}

function cmdAddDep(project: Project, dir: string, taskRef: string, onRef: string, depType?: string): void {
  const task = resolveTask(project, taskRef);
  const prerequisite = resolveTask(project, onRef);

  if (task.id === prerequisite.id) die('A task cannot depend on itself');
  if (task.dependencies.some(d => d.targetId === prerequisite.id)) die(`"${task.name}" already depends on "${prerequisite.name}"`);

  const type = depType ? normalizeDependencyType(depType) : 'FS';
  task.dependencies.push({ targetId: prerequisite.id, targetName: prerequisite.name, type, lag: 0 });

  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Added ${type} dependency: "${task.name}" depends on "${prerequisite.name}"`);
}

function cmdRemoveDep(project: Project, dir: string, taskRef: string, onRef: string): void {
  const task = resolveTask(project, taskRef);
  const prerequisite = resolveTask(project, onRef);

  const before = task.dependencies.length;
  task.dependencies = task.dependencies.filter(d => d.targetId !== prerequisite.id);
  if (task.dependencies.length === before) die(`"${task.name}" does not depend on "${prerequisite.name}"`);

  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Removed dependency: "${task.name}" no longer depends on "${prerequisite.name}"`);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Gantt App CLI

Usage: gantt <command> [args] [--flags]

Read commands:
  list [--dates]                     Show task tree
  show <task>                       Show task details
  up-next                           Show priority-sorted ready tasks

Write commands:
  add task "<name>" [flags]         Add a task
    --parent <task>                   Parent task (name or ID)
    --start YYYY-MM-DD                Start date (default: today)
    --end YYYY-MM-DD                  End date (default: start + 7d)
    --color #hex                      Color (default: parent color or #3b82f6)
    --milestone                       Create as milestone
  update <task> [flags]             Update a task
    --name, --start, --end, --progress, --description, --color
  delete <task>                     Delete a task and clean dangling deps

Todo commands:
  add-todo <task> "<text>"          Add a todo to a task
  toggle-todo <task> <todo>         Toggle todo done/undone
  remove-todo <task> <todo>         Remove a todo
  move-todo <todo> --to <task>      Move a todo to another task

Dependency commands:
  add-dep <task> --on <prereq>      Add a dependency (default: FS)
    --type FS|SS|FF|SF                Dependency type
  remove-dep <task> --on <prereq>   Remove a dependency

Options:
  --project <path>                  Project directory (default: auto-discover)
  --help                            Show this help

Task references accept a name (unique substring match) or ID/ID-prefix.
`.trim());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // Strip node/tsx path and script path
  const rawArgs = process.argv.slice(2);

  // Extract --project and --help before command parsing
  let projectPath: string | undefined;
  const filteredArgs: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--project') {
      projectPath = rawArgs[++i];
    } else if (rawArgs[i] === '--help' || rawArgs[i] === '-h') {
      printUsage();
      return;
    } else {
      filteredArgs.push(rawArgs[i]);
    }
  }

  if (filteredArgs.length === 0) { printUsage(); return; }

  const { command, positional, flags } = parseArgs(filteredArgs);
  const dir = projectPath ? path.resolve(projectPath) : discoverProjectDir();
  const project = readProject(dir);

  switch (command) {
    case 'list':
      cmdList(project, flags.dates === true);
      break;

    case 'show':
      if (!positional[0]) die('Usage: gantt show <task>');
      cmdShow(project, positional[0]);
      break;

    case 'up-next':
      cmdUpNext(project);
      break;

    case 'add': {
      const subCmd = positional[0];
      if (subCmd === 'task') {
        if (!positional[1]) die('Usage: gantt add task "<name>" [--parent <task> --start --end --color --milestone]');
        cmdAddTask(project, dir, positional[1], flags);
      } else {
        die(`Unknown sub-command: add ${subCmd}. Did you mean: add task`);
      }
      break;
    }

    case 'update':
      if (!positional[0]) die('Usage: gantt update <task> [--name --start --end --progress --description --color]');
      cmdUpdate(project, dir, positional[0], flags);
      break;

    case 'delete':
      if (!positional[0]) die('Usage: gantt delete <task>');
      cmdDelete(project, dir, positional[0]);
      break;

    case 'add-todo':
      if (!positional[0] || !positional[1]) die('Usage: gantt add-todo <task> "<text>"');
      cmdAddTodo(project, dir, positional[0], positional[1]);
      break;

    case 'toggle-todo':
      if (!positional[0] || !positional[1]) die('Usage: gantt toggle-todo <task> <todo>');
      cmdToggleTodo(project, dir, positional[0], positional[1]);
      break;

    case 'remove-todo':
      if (!positional[0] || !positional[1]) die('Usage: gantt remove-todo <task> <todo>');
      cmdRemoveTodo(project, dir, positional[0], positional[1]);
      break;

    case 'move-todo': {
      if (!positional[0]) die('Usage: gantt move-todo <todo> --to <task>');
      const toTask = flags.to as string;
      if (!toTask) die('Usage: gantt move-todo <todo> --to <task>');
      cmdMoveTodo(project, dir, positional[0], toTask);
      break;
    }

    case 'add-dep': {
      if (!positional[0]) die('Usage: gantt add-dep <task> --on <prerequisite>');
      const onRef = flags.on as string;
      if (!onRef) die('Usage: gantt add-dep <task> --on <prerequisite>');
      cmdAddDep(project, dir, positional[0], onRef, flags.type as string | undefined);
      break;
    }

    case 'remove-dep': {
      if (!positional[0]) die('Usage: gantt remove-dep <task> --on <prerequisite>');
      const onRef = flags.on as string;
      if (!onRef) die('Usage: gantt remove-dep <task> --on <prerequisite>');
      cmdRemoveDep(project, dir, positional[0], onRef);
      break;
    }

    default:
      die(`Unknown command: ${command}. Run "gantt --help" for usage.`);
  }
}

main();
