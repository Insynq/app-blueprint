'use strict';

// Post-install message. Plain text — no banners, no TUI.
// Conditionally surfaces deferred user-global shadow remediation.

const log = require('./log');

function print({
  manifest,
  appliedSummary,    // { created, skipped, sibling, overwritten }
  deferredShadows,   // [string] basenames of shadowing commands, may be empty/null
}) {
  log.blank();
  log.info('Install complete — @insynq/' + manifest.name + ' v' + manifest.version);
  log.blank();

  log.info(
    'Files written: ' + appliedSummary.created +
    ' (' + appliedSummary.overwritten + ' overwritten with backup, ' +
    appliedSummary.sibling + ' as .framework siblings)'
  );
  log.info('Files preserved (skip on conflict): ' + appliedSummary.skipped);
  log.blank();

  log.info('Next steps:');
  log.info('  1. Run /preflight             # records your agent + OS in CLAUDE.md');
  log.info('  2. Run /adopt                 # discovery for an existing project');
  log.info('                                #  (or /kickoff if this is a fresh project)');
  log.info('  3. Commit:  git add . && git commit -m "Add @insynq/app-blueprint v' +
           manifest.version + '"');
  log.blank();

  log.info('Framework ownership:');
  log.info('  Framework owns:  .claude/commands/*, docs/* KB stack folders');
  log.info('  You own:         src/, package.json, README.md, supabase/, etc.');
  log.info('  Shared:          CLAUDE.md (assisted merge during /adopt — see CLAUDE.md.framework)');
  log.blank();

  log.info('Updates:');
  log.info('  Run /update-framework to pull the latest version when canonical releases.');
  log.info('  See ' + manifest.canonical_url + ' for changelog.');

  if (deferredShadows && deferredShadows.length) {
    log.blank();
    log.info('!! Action required (deferred from pre-flight):');
    log.info('   ' + deferredShadows.length +
             ' user-global command(s) in ~/.claude/commands/ will SHADOW framework commands:');
    for (const f of deferredShadows) log.info('     ' + f);
    log.blank();
    log.info('   Disable with:');
    log.info('     mv ~/.claude/commands ~/.claude/commands_legacy');
  }
  log.blank();
}

module.exports = { print };
