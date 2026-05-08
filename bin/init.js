#!/usr/bin/env node

'use strict';

// @insynq/app-blueprint — `init` entrypoint.
//
// Run from inside an existing project root:
//   npx @insynq/app-blueprint init
//
// Orchestrates: pre-flight gates -> URL confirm -> download tarball -> SHA256
// print -> extract -> manifest load -> conflict plan -> per-conflict prompts
// -> apply (with backups) -> stamp .framework-version -> post-install message.

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Runtime Node version check — engines field is only a warning by default.
{
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (!Number.isFinite(major) || major < 18) {
    process.stderr.write(
      'ERROR: Node 18+ required, found ' + process.versions.node + '\n'
    );
    process.exit(1);
  }
}

const log = require('../lib/log');
const prompt = require('../lib/prompt');
const preflight = require('../lib/preflight');
const staging = require('../lib/staging');
const manifestMod = require('../lib/manifest');
const conflicts = require('../lib/conflicts');
const paths = require('../lib/paths');
const version = require('../lib/version');
const postinstall = require('../lib/postinstall');

const SELF_PKG = require('../package.json');

const HELP = `\
@insynq/app-blueprint — install the framework into an existing repo.

Usage:
  npx @insynq/app-blueprint init [flags]

Flags:
  --yes, -y, --non-interactive   Accept defaults; no interactive prompts.
  --dry-run                      Print install plan and exit (no writes).
  --debug                        Verbose logging (HTTP, paths, decisions).
  --force-dirty                  Allow install with a dirty working tree.
  --allow-root                   Permit running as root.
  -h, --help                     This message.
  -V, --version                  Print installer version (${SELF_PKG.version}).

Behavior:
  - Refuses to install in a non-git, dirty, or already-installed repo.
  - Fetches canonical tarball from the GitHub release tagged v${SELF_PKG.version}.
  - Prints SHA256 of the tarball before extracting.
  - Stages files in ./.framework-install-staging/ and only moves to final
    location after all conflicts are resolved. Resume on retry.

Recovery:
  If install fails mid-write, ./.framework-install-staging/ is preserved.
  Re-run the same command to resume, or delete the directory to start over.
`;

function parseArgs(argv) {
  const flags = {
    autoYes: false,
    dryRun: false,
    debug: false,
    forceDirty: false,
    allowRoot: false,
    showHelp: false,
    showVersion: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-y':
      case '--yes':
      case '--non-interactive':
        flags.autoYes = true; break;
      case '--dry-run':
        flags.dryRun = true; break;
      case '--debug':
        flags.debug = true; break;
      case '--force-dirty':
        flags.forceDirty = true; break;
      case '--allow-root':
        flags.allowRoot = true; break;
      case '-h':
      case '--help':
        flags.showHelp = true; break;
      case '-V':
      case '--version':
        flags.showVersion = true; break;
      default:
        if (a === 'init') break; // when invoked as `npx ... init`, the bin is `init` already; ignore re-passed
        rest.push(a);
    }
  }
  return { flags, rest };
}

async function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));

  if (flags.showVersion) {
    log.info(SELF_PKG.version);
    return 0;
  }
  if (flags.showHelp) {
    process.stdout.write(HELP);
    return 0;
  }
  if (rest.length) {
    log.error('Unknown argument(s): ' + rest.join(' '));
    process.stdout.write(HELP);
    return 2;
  }

  log.setDebug(flags.debug);
  const repoRoot = process.cwd();

  // Detect non-TTY: if conflicts come up later and --yes wasn't passed, exit 2.
  // We wire that into the conflicts phase — declared at top so behavior is explicit.
  const interactive = prompt.isInteractive();
  if (!interactive && !flags.autoYes) {
    log.debug('Non-TTY detected; --yes not set. Will exit 2 on first interactive decision.');
  }

  const ctx = {
    repoRoot,
    flags,
    interactive,
    deferredShadows: null,
    userAuthoredCommands: null,
  };

  // SIGINT preserves staging for retry.
  let installing = false;
  process.on('SIGINT', () => {
    process.stderr.write('\nInterrupted.');
    if (installing) {
      process.stderr.write(' Staging preserved at ./' + staging.STAGING_DIR_NAME +
        '/. Re-run to retry.\n');
    } else {
      process.stderr.write('\n');
    }
    process.exit(130);
  });

  // ---- Pre-flight ----
  try {
    await preflight.runAll(ctx);
  } catch (err) {
    if (err && err.name === 'PreflightError') {
      if (err.exitCode === 0) {
        log.info(err.message);
      } else {
        log.error(err.message);
      }
      return err.exitCode || 1;
    }
    throw err;
  }

  // ---- Acquire lock + prepare staging ----
  await staging.acquireLock(repoRoot);

  // ---- Fetch URL confirmation ----
  // The installer uses its OWN package.json version to know which canonical
  // tag to fetch. Coupling is intentional (audit Finding 8 / Recommendation
  // option 2): npm version IS canonical version.
  const installerVersion = SELF_PKG.version;
  const canonicalUrlBase = SELF_PKG.repository && SELF_PKG.repository.url;
  // Derive a tarball URL we can confirm with the user *before* download.
  // We can't fully validate without the manifest, so we use the published
  // canonical owner/repo encoded in the installer's package.json.
  const ghMatch = /github\.com[:/]+([^/]+)\/([^/.]+)/.exec(canonicalUrlBase || '');
  if (!ghMatch) {
    log.error('Installer package.json missing a github.com repository.url; cannot determine canonical.');
    await staging.releaseLock(repoRoot);
    return 1;
  }
  const owner = ghMatch[1];
  const repo = ghMatch[2];
  const tarballUrl = 'https://github.com/' + owner + '/' + repo +
    '/archive/refs/tags/v' + installerVersion + '.tar.gz';

  log.info('About to fetch framework files from:');
  log.info('  ' + tarballUrl);
  if (!flags.autoYes) {
    if (!interactive) {
      log.error('Non-interactive run without --yes. Cannot prompt for fetch confirmation.');
      await staging.cleanupStagingOnPreWriteError(repoRoot);
      return 2;
    }
    const ok = await prompt.confirm('Continue?', { defaultYes: true });
    if (!ok) {
      log.info('Cancelled.');
      await staging.cleanupStagingOnPreWriteError(repoRoot);
      return 0;
    }
  }

  // ---- Download with retry ----
  let downloaded;
  try {
    downloaded = await staging.downloadWithRetry(tarballUrl, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      debug: flags.debug,
    });
  } catch (err) {
    log.error(err.message);
    await staging.cleanupStagingOnPreWriteError(repoRoot);
    return 1;
  }

  // ---- SHA256 print ----
  const sha = staging.sha256Hex(downloaded.buffer);
  log.info('Fetched canonical tarball: ' + downloaded.buffer.length + ' bytes');
  log.info('SHA256: ' + sha);
  log.info('  (verify against ' + canonicalUrlBase.replace(/\.git$/, '') +
           '/releases/tag/v' + installerVersion + ' if you want to confirm)');
  log.blank();

  // ---- Extract ----
  try {
    await staging.extractTarball(repoRoot, downloaded.buffer);
  } catch (err) {
    log.error('Tarball extraction failed: ' + err.message);
    await staging.cleanupStagingOnPreWriteError(repoRoot);
    return 1;
  }

  // ---- Load manifest from staging ----
  let manifest;
  try {
    manifest = await manifestMod.loadFromDir(staging.stagingPath(repoRoot));
  } catch (err) {
    log.error(err.message);
    await staging.cleanupStagingOnPreWriteError(repoRoot);
    return 1;
  }
  log.debug('Loaded manifest: ' + manifest.name + ' v' + manifest.version +
           ' (schema ' + manifest.manifest_schema_version + ')');

  if (manifest.version !== installerVersion) {
    log.warn(
      'Tarball manifest version (' + manifest.version + ') doesn\'t match ' +
      'installer version (' + installerVersion + '). Proceeding, but this is unusual.'
    );
  }

  const allowList = paths.buildAllowList(manifest);

  // ---- Build inventory ----
  const items = await conflicts.buildPlan({
    repoRoot,
    walkStagingFiles: staging.walkStagingFiles,
    manifest,
  });

  conflicts.printInventory({
    items,
    manifest,
    repoRoot,
    userAuthoredCommands: ctx.userAuthoredCommands,
    deferredShadows: ctx.deferredShadows,
  });

  if (flags.dryRun) {
    log.info('--dry-run specified; exiting without writing.');
    await staging.cleanupStagingOnPreWriteError(repoRoot);
    return 0;
  }

  // ---- Single inventory confirmation ----
  if (!flags.autoYes) {
    if (!interactive) {
      log.error('Non-interactive run without --yes. Cannot prompt for inventory confirmation.');
      await staging.cleanupStagingOnPreWriteError(repoRoot);
      return 2;
    }
    const proceed = await prompt.confirm('Proceed with install?', { defaultYes: false });
    if (!proceed) {
      log.info('Cancelled.');
      await staging.cleanupStagingOnPreWriteError(repoRoot);
      return 0;
    }
  }

  // ---- Per-conflict prompts ----
  const conflictItems = items.filter((i) => i.status === 'CONFLICT');
  if (conflictItems.length > 0 && !flags.autoYes && !interactive) {
    log.error(
      conflictItems.length + ' conflicts detected; cannot run interactively. ' +
      'Re-run with --yes to accept defaults from the manifest, or run in a TTY.'
    );
    await staging.cleanupStagingOnPreWriteError(repoRoot);
    return 2;
  }

  for (const item of conflictItems) {
    item.resolvedAction = await conflicts.promptForConflict(item, { autoYes: flags.autoYes });
  }

  // ---- Apply ----
  installing = true;
  const summary = { created: 0, skipped: 0, sibling: 0, overwritten: 0 };

  // applyFile() — the single funnel through which every write happens. Asserts
  // path-allowlist before touching disk (audit Recommendation 16).
  async function applyFile(stagedAbs, destAbs) {
    paths.assertAllowedDest(repoRoot, destAbs, allowList);
    await staging.moveFile(stagedAbs, destAbs);
  }

  try {
    for (const item of items) {
      if (item.status === 'SKIP_CATEGORY') {
        log.debug('skip-category: ' + item.rel);
        continue;
      }
      if (item.status === 'WILL_CREATE') {
        await applyFile(item.abs, item.destAbs);
        summary.created += 1;
        continue;
      }
      // CONFLICT
      const action = item.resolvedAction || item.defaultAction;
      if (action === conflicts.ACTIONS.SKIP) {
        log.debug('skip: ' + item.rel + ' (kept local)');
        summary.skipped += 1;
        continue;
      }
      if (action === conflicts.ACTIONS.SIBLING) {
        const siblingDest = item.destAbs + '.framework';
        // Sibling target also has to clear the allow-list — base path is the
        // same allowed prefix.
        paths.assertAllowedDest(repoRoot, item.destAbs, allowList);
        await staging.moveFile(item.abs, siblingDest);
        summary.sibling += 1;
        log.debug('sibling: ' + item.rel + ' -> ' + path.basename(siblingDest));
        continue;
      }
      if (action === conflicts.ACTIONS.OVERWRITE_WITH_BACKUP) {
        paths.assertAllowedDest(repoRoot, item.destAbs, allowList);
        const backedUpTo = await staging.backupFile(repoRoot, item.rel);
        log.debug('  backup: ' + item.rel + ' -> ' + backedUpTo);
        await applyFile(item.abs, item.destAbs);
        summary.created += 1;
        summary.overwritten += 1;
        continue;
      }
      // Unknown action — don't silently mistreat. Surface and skip.
      log.warn('Unknown conflict action "' + action + '" for ' + item.rel + '; skipping.');
      summary.skipped += 1;
    }
  } catch (err) {
    log.error('Install error mid-write: ' + err.message);
    log.error(
      'Staging directory preserved at ./' + staging.STAGING_DIR_NAME + '/. ' +
      'Re-run `npx @insynq/app-blueprint init` to retry.'
    );
    return 1;
  }

  // ---- Stamp .framework-version ----
  await version.writeFrameworkVersion(repoRoot, {
    version: manifest.version,
    tarball_sha256: sha,
    installed_method: 'npx',
    canonical_url: manifest.canonical_url,
    installed_from: downloaded.finalUrl || tarballUrl,
  });

  // ---- Cleanup staging ----
  await staging.releaseLock(repoRoot);
  await staging.cleanupStagingOnSuccess(repoRoot);

  // ---- Post-install message ----
  postinstall.print({
    manifest,
    appliedSummary: summary,
    deferredShadows: ctx.deferredShadows,
  });

  return 0;
}

main()
  .then((code) => {
    if (typeof code === 'number') process.exit(code);
    process.exit(0);
  })
  .catch((err) => {
    log.error((err && err.stack) || String(err));
    process.exit(1);
  });
