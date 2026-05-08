'use strict';

// Conflict resolution.
//
// Two-phase output:
//   1. buildPlan() — walk staging, classify each file into one of:
//        - WILL_CREATE     (no local file present)
//        - CONFLICT        (local file exists; needs decision)
//        - SKIP_CATEGORY   (project-owned / excluded — installer must not write)
//      Print the plan + single confirmation prompt.
//   2. resolveConflicts() — for each CONFLICT, prompt s/b/o/d (with diff),
//      respecting the manifest-derived default for non-interactive runs.

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const log = require('./log');
const prompt = require('./prompt');
const paths = require('./paths');

// Action values match the manifest vocabulary exactly:
//   'skip' — keep local; do nothing
//   'sibling' — write incoming to <name>.framework alongside local
//   'overwrite-with-backup' — backup local, then overwrite with incoming
//
// (No bare 'overwrite' without backup — too dangerous as a default.)
const ACTIONS = {
  SKIP: 'skip',
  SIBLING: 'sibling',
  OVERWRITE_WITH_BACKUP: 'overwrite-with-backup',
};

async function buildPlan({ repoRoot, walkStagingFiles, manifest }) {
  const items = [];
  for await (const f of walkStagingFiles(repoRoot)) {
    const rel = f.rel;
    // Don't ship the manifest's _meta-only entries that aren't actual files in
    // the tarball. (We only enumerate what's actually in staging, so that's
    // moot — but skip the framework-manifest.json comparison logic for the
    // canonical-source manifest itself; it gets installed verbatim.)

    if (paths.shouldSkipCategory(manifest, rel)) {
      items.push({ rel, abs: f.abs, status: 'SKIP_CATEGORY' });
      continue;
    }

    const destAbs = path.join(repoRoot, rel);
    const exists = fs.existsSync(destAbs);
    const { action, category } = paths.resolveAction(manifest, rel);
    if (!exists) {
      items.push({
        rel, abs: f.abs, destAbs,
        status: 'WILL_CREATE',
        defaultAction: action,
        category,
      });
    } else {
      items.push({
        rel, abs: f.abs, destAbs,
        status: 'CONFLICT',
        defaultAction: action,
        category,
      });
    }
  }
  // Stable sort by rel for predictable output.
  items.sort((a, b) => a.rel.localeCompare(b.rel));
  return items;
}

function summarize(items) {
  const create = items.filter((i) => i.status === 'WILL_CREATE');
  const conflict = items.filter((i) => i.status === 'CONFLICT');
  const skipped = items.filter((i) => i.status === 'SKIP_CATEGORY');
  return { create, conflict, skipped };
}

function printInventory({ items, manifest, repoRoot, userAuthoredCommands, deferredShadows }) {
  const { create, conflict, skipped } = summarize(items);

  log.info('Framework install plan — @insynq/' + manifest.name + ' v' + manifest.version);
  log.info('Target: ' + repoRoot);
  log.info('');

  if (create.length) {
    log.info('WILL CREATE (' + create.length + ' files, no conflict):');
    const limit = 30;
    for (const i of create.slice(0, limit)) log.info('  ' + i.rel);
    if (create.length > limit) {
      log.info('  ... and ' + (create.length - limit) + ' more');
    }
    log.info('');
  }

  if (conflict.length) {
    log.info('CONFLICTS (' + conflict.length + ', will prompt for each):');
    for (const i of conflict) {
      let size = '?';
      try { size = String(fs.statSync(i.destAbs).size); } catch {/* ignore */}
      log.info(
        '  ' + i.rel +
        '   [exists, ' + size + ' bytes; default action: ' + i.defaultAction + ']'
      );
    }
    log.info('');
  }

  if (skipped.length) {
    log.info('WILL NOT TOUCH (' + skipped.length + ' files, project-owned/excluded by manifest):');
    const limit = 10;
    for (const i of skipped.slice(0, limit)) log.info('  ' + i.rel);
    if (skipped.length > limit) {
      log.info('  ... and ' + (skipped.length - limit) + ' more');
    }
    log.info('');
  }

  if (userAuthoredCommands && userAuthoredCommands.length) {
    log.info(
      'NOTE: ' + userAuthoredCommands.length + ' user-authored command file(s) ' +
      'in .claude/commands/ will be left untouched:'
    );
    for (const f of userAuthoredCommands) log.info('  .claude/commands/' + f);
    log.info('');
  }

  if (deferredShadows && deferredShadows.length) {
    log.info(
      'NOTE: ' + deferredShadows.length + ' user-global command(s) at ~/.claude/commands/ ' +
      'will SHADOW framework commands until you remediate (instructions in post-install).'
    );
    log.info('');
  }

  log.info(
    'Total: ' + (create.length + conflict.length) + ' to write, ' +
    conflict.length + ' conflicts, ' + skipped.length + ' skipped.'
  );
}

// Tiny line-based diff: prints "- " for removed, "+ " for added, no LCS magic.
// Truncates at 200 lines to keep prompts navigable.
async function printDiff(localPath, incomingPath) {
  let local = '';
  let incoming = '';
  try { local = await fsp.readFile(localPath, 'utf8'); } catch {/* ignore */}
  try { incoming = await fsp.readFile(incomingPath, 'utf8'); } catch {/* ignore */}

  const localLines = local.split(/\r?\n/);
  const incomingLines = incoming.split(/\r?\n/);

  const max = Math.max(localLines.length, incomingLines.length);
  const out = [];
  out.push('--- local:    ' + localPath);
  out.push('+++ incoming: ' + incomingPath);
  let diffCount = 0;
  const limit = 200;
  for (let i = 0; i < max; i++) {
    const a = localLines[i];
    const b = incomingLines[i];
    if (a === b) continue;
    diffCount++;
    if (out.length >= limit) {
      out.push('... [diff truncated at ' + limit + ' lines; ' + (max - i) + ' more lines differ] ...');
      break;
    }
    if (a !== undefined) out.push('- ' + a);
    if (b !== undefined) out.push('+ ' + b);
  }
  if (diffCount === 0) out.push('(files are byte-identical line-by-line)');
  log.info(out.join('\n'));
}

// Per-conflict prompt — applies the chosen action to a {rel, abs, destAbs,
// defaultAction} item. Returns the resolved action.
async function promptForConflict(item, { autoYes }) {
  if (autoYes) return item.defaultAction;

  log.info('');
  log.info('CONFLICT: ' + item.rel);
  let size = '?';
  try { size = String(fs.statSync(item.destAbs).size); } catch {/* ignore */}
  log.info('  (exists, ' + size + ' bytes)');
  log.info('  [s] skip — keep yours, framework version not installed');
  log.info('  [b] sibling — write framework version to ' + path.basename(item.rel) + '.framework');
  log.info('  [o] overwrite-with-backup — backup yours to .framework-backup/, then replace');
  log.info('  [d] diff — show framework vs. local, then re-prompt');
  log.info('  Default: ' + item.defaultAction);

  for (;;) {
    const choice = await prompt.choose(
      '  Choose [s/b/o/d] (default ' + actionToKey(item.defaultAction) + '): ',
      [
        { key: 's', label: 'skip' },
        { key: 'b', label: 'sibling' },
        { key: 'o', label: 'overwrite-with-backup' },
        { key: 'd', label: 'diff' },
      ],
      { defaultKey: actionToKey(item.defaultAction) }
    );
    if (choice === 'd') {
      await printDiff(item.destAbs, item.abs);
      continue;
    }
    return keyToAction(choice);
  }
}

function actionToKey(action) {
  if (action === ACTIONS.SKIP) return 's';
  if (action === ACTIONS.SIBLING) return 'b';
  if (action === ACTIONS.OVERWRITE_WITH_BACKUP) return 'o';
  return 's';
}

function keyToAction(key) {
  if (key === 's') return ACTIONS.SKIP;
  if (key === 'b') return ACTIONS.SIBLING;
  if (key === 'o') return ACTIONS.OVERWRITE_WITH_BACKUP;
  return ACTIONS.SKIP;
}

module.exports = {
  ACTIONS,
  buildPlan,
  summarize,
  printInventory,
  promptForConflict,
  printDiff,
};
