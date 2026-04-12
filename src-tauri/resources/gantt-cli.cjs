#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/gantt.ts
var fs = __toESM(require("node:fs"), 1);
var path = __toESM(require("node:path"), 1);
function findNodeById(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}
function deleteNodeById(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      nodes.splice(i, 1);
      return true;
    }
    if (deleteNodeById(nodes[i].children, id)) return true;
  }
  return false;
}
function cleanDependencies(nodes, deletedId) {
  for (const node of nodes) {
    node.dependencies = node.dependencies.filter((d) => d.targetId !== deletedId);
    cleanDependencies(node.children, deletedId);
  }
}
function collectAll(nodes) {
  const result = [];
  for (const n of nodes) {
    result.push(n);
    result.push(...collectAll(n.children));
  }
  return result;
}
function effectiveProgress(node) {
  if (node.children.length > 0) {
    let totalWeight = 0, weightedSum = 0;
    for (const child of node.children) {
      const cp = effectiveProgress(child);
      const days = Math.max(1, Math.round((new Date(child.endDate).getTime() - new Date(child.startDate).getTime()) / 864e5) + 1);
      weightedSum += cp * days;
      totalWeight += days;
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }
  if (node.todos && node.todos.length > 0) {
    const done = node.todos.filter((t) => t.done).length;
    return Math.round(done / node.todos.length * 100);
  }
  return node.progress;
}
function getAncestors(targetId, roots) {
  const trail = [];
  const find = (nodes, path2) => {
    for (const node of nodes) {
      if (node.id === targetId) {
        trail.push(...path2);
        return true;
      }
      if (node.children.length > 0 && find(node.children, [...path2, node])) return true;
    }
    return false;
  };
  find(roots, []);
  return trail;
}
var DEP_TYPE_ALIASES = {
  "finish-to-start": "FS",
  "finish to start": "FS",
  "start-to-start": "SS",
  "start to start": "SS",
  "finish-to-finish": "FF",
  "finish to finish": "FF",
  "start-to-finish": "SF",
  "start to finish": "SF",
  fs: "FS",
  ss: "SS",
  ff: "FF",
  sf: "SF"
};
function normalizeDependencyType(type) {
  return DEP_TYPE_ALIASES[type.toLowerCase()] ?? (["FS", "SS", "FF", "SF"].includes(type) ? type : "FS");
}
function migrateProject(project) {
  if (!project.kanbanColumns) project.kanbanColumns = [{ id: "backlog", name: "Backlog" }];
  function migrateNode(node) {
    if (!node.todos) node.todos = [];
    if (!node.kanbanColumnId) node.kanbanColumnId = "backlog";
    if (!node.dependencies) node.dependencies = [];
    if (!node.children) node.children = [];
    for (const dep of node.dependencies) {
      dep.type = normalizeDependencyType(dep.type);
      if (dep.lag === void 0) dep.lag = 0;
    }
    for (const child of node.children) migrateNode(child);
  }
  for (const node of project.children ?? []) migrateNode(node);
  return project;
}
function discoverProjectDir(startDir) {
  let dir = startDir ? path.resolve(startDir) : process.cwd();
  const root = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, ".ganttapp"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir || parent === root) break;
    dir = parent;
  }
  die("No .ganttapp project found. Walk up from CWD failed. Use --project <path> to specify.");
}
function readProject(dir) {
  const filePath = path.join(dir, "project.json");
  if (!fs.existsSync(filePath)) die(`project.json not found in ${dir}`);
  const text = fs.readFileSync(filePath, "utf-8");
  return migrateProject(JSON.parse(text));
}
function atomicWrite(filePath, data) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, data, "utf-8");
  fs.renameSync(tmp, filePath);
}
function writeProject(dir, project) {
  atomicWrite(path.join(dir, "project.json"), JSON.stringify(project, null, 2));
}
function computePriority(project) {
  const allNodes = collectAll(project.children);
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const unblocksMap = /* @__PURE__ */ new Map();
  for (const node of allNodes) {
    for (const dep of node.dependencies) {
      unblocksMap.set(dep.targetId, (unblocksMap.get(dep.targetId) ?? 0) + 1);
    }
  }
  const items = [];
  for (const task of allNodes) {
    const progress = effectiveProgress(task);
    if (progress >= 100 || task.isMilestone || task.children.length > 0) continue;
    if (task.hideFromPriority) continue;
    const ancestors = getAncestors(task.id, project.children);
    if (ancestors.some((a) => a.hideFromPriority)) continue;
    let score = 0;
    const reasons = [];
    const blockedBy = [];
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
    if (!ready) {
      score -= 1e3;
      reasons.push(`Blocked by ${blockedBy.length} task${blockedBy.length > 1 ? "s" : ""}`);
    }
    if (progress > 0) {
      score += 25;
      reasons.push(`${progress}% done`);
    }
    const unblocksCount = unblocksMap.get(task.id) ?? 0;
    if (unblocksCount > 0) {
      score += unblocksCount * 10;
      reasons.push(`Unblocks ${unblocksCount} task${unblocksCount > 1 ? "s" : ""}`);
    }
    const start = new Date(task.startDate);
    start.setHours(0, 0, 0, 0);
    const daysUntil = Math.round((start.getTime() - today.getTime()) / 864e5);
    if (daysUntil <= 0) {
      score += 30;
      reasons.push(daysUntil < 0 ? `Started ${-daysUntil}d ago` : "Starts today");
    } else if (daysUntil <= 7) {
      score += 15;
      reasons.push(`Starts in ${daysUntil}d`);
    }
    const incompleteTodos = task.todos.filter((t) => !t.done).length;
    if (incompleteTodos > 0) {
      score += 5;
      reasons.push(`${incompleteTodos} todo${incompleteTodos > 1 ? "s" : ""} left`);
    }
    if (reasons.length === 0 && ready) reasons.push("Ready to start");
    items.push({ task, progress, score, ready, blockedBy, unblocksCount, reason: reasons[0] ?? "" });
  }
  items.sort((a, b) => b.score - a.score);
  return { ready: items.filter((i) => i.ready), blocked: items.filter((i) => !i.ready) };
}
function buildLlmExport(project) {
  const { ready, blocked } = computePriority(project);
  function buildTask(node) {
    const t = {
      name: node.name,
      progress: effectiveProgress(node),
      startDate: node.startDate,
      endDate: node.endDate
    };
    if (node.description) t.description = node.description;
    if (node.isMilestone) t.isMilestone = true;
    if (node.dependencies.length > 0) t.dependencies = node.dependencies.map((d) => d.targetName ?? d.targetId);
    if (node.todos.length > 0) t.todos = node.todos.map((td) => ({ text: td.text, done: td.done }));
    if (node.children.length > 0) t.children = node.children.map((c) => buildTask(c));
    return t;
  }
  function buildUpNext(item) {
    const e = { name: item.task.name, progress: item.progress, reason: item.reason };
    if (item.blockedBy.length > 0) e.blockedBy = item.blockedBy;
    if (item.unblocksCount > 0) e.unblocksCount = item.unblocksCount;
    return e;
  }
  const result = {
    _comment: "READ-ONLY. Auto-generated from project.json. Edit project.json to make changes.",
    name: project.name,
    tasks: project.children.map((c) => buildTask(c)),
    upNext: ready.map(buildUpNext),
    blocked: blocked.map(buildUpNext)
  };
  if (project.description) result.description = project.description;
  return result;
}
function writeLlmExport(dir, project) {
  const data = buildLlmExport(project);
  atomicWrite(path.join(dir, "project_llm.json"), JSON.stringify(data, null, 2));
}
function resolveTask(project, ref) {
  const all = collectAll(project.children);
  const byId = all.find((n) => n.id === ref);
  if (byId) return byId;
  const byPrefix = all.filter((n) => n.id.startsWith(ref));
  if (byPrefix.length === 1) return byPrefix[0];
  if (byPrefix.length > 1) die(`Ambiguous ID prefix "${ref}" \u2014 matches ${byPrefix.length} tasks: ${byPrefix.map((n) => n.name).join(", ")}`);
  const lower = ref.toLowerCase();
  const byName = all.filter((n) => n.name.toLowerCase().includes(lower));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) die(`Ambiguous name "${ref}" \u2014 matches ${byName.length} tasks: ${byName.map((n) => n.name).join(", ")}`);
  die(`No task found matching "${ref}"`);
}
function resolveTodo(project, ref) {
  const all = collectAll(project.children);
  for (const node of all) {
    for (const todo of node.todos) {
      if (todo.id === ref || todo.id.startsWith(ref)) return { task: node, todo };
    }
  }
  const lower = ref.toLowerCase();
  const matches = [];
  for (const node of all) {
    for (const todo of node.todos) {
      if (todo.text.toLowerCase().includes(lower)) matches.push({ task: node, todo });
    }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) die(`Ambiguous todo "${ref}" \u2014 matches ${matches.length} todos: ${matches.map((m) => m.todo.text).join(", ")}`);
  die(`No todo found matching "${ref}"`);
}
function printTree(nodes, indent = "") {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const branch = indent ? isLast ? "\u2514\u2500 " : "\u251C\u2500 " : "";
    const prog = effectiveProgress(node);
    const marker = node.isMilestone ? " \u25C6" : "";
    const pct = prog > 0 ? ` [${prog}%]` : "";
    console.log(`${indent}${branch}${node.name}${marker}${pct}  (${node.startDate} \u2192 ${node.endDate})`);
    if (node.children.length > 0) {
      const childIndent = indent + (indent ? isLast ? "   " : "\u2502  " : "  ");
      printTree(node.children, childIndent);
    }
  }
}
function printTaskDetail(node, project) {
  const prog = effectiveProgress(node);
  console.log(`Name:     ${node.name}`);
  console.log(`ID:       ${node.id}`);
  console.log(`Dates:    ${node.startDate} \u2192 ${node.endDate}`);
  console.log(`Progress: ${prog}%`);
  if (node.color) console.log(`Color:    ${node.color}`);
  if (node.isMilestone) console.log(`Type:     Milestone`);
  if (node.description) console.log(`
Description:
${node.description}`);
  if (node.dependencies.length > 0) {
    console.log(`
Dependencies:`);
    for (const dep of node.dependencies) {
      const target = findNodeById(project.children, dep.targetId);
      const name = target?.name ?? dep.targetId;
      console.log(`  ${dep.type} \u2192 ${name}${dep.lag ? ` (lag: ${dep.lag}d)` : ""}`);
    }
  }
  if (node.todos.length > 0) {
    console.log(`
Todos:`);
    for (const todo of node.todos) {
      console.log(`  ${todo.done ? "[x]" : "[ ]"} ${todo.text}  (${todo.id})`);
    }
  }
  if (node.children.length > 0) {
    console.log(`
Subtasks:`);
    printTree(node.children, "  ");
  }
}
function newNodeId() {
  return `node-${Date.now()}`;
}
function newTodoId() {
  return `todo-${Date.now()}`;
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayIso() {
  return isoDate(/* @__PURE__ */ new Date());
}
function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
function parseArgs(argv) {
  const command = argv[0] ?? "";
  const positional = [];
  const flags = {};
  let i = 1;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
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
function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}
function cmdList(project) {
  if (project.children.length === 0) {
    console.log("(no tasks)");
    return;
  }
  console.log(`Project: ${project.name}
`);
  printTree(project.children);
}
function cmdShow(project, ref) {
  const node = resolveTask(project, ref);
  printTaskDetail(node, project);
}
function cmdUpNext(project) {
  const { ready, blocked } = computePriority(project);
  if (ready.length === 0 && blocked.length === 0) {
    console.log("No pending tasks.");
    return;
  }
  if (ready.length > 0) {
    console.log("Ready:\n");
    for (const item of ready) {
      console.log(`  ${item.task.name}  [${item.progress}%]  \u2014 ${item.reason}`);
    }
  }
  if (blocked.length > 0) {
    if (ready.length > 0) console.log("");
    console.log("Blocked:\n");
    for (const item of blocked) {
      console.log(`  ${item.task.name}  [${item.progress}%]  \u2014 ${item.reason}  (by: ${item.blockedBy.join(", ")})`);
    }
  }
}
function cmdAddTask(project, dir, name, flags) {
  const parentRef = flags.parent;
  const parentNode = parentRef ? resolveTask(project, parentRef) : null;
  const startDate = flags.start ?? todayIso();
  const endDate = flags.end ?? addDays(startDate, 7);
  const color = flags.color ?? parentNode?.color ?? "#3b82f6";
  const isMilestone = flags.milestone === true;
  const node = {
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
    kanbanColumnId: "backlog"
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
function cmdUpdate(project, dir, ref, flags) {
  const node = resolveTask(project, ref);
  if (flags.name) node.name = flags.name;
  if (flags.start) node.startDate = flags.start;
  if (flags.end) node.endDate = flags.end;
  if (flags.progress) node.progress = Math.min(100, Math.max(0, parseInt(flags.progress, 10)));
  if (flags.description) node.description = flags.description;
  if (flags.color) node.color = flags.color;
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Updated "${node.name}"`);
}
function cmdDelete(project, dir, ref) {
  const node = resolveTask(project, ref);
  const name = node.name;
  const id = node.id;
  deleteNodeById(project.children, id);
  cleanDependencies(project.children, id);
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Deleted "${name}"`);
}
function cmdAddTodo(project, dir, taskRef, text) {
  const node = resolveTask(project, taskRef);
  const todo = { id: newTodoId(), text, done: false };
  node.todos.push(todo);
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Added todo "${text}" to "${node.name}" (${todo.id})`);
}
function cmdToggleTodo(project, dir, taskRef, todoRef) {
  const node = resolveTask(project, taskRef);
  const lower = todoRef.toLowerCase();
  const todo = node.todos.find((t) => t.id === todoRef || t.id.startsWith(todoRef) || t.text.toLowerCase().includes(lower));
  if (!todo) die(`No todo matching "${todoRef}" in task "${node.name}"`);
  todo.done = !todo.done;
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`${todo.done ? "Completed" : "Uncompleted"} todo "${todo.text}"`);
}
function cmdRemoveTodo(project, dir, taskRef, todoRef) {
  const node = resolveTask(project, taskRef);
  const lower = todoRef.toLowerCase();
  const idx = node.todos.findIndex((t) => t.id === todoRef || t.id.startsWith(todoRef) || t.text.toLowerCase().includes(lower));
  if (idx === -1) die(`No todo matching "${todoRef}" in task "${node.name}"`);
  const removed = node.todos.splice(idx, 1)[0];
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Removed todo "${removed.text}" from "${node.name}"`);
}
function cmdMoveTodo(project, dir, todoRef, toTaskRef) {
  const { task: srcTask, todo } = resolveTodo(project, todoRef);
  const dstTask = resolveTask(project, toTaskRef);
  if (srcTask.id === dstTask.id) die(`Todo is already in "${dstTask.name}"`);
  srcTask.todos = srcTask.todos.filter((t) => t.id !== todo.id);
  dstTask.todos.push(todo);
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Moved todo "${todo.text}" from "${srcTask.name}" to "${dstTask.name}"`);
}
function cmdAddDep(project, dir, taskRef, onRef, depType) {
  const task = resolveTask(project, taskRef);
  const prerequisite = resolveTask(project, onRef);
  if (task.id === prerequisite.id) die("A task cannot depend on itself");
  if (task.dependencies.some((d) => d.targetId === prerequisite.id)) die(`"${task.name}" already depends on "${prerequisite.name}"`);
  const type = depType ? normalizeDependencyType(depType) : "FS";
  task.dependencies.push({ targetId: prerequisite.id, targetName: prerequisite.name, type, lag: 0 });
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Added ${type} dependency: "${task.name}" depends on "${prerequisite.name}"`);
}
function cmdRemoveDep(project, dir, taskRef, onRef) {
  const task = resolveTask(project, taskRef);
  const prerequisite = resolveTask(project, onRef);
  const before = task.dependencies.length;
  task.dependencies = task.dependencies.filter((d) => d.targetId !== prerequisite.id);
  if (task.dependencies.length === before) die(`"${task.name}" does not depend on "${prerequisite.name}"`);
  writeProject(dir, project);
  writeLlmExport(dir, project);
  console.log(`Removed dependency: "${task.name}" no longer depends on "${prerequisite.name}"`);
}
function printUsage() {
  console.log(`
Gantt App CLI

Usage: gantt <command> [args] [--flags]

Read commands:
  list                              Show task tree
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
function main() {
  const rawArgs = process.argv.slice(2);
  let projectPath;
  const filteredArgs = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === "--project") {
      projectPath = rawArgs[++i];
    } else if (rawArgs[i] === "--help" || rawArgs[i] === "-h") {
      printUsage();
      return;
    } else {
      filteredArgs.push(rawArgs[i]);
    }
  }
  if (filteredArgs.length === 0) {
    printUsage();
    return;
  }
  const { command, positional, flags } = parseArgs(filteredArgs);
  const dir = projectPath ? path.resolve(projectPath) : discoverProjectDir();
  const project = readProject(dir);
  switch (command) {
    case "list":
      cmdList(project);
      break;
    case "show":
      if (!positional[0]) die("Usage: gantt show <task>");
      cmdShow(project, positional[0]);
      break;
    case "up-next":
      cmdUpNext(project);
      break;
    case "add": {
      const subCmd = positional[0];
      if (subCmd === "task") {
        if (!positional[1]) die('Usage: gantt add task "<name>" [--parent <task> --start --end --color --milestone]');
        cmdAddTask(project, dir, positional[1], flags);
      } else {
        die(`Unknown sub-command: add ${subCmd}. Did you mean: add task`);
      }
      break;
    }
    case "update":
      if (!positional[0]) die("Usage: gantt update <task> [--name --start --end --progress --description --color]");
      cmdUpdate(project, dir, positional[0], flags);
      break;
    case "delete":
      if (!positional[0]) die("Usage: gantt delete <task>");
      cmdDelete(project, dir, positional[0]);
      break;
    case "add-todo":
      if (!positional[0] || !positional[1]) die('Usage: gantt add-todo <task> "<text>"');
      cmdAddTodo(project, dir, positional[0], positional[1]);
      break;
    case "toggle-todo":
      if (!positional[0] || !positional[1]) die("Usage: gantt toggle-todo <task> <todo>");
      cmdToggleTodo(project, dir, positional[0], positional[1]);
      break;
    case "remove-todo":
      if (!positional[0] || !positional[1]) die("Usage: gantt remove-todo <task> <todo>");
      cmdRemoveTodo(project, dir, positional[0], positional[1]);
      break;
    case "move-todo": {
      if (!positional[0]) die("Usage: gantt move-todo <todo> --to <task>");
      const toTask = flags.to;
      if (!toTask) die("Usage: gantt move-todo <todo> --to <task>");
      cmdMoveTodo(project, dir, positional[0], toTask);
      break;
    }
    case "add-dep": {
      if (!positional[0]) die("Usage: gantt add-dep <task> --on <prerequisite>");
      const onRef = flags.on;
      if (!onRef) die("Usage: gantt add-dep <task> --on <prerequisite>");
      cmdAddDep(project, dir, positional[0], onRef, flags.type);
      break;
    }
    case "remove-dep": {
      if (!positional[0]) die("Usage: gantt remove-dep <task> --on <prerequisite>");
      const onRef = flags.on;
      if (!onRef) die("Usage: gantt remove-dep <task> --on <prerequisite>");
      cmdRemoveDep(project, dir, positional[0], onRef);
      break;
    }
    default:
      die(`Unknown command: ${command}. Run "gantt --help" for usage.`);
  }
}
main();
