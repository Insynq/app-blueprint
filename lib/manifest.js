'use strict';

// Manifest loader. Reads .framework-manifest.json from the staged extraction
// (the canonical version that came down in the tarball). Validates the shape
// and exposes helpers used by paths.js and conflicts.js.

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const MANIFEST_FILE = '.framework-manifest.json';

class ManifestError extends Error {
  constructor(msg) { super(msg); this.name = 'ManifestError'; }
}

async function loadFromDir(dirAbs) {
  const fp = path.join(dirAbs, MANIFEST_FILE);
  if (!fs.existsSync(fp)) {
    throw new ManifestError('Manifest not found at ' + fp);
  }
  let raw;
  try {
    raw = await fsp.readFile(fp, 'utf8');
  } catch (err) {
    throw new ManifestError('Reading manifest: ' + err.message);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ManifestError('Parsing manifest JSON: ' + err.message);
  }
  validate(parsed);
  return parsed;
}

function validate(m) {
  if (!m || typeof m !== 'object') throw new ManifestError('Manifest is not an object');
  if (!m.manifest_schema_version) throw new ManifestError('Missing manifest_schema_version');
  if (m.manifest_schema_version !== '1') {
    throw new ManifestError(
      'Unsupported manifest_schema_version "' + m.manifest_schema_version + '". ' +
      'This installer supports schema version "1". ' +
      'Update @insynq/app-blueprint to a newer version.'
    );
  }
  if (!m.version) throw new ManifestError('Missing version');
  if (!m.name) throw new ManifestError('Missing name');
  if (!m.canonical_url) throw new ManifestError('Missing canonical_url');
  if (!m.categories || typeof m.categories !== 'object') {
    throw new ManifestError('Missing categories object');
  }
  for (const cat of ['framework-managed', 'hybrid', 'project-owned',
                     'installer_generated', 'excluded']) {
    if (!Array.isArray(m.categories[cat])) {
      throw new ManifestError('categories.' + cat + ' must be an array');
    }
  }
  if (!m._meta || typeof m._meta !== 'object') {
    throw new ManifestError('Missing _meta object');
  }
  if (!m._meta.category_defaults || typeof m._meta.category_defaults !== 'object') {
    throw new ManifestError('Missing _meta.category_defaults');
  }
}

// Compute the GitHub release tarball URL for a given manifest + version.
// Format: https://github.com/<owner>/<repo>/archive/refs/tags/v<version>.tar.gz
function tarballUrl(manifestOrParts, version) {
  let owner, repo;
  if (manifestOrParts.github_owner && manifestOrParts.github_repo) {
    owner = manifestOrParts.github_owner;
    repo = manifestOrParts.github_repo;
  } else {
    // Fallback: parse from canonical_url like "https://github.com/Insynq/app-blueprint"
    const m = /github\.com[:/]+([^/]+)\/([^/.]+)/.exec(manifestOrParts.canonical_url || '');
    if (!m) throw new ManifestError('Cannot derive github_owner/repo from manifest');
    owner = m[1];
    repo = m[2];
  }
  const v = version.startsWith('v') ? version : 'v' + version;
  return 'https://github.com/' + owner + '/' + repo + '/archive/refs/tags/' + v + '.tar.gz';
}

module.exports = {
  MANIFEST_FILE,
  ManifestError,
  loadFromDir,
  validate,
  tarballUrl,
};
