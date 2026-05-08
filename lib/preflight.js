'use strict';

// Pre-flight gates run before any download or write. Each gate either:
//   - passes (returns void, possibly with a `notice` payload added to ctx),
//   - prompts to remediate (and returns void on success),
//   - throws PreflightError with an exit code (caller exits cleanly).

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const log = require('./log');
const prompt = require('./prompt');

class PreflightError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'PreflightError';
    this.exitCode = exitCode;
  }
}

// Framework command basenames — used for user-global shadow detection. Pulled
// from the canonical .claude/commands/ folder layout. The list is intentional:
// adding a new command in canonical means updating this list (or generating
// it from the manifest, which is the V2 path).
const FRAMEWORK_COMMAND_BASENAMES = [
  'audit-code.md', 'audit-full.md', 'audit-infra.md', 'audit-rls.md',
  'brainstorm.md', 'changelog.md', 'db-push.md', 'debug.md',
  'gen-component.md', 'gen-migration.md', 'gen-test.md', 'implement.md',
  'investigate.md', 'kickoff.md', 'orchestrate.md', 'plan-review.md',
  'plan.md', 'preflight.md', 'research.md', 'ship.md', 'unify.md',
  'update-kb.md', 'visualize.md',
  // Workers 3 and 4 will land these — included so future installs catch them
  // post-publish without needing a code change.
  'adopt.md', 'update-framework.md',
];

function runGitSync(args, cwd) {
  try {
    const out = execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { ok: true, stdout: out };
  } catch (err) {
    return {
      ok: false,
      stderr: (err.stderr && err.stderr.toString()) || err.message,
      status: err.status,
    };
  }
}

// Gate 1: not running as root (unless --allow-root). Common npx footgun.
async function gateNotRoot(ctx) {
  if (typeof process.getuid !== 'function') return; // Windows
  if (process.getuid() !== 0) return;
  if (ctx.flags.allowRoot) {
    log.warn('Running as root; --allow-root specified. Files may be owned by root.');
    return;
  }
  throw new PreflightError(
    'Refusing to run as root. Framework files would be owned by root and ' +
    'break for the dev user. Re-run as your normal user. ' +
    '(Override with --allow-root if you really mean it.)'
  );
}

// Gate 2: must be a git repo. Offer git init if not.
async function gateGitRepo(ctx) {
  const r = runGitSync(['rev-parse', '--is-inside-work-tree'], ctx.repoRoot);
  if (r.ok && r.stdout.trim() === 'true') {
    // Verify we're at the worktree root (not a subdirectory). The installer
    // expects to write at the repo root.
    const top = runGitSync(['rev-parse', '--show-toplevel'], ctx.repoRoot);
    if (top.ok) {
      const topPath = path.resolve(top.stdout.trim());
      if (topPath !== path.resolve(ctx.repoRoot)) {
        throw new PreflightError(
          'Run install from the git repo root, not a subdirectory.\n' +
          '  current dir: ' + ctx.repoRoot + '\n' +
          '  repo root:   ' + topPath + '\n' +
          'cd to ' + topPath + ' and re-run.'
        );
      }
    }
    return;
  }

  if (ctx.flags.autoYes) {
    throw new PreflightError(
      'Not a git repo. Re-run after `git init` or run interactively to be ' +
      'prompted to initialize one.'
    );
  }

  const proceed = await prompt.confirm(
    'Not a git repo. Initialize one before install?',
    { defaultYes: true }
  );
  if (!proceed) {
    throw new PreflightError(
      'Install requires a git repo so changes are reviewable. ' +
      'Re-run after `git init`.'
    );
  }
  try {
    execFileSync('git', ['init'], { cwd: ctx.repoRoot, stdio: 'ignore' });
    log.info('  Initialized empty git repo at ' + ctx.repoRoot);
  } catch (err) {
    throw new PreflightError('git init failed: ' + err.message);
  }
}

// Gate 3: working tree clean. Honor --force-dirty.
async function gateCleanTree(ctx) {
  const r = runGitSync(['status', '--porcelain'], ctx.repoRoot);
  if (!r.ok) {
    throw new PreflightError('git status failed: ' + (r.stderr || 'unknown error'));
  }
  if (r.stdout.trim() === '') return;

  if (ctx.flags.forceDirty) {
    log.warn(
      'Working tree is dirty; --force-dirty specified. ' +
      'Recovery via `git diff` will conflate your changes with the install.'
    );
    return;
  }
  throw new PreflightError(
    'Working tree is dirty. The installer requires a clean tree so the ' +
    'install diff is reviewable.\n' +
    '  Either commit/stash your changes, or re-run with --force-dirty.\n' +
    '  Recovery from a bad install relies on `git diff`.'
  );
}

// Gate 4: repo writable from current directory. Test-write a probe file.
async function gateRepoWritable(ctx) {
  const probeDir = path.join(ctx.repoRoot, '.framework-install-staging');
  let createdProbeDir = false;
  try {
    if (!fs.existsSync(probeDir)) {
      await fsp.mkdir(probeDir, { recursive: true });
      createdProbeDir = true;
    }
    const probeFile = path.join(probeDir, '.write-test');
    await fsp.writeFile(probeFile, 'ok');
    await fsp.unlink(probeFile);
  } catch (err) {
    throw new PreflightError(
      'Repo not writable from ' + ctx.repoRoot + ': ' + err.message + '\n' +
      'Check directory permissions and re-run.'
    );
  } finally {
    if (createdProbeDir) {
      try { await fsp.rmdir(probeDir); } catch { /* leave if non-empty */ }
    }
  }
}

// Gate 5: refuse if .framework-version already exists. V1 idempotency hint.
async function gateNotAlreadyInstalled(ctx) {
  const fvPath = path.join(ctx.repoRoot, '.framework-version');
  if (!fs.existsSync(fvPath)) return;
  let parsed = null;
  try {
    parsed = JSON.parse(await fsp.readFile(fvPath, 'utf8'));
  } catch { /* ignore */ }
  const version = (parsed && parsed.version) || '<unknown>';
  const installedAt = (parsed && parsed.installed_at) || '<unknown>';
  throw new PreflightError(
    'Framework already installed (version ' + version + ', installed ' + installedAt + ').\n' +
    '  Run `/update-framework` to update, or delete .framework-version to force re-install.'
  );
}

// Gate 6: monorepo detection. Block with explicit choice prompt.
async function gateNotMonorepo(ctx) {
  const apps = fs.existsSync(path.join(ctx.repoRoot, 'apps'));
  const packages = fs.existsSync(path.join(ctx.repoRoot, 'packages'));
  if (!apps && !packages) return;

  const which = [apps && 'apps/', packages && 'packages/'].filter(Boolean).join(' and/or ');

  if (ctx.flags.autoYes) {
    throw new PreflightError(
      'Monorepo detected (' + which + ' at root). V1 doesn\'t support per-package install.\n' +
      '  Re-run interactively to choose, or cd into a single package and run install there.'
    );
  }

  log.info('');
  log.info('Monorepo detected (' + which + ' at root).');
  log.info('  V1 doesn\'t support per-package install. Choose:');
  log.info('    [1] Install at repo root anyway (advanced — framework files live next to your packages)');
  log.info('    [2] Cancel — cd into a single package and re-run install there');
  const choice = await prompt.choose(
    '  Choice [1/2] (default: 2): ',
    [{ key: '1', label: 'install at root' }, { key: '2', label: 'cancel' }],
    { defaultKey: '2' }
  );
  if (choice === '2') {
    throw new PreflightError('Install cancelled (monorepo).', 0);
  }
  log.warn('Proceeding with root install in a monorepo. Untested path; verify before committing.');
}

// Gate 7: detect user-global command shadows in ~/.claude/commands/.
// Informational + prompted remediation; defer to post-install if user declines.
async function gateUserGlobalShadows(ctx) {
  const home = os.homedir();
  if (!home) return; // unusual environment; skip
  const userGlobalDir = path.join(home, '.claude', 'commands');
  if (!fs.existsSync(userGlobalDir)) return;

  let entries;
  try {
    entries = await fsp.readdir(userGlobalDir);
  } catch (err) {
    log.warn(
      'Couldn\'t read ' + userGlobalDir + ' to check for shadowing commands: ' + err.message + '\n' +
      'Verify manually that no user-global commands shadow framework commands.'
    );
    return;
  }
  const shadowing = entries.filter((f) => FRAMEWORK_COMMAND_BASENAMES.includes(f));
  if (shadowing.length === 0) return;

  log.info('');
  log.info('Found user-global commands that will SHADOW framework commands:');
  for (const f of shadowing) log.info('  ~/.claude/commands/' + f);
  log.info('');
  log.info('Claude Code resolves user-global commands BEFORE project-local ones,');
  log.info('so framework commands installed by this script will be silently overridden.');
  log.info('');
  log.info('Recommended fix: rename ~/.claude/commands/ to ~/.claude/commands_legacy/');

  if (ctx.flags.autoYes) {
    log.warn('--yes specified; deferring shadow remediation to post-install message.');
    ctx.deferredShadows = shadowing;
    return;
  }

  const fix = await prompt.confirm(
    'Disable them now by renaming ~/.claude/commands -> ~/.claude/commands_legacy?',
    { defaultYes: true }
  );
  if (!fix) {
    log.info('  Deferred. Reminder will appear in post-install message.');
    ctx.deferredShadows = shadowing;
    return;
  }
  const newName = path.join(home, '.claude', 'commands_legacy');
  if (fs.existsSync(newName)) {
    log.warn(
      '  ~/.claude/commands_legacy already exists. Skipping rename — please ' +
      'reconcile manually.'
    );
    ctx.deferredShadows = shadowing;
    return;
  }
  try {
    await fsp.rename(userGlobalDir, newName);
    log.info('  Renamed ~/.claude/commands -> ~/.claude/commands_legacy');
  } catch (err) {
    log.warn('  Rename failed: ' + err.message + ' — deferring to post-install reminder.');
    ctx.deferredShadows = shadowing;
  }
}

// Gate 8 (informational, not blocking): surface user-authored .claude/commands/
// files that AREN'T in the framework manifest. The installer leaves them
// untouched; user just needs to know they exist.
async function gateUserAuthoredCommandsNotice(ctx) {
  const localDir = path.join(ctx.repoRoot, '.claude', 'commands');
  if (!fs.existsSync(localDir)) return;
  let entries;
  try {
    entries = await fsp.readdir(localDir);
  } catch {
    return;
  }
  const userAuthored = entries.filter(
    (f) => f.endsWith('.md') && !FRAMEWORK_COMMAND_BASENAMES.includes(f)
  );
  if (userAuthored.length === 0) return;
  ctx.userAuthoredCommands = userAuthored;
}

async function runAll(ctx) {
  log.info('Pre-flight gates:');
  await gateNotRoot(ctx);          log.debug('  [pass] not-root');
  await gateGitRepo(ctx);          log.debug('  [pass] git-repo');
  await gateCleanTree(ctx);        log.debug('  [pass] clean-tree');
  await gateRepoWritable(ctx);     log.debug('  [pass] repo-writable');
  await gateNotAlreadyInstalled(ctx); log.debug('  [pass] not-already-installed');
  await gateNotMonorepo(ctx);      log.debug('  [pass] not-monorepo');
  await gateUserGlobalShadows(ctx); log.debug('  [pass] user-global-shadows');
  await gateUserAuthoredCommandsNotice(ctx); log.debug('  [pass] user-authored-commands');
  log.info('  All pre-flight gates passed.');
  log.info('');
}

module.exports = {
  PreflightError,
  runAll,
  FRAMEWORK_COMMAND_BASENAMES,
};
