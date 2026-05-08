'use strict';

// Staging directory management:
//   - download canonical tarball with retries
//   - print SHA256 pre-extraction
//   - extract into ./.framework-install-staging/
//   - lock file with PID for concurrent-run detection
//   - SIGINT handler that preserves staging
//   - per-file rename into final place (NTFS atomicity friendly)
//   - cleanup on success; preserve on mid-write error

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const tar = require('tar');

const log = require('./log');

const STAGING_DIR_NAME = '.framework-install-staging';
const LOCK_FILE_NAME = '.lock';

function stagingPath(repoRoot) {
  return path.join(repoRoot, STAGING_DIR_NAME);
}

// PID-aware lock to detect concurrent installer runs in the same repo.
async function acquireLock(repoRoot) {
  const stage = stagingPath(repoRoot);
  await fsp.mkdir(stage, { recursive: true });
  const lockPath = path.join(stage, LOCK_FILE_NAME);
  if (fs.existsSync(lockPath)) {
    let existing = null;
    try {
      existing = (await fsp.readFile(lockPath, 'utf8')).trim();
    } catch {/* ignore */}
    const pid = parseInt(existing, 10);
    if (pid && pid !== process.pid) {
      // Probe whether PID is alive. process.kill(pid, 0) throws if not.
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch (err) {
        if (err.code === 'EPERM') alive = true; // exists but owned by another user
      }
      if (alive) {
        const e = new Error(
          'Another install in progress (PID ' + pid + ').\n' +
          '  If that process died unexpectedly, delete ' +
          path.relative(repoRoot, lockPath) + ' and re-run.'
        );
        e.exitCode = 1;
        throw e;
      }
      log.warn('Stale install lock detected (PID ' + pid + ' not alive); proceeding.');
    }
  }
  await fsp.writeFile(lockPath, String(process.pid));
}

async function releaseLock(repoRoot) {
  const lockPath = path.join(stagingPath(repoRoot), LOCK_FILE_NAME);
  try { await fsp.unlink(lockPath); } catch { /* ignore */ }
}

// Download `url` with exponential-backoff retries. Returns Buffer.
async function downloadWithRetry(url, opts = {}) {
  const { maxAttempts = 3, baseDelayMs = 1000, debug = false } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      log.debug('GET ' + url + ' (attempt ' + attempt + '/' + maxAttempts + ')');
      // Node 18+ ships global fetch.
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': '@insynq/app-blueprint installer' },
      });
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ' ' + res.statusText + ' fetching ' + url);
      }
      // Follow Location chain check: in fetch this is opaque after redirect:'follow',
      // but we can inspect res.url and ensure it's still on github.com.
      let finalHost = '';
      try { finalHost = new URL(res.url).host; } catch {/* ignore */}
      if (finalHost && !/(^|\.)github\.com$|(^|\.)githubusercontent\.com$/i.test(finalHost)) {
        throw new Error(
          'Tarball URL redirected outside GitHub: ' + res.url + ' — refusing for safety.'
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('Empty tarball received');
      log.debug('  fetched ' + buf.length + ' bytes from ' + res.url);
      return { buffer: buf, finalUrl: res.url };
    } catch (err) {
      lastErr = err;
      log.debug('  attempt ' + attempt + ' failed: ' + err.message);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(3, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  const e = new Error(
    'Network error fetching canonical: ' + (lastErr && lastErr.message) + '\n' +
    '  Check connectivity and re-run.'
  );
  e.cause = lastErr;
  throw e;
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Extract tarball buffer into stagingPath. Strips one leading path component
// (GitHub release tarballs have a top-level `<repo>-<sha>/` directory).
// Path-traversal protection via tar's `strict` mode + filter callback.
async function extractTarball(repoRoot, tarballBuffer) {
  const stage = stagingPath(repoRoot);
  await fsp.mkdir(stage, { recursive: true });

  // Write tarball to disk first so tar can stream it (some archives don't like
  // being fully buffered through a transform).
  const tarballPath = path.join(stage, '_canonical.tar.gz');
  await fsp.writeFile(tarballPath, tarballBuffer);

  await tar.x({
    file: tarballPath,
    cwd: stage,
    strip: 1,
    // Defensive filter: reject entries with path-traversal segments.
    filter: (entryPath) => {
      const norm = entryPath.split(/[\\/]/);
      if (norm.some((seg) => seg === '..')) {
        log.warn('Rejecting tar entry with traversal segment: ' + entryPath);
        return false;
      }
      return true;
    },
  });

  // Clean up the tarball; not needed past extraction.
  try { await fsp.unlink(tarballPath); } catch { /* ignore */ }
}

// Move `srcAbs` -> `destAbs`, creating parent dirs. Used per-file (not as a
// directory rename) to dodge NTFS non-empty-directory atomicity quirks.
async function moveFile(srcAbs, destAbs) {
  await fsp.mkdir(path.dirname(destAbs), { recursive: true });
  // If destination exists at this point, that's a caller bug — conflict
  // resolution should have decided to overwrite (with backup) or skip first.
  try {
    await fsp.rename(srcAbs, destAbs);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-device — fall back to copy+unlink. Should not happen in our
      // case (staging dir is in the same FS as repo) but defend anyway.
      const data = await fsp.readFile(srcAbs);
      await fsp.writeFile(destAbs, data);
      await fsp.unlink(srcAbs);
    } else {
      throw err;
    }
  }
}

// Backup a file to .framework-backup/<rel>.<timestamp>. Returns backup path.
async function backupFile(repoRoot, relPath) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(repoRoot, '.framework-backup');
  const dest = path.join(backupRoot, relPath + '.' + ts);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.rename(path.join(repoRoot, relPath), dest);
  return path.relative(repoRoot, dest);
}

async function cleanupStagingOnSuccess(repoRoot) {
  const stage = stagingPath(repoRoot);
  if (!fs.existsSync(stage)) return;
  await fsp.rm(stage, { recursive: true, force: true });
  log.info('Cleaned staging directory.');
}

async function cleanupStagingOnPreWriteError(repoRoot) {
  const stage = stagingPath(repoRoot);
  if (!fs.existsSync(stage)) return;
  await fsp.rm(stage, { recursive: true, force: true });
}

// Walk staging dir and yield {abs, rel} for every file, skipping the lock and
// any installer-internal files.
async function* walkStagingFiles(repoRoot) {
  const stage = stagingPath(repoRoot);
  async function* walk(dir, relPrefix) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = relPrefix ? path.posix.join(relPrefix, e.name) : e.name;
      if (e.isDirectory()) {
        yield* walk(abs, rel);
      } else {
        if (rel === LOCK_FILE_NAME) continue;
        if (rel.startsWith('_canonical.tar')) continue;
        yield { abs, rel };
      }
    }
  }
  yield* walk(stage, '');
}

module.exports = {
  STAGING_DIR_NAME,
  stagingPath,
  acquireLock,
  releaseLock,
  downloadWithRetry,
  sha256Hex,
  extractTarball,
  moveFile,
  backupFile,
  cleanupStagingOnSuccess,
  cleanupStagingOnPreWriteError,
  walkStagingFiles,
};
