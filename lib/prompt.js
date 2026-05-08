'use strict';

// Minimal interactive prompts on stdin/stdout. No deps.
// Honors --yes / --non-interactive via callers passing autoYes.
// In non-TTY environments the caller is expected to short-circuit (exit 2 on
// unresolved decisions) rather than block on stdin.

const readline = require('readline');

function isInteractive() {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function _ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

// Yes/no with a default. Returns boolean.
async function confirm(question, opts = {}) {
  const { defaultYes = false, autoYes = false } = opts;
  if (autoYes) return true;
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const ans = (await _ask(question + suffix)).trim().toLowerCase();
  if (ans === '') return defaultYes;
  return ans === 'y' || ans === 'yes';
}

// Choice prompt — `choices` is an array of {key, label}; returns the chosen key.
// `defaultKey` selected on empty input. `autoYes` returns defaultKey without
// reading stdin.
async function choose(question, choices, opts = {}) {
  const { defaultKey, autoYes = false } = opts;
  if (autoYes) return defaultKey;
  const keys = choices.map((c) => c.key.toLowerCase());
  for (;;) {
    const ans = (await _ask(question)).trim().toLowerCase();
    if (ans === '' && defaultKey) return defaultKey;
    if (keys.includes(ans)) return ans;
    process.stdout.write('  Invalid choice. Pick one of: ' + keys.join('/') + '\n');
  }
}

module.exports = { isInteractive, confirm, choose };
