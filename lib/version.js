'use strict';

// Writes .framework-version with the schema PM annotation 2 fixed:
//   { version, installed_at, tarball_sha256, installed_method, canonical_url }

const fsp = require('fs/promises');
const path = require('path');

async function writeFrameworkVersion(repoRoot, fields) {
  const payload = {
    version: fields.version,
    installed_at: fields.installed_at || new Date().toISOString(),
    tarball_sha256: fields.tarball_sha256,
    installed_method: fields.installed_method || 'npx',
    canonical_url: fields.canonical_url,
  };
  // Optional but useful — keep nulls explicit so updates can detect missing.
  if (fields.installed_from) payload.installed_from = fields.installed_from;

  const fp = path.join(repoRoot, '.framework-version');
  await fsp.writeFile(fp, JSON.stringify(payload, null, 2) + '\n');
  return fp;
}

module.exports = { writeFrameworkVersion };
