'use strict';

// Minimal, dependency-free logging. Plain text per phase plan ("no TUI").

const state = { debug: false };

function setDebug(on) {
  state.debug = !!on;
}

function info(msg) {
  process.stdout.write(String(msg) + '\n');
}

function warn(msg) {
  process.stderr.write('WARN: ' + String(msg) + '\n');
}

function error(msg) {
  process.stderr.write('ERROR: ' + String(msg) + '\n');
}

function debug(msg) {
  if (state.debug) {
    process.stderr.write('DEBUG: ' + String(msg) + '\n');
  }
}

function blank() {
  process.stdout.write('\n');
}

module.exports = { setDebug, info, warn, error, debug, blank };
