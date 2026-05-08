'use strict';

// applyFile() runtime path-allowlist enforcement (audit Finding 5 / Rec 16).
//
// Every write the installer performs MUST go through assertAllowedDest(). The
// allow-list is derived from the manifest's framework-managed + hybrid +
// installer_generated categories. We refuse anything else as a hard invariant
// — protects against a compromised manifest writing into src/, .git/, etc.

const path = require('path');

// Hard-blocked path prefixes (defense in depth — even if a manifest slips
// something dangerous in, refuse it here).
const HARD_BLOCK_PREFIXES = [
  '.git/',
  'node_modules/',
  '.framework-install-staging/',
];

// Hard-blocked exact files (never overwrite, regardless of manifest).
const HARD_BLOCK_FILES = new Set([
  // package.json — adopters own theirs.
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

// Build allowed prefix set from the manifest. Directory entries (end with /)
// become prefix matches; file entries become exact matches.
function buildAllowList(manifest) {
  const allowedPrefixes = [];
  const allowedFiles = new Set();
  const writableCategories = ['framework-managed', 'hybrid', 'installer_generated'];

  for (const cat of writableCategories) {
    const entries = (manifest.categories && manifest.categories[cat]) || [];
    for (const e of entries) {
      const norm = e.replace(/^\.\//, '');
      if (norm.endsWith('/')) {
        allowedPrefixes.push(norm);
      } else {
        allowedFiles.add(norm);
      }
    }
  }
  return { allowedPrefixes, allowedFiles };
}

// Normalize a destination path to a repo-relative POSIX-style path. Rejects
// path traversal (entries that resolve outside repoRoot).
function normalizeRel(repoRoot, destAbs) {
  const resolvedDest = path.resolve(destAbs);
  const resolvedRoot = path.resolve(repoRoot);
  if (resolvedDest !== resolvedRoot && !resolvedDest.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Path traversal blocked: ' + destAbs + ' resolves outside ' + repoRoot);
  }
  let rel = path.relative(resolvedRoot, resolvedDest);
  // Normalize Windows backslashes to forward slashes for matching.
  rel = rel.split(path.sep).join('/');
  return rel;
}

// Throw if `destAbs` is not within the manifest-allowed prefix/file list.
// Exposes a clear message naming the file and the reason — debuggable.
function assertAllowedDest(repoRoot, destAbs, allowList) {
  const rel = normalizeRel(repoRoot, destAbs);

  if (HARD_BLOCK_FILES.has(rel)) {
    throw new Error('Refusing to write hard-blocked file: ' + rel);
  }
  for (const p of HARD_BLOCK_PREFIXES) {
    if (rel.startsWith(p)) {
      throw new Error('Refusing to write hard-blocked path: ' + rel);
    }
  }

  if (allowList.allowedFiles.has(rel)) return;
  for (const p of allowList.allowedPrefixes) {
    if (rel.startsWith(p)) return;
  }

  throw new Error(
    'Refusing to write to "' + rel + '" — not in framework allow-list. ' +
    'This is a manifest bug or a compromised tarball; aborting before any damage.'
  );
}

// Resolve a manifest entry to its category-default conflict action, then
// override with a per-entry rule from default_action_on_conflict if present.
// Walks up parents (path-prefix match) and uses the longest match (most
// specific entry wins).
function resolveAction(manifest, relPath) {
  const perPath = manifest.default_action_on_conflict || {};
  const meta = manifest._meta || {};
  const categoryDefaults = meta.category_defaults || {};

  // Determine the file's category by walking allowedPrefixes / allowedFiles.
  let category = null;
  let bestMatchLen = -1;
  for (const cat of Object.keys(manifest.categories || {})) {
    for (const entry of manifest.categories[cat]) {
      const norm = entry.replace(/^\.\//, '');
      if (norm.endsWith('/')) {
        if (relPath.startsWith(norm) && norm.length > bestMatchLen) {
          category = cat;
          bestMatchLen = norm.length;
        }
      } else {
        if (relPath === norm && norm.length + 1 > bestMatchLen) {
          // file matches exactly — beats any directory of equal length
          category = cat;
          bestMatchLen = norm.length + 1;
        }
      }
    }
  }

  // Per-path override (longest-prefix match wins).
  let override = null;
  let overrideLen = -1;
  for (const key of Object.keys(perPath)) {
    const norm = key.replace(/^\.\//, '');
    if (norm.endsWith('/')) {
      if (relPath.startsWith(norm) && norm.length > overrideLen) {
        override = perPath[key];
        overrideLen = norm.length;
      }
    } else {
      if (relPath === norm && norm.length + 1 > overrideLen) {
        override = perPath[key];
        overrideLen = norm.length + 1;
      }
    }
  }

  if (override) return { action: override, category };
  if (category && categoryDefaults[category]) {
    return { action: categoryDefaults[category], category };
  }
  // Fall back to skip — the safest possible default.
  return { action: 'skip', category };
}

// Returns true if relPath is in a category the installer should NOT write
// (project-owned or excluded). These are "user-territory" or "canonical-only"
// paths; the installer must never create them on the adopter side.
function shouldSkipCategory(manifest, relPath) {
  let category = null;
  let bestMatchLen = -1;
  for (const cat of Object.keys(manifest.categories || {})) {
    for (const entry of manifest.categories[cat]) {
      const norm = entry.replace(/^\.\//, '');
      if (norm.endsWith('/')) {
        if (relPath.startsWith(norm) && norm.length > bestMatchLen) {
          category = cat;
          bestMatchLen = norm.length;
        }
      } else {
        if (relPath === norm && norm.length + 1 > bestMatchLen) {
          category = cat;
          bestMatchLen = norm.length + 1;
        }
      }
    }
  }
  return category === 'project-owned' || category === 'excluded';
}

module.exports = {
  buildAllowList,
  normalizeRel,
  assertAllowedDest,
  resolveAction,
  shouldSkipCategory,
};
