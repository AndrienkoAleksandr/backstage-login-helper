#!/usr/bin/env node
/*
 * Copyright 2026 Oleksandr Andriienko
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { getBackstageToken } from './index.mjs';

function parseCsv(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const fields = [];
      let current = '';
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      fields.push(current);
      return fields;
    });
}

function toCsvLine(fields) {
  return fields
    .map(f => {
      if (f.includes(',') || f.includes('"') || f.includes('\n')) {
        return `"${f.replaceAll('"', '""')}"`;
      }
      return f;
    })
    .join(',');
}

const MAX_LOGIN_RETRIES = 4;

async function loginUsersFromCsv(csvPath, opts) {
  const text = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(text);
  const updated = [];

  for (const row of rows) {
    if (row[0].startsWith('#') || row[0].toLowerCase() === 'email') {
      updated.push(row);
      continue;
    }

    const email = row[0];
    const password = row[1] || 'test';
    const expected = row[2] || '';
    const username = email.split('@')[0];

    let token = '';
    let lastError;

    for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
      try {
        process.stderr.write(`Logging in ${email} ...\n`);
        token = await getBackstageToken({ username, password, ...opts });
        break;
      } catch (err) {
        lastError = err;
        process.stderr.write(`  attempt ${attempt} failed: ${err.message}\n`);
        if (attempt < MAX_LOGIN_RETRIES) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    if (!token) {
      throw new Error(
        `Login failed for ${email} after ${MAX_LOGIN_RETRIES} attempts: ${lastError?.message}`,
      );
    }

    updated.push([email, password, expected, token]);
  }

  const csvOut = updated.map(toCsvLine).join('\n') + '\n';
  writeFileSync(csvPath, csvOut, 'utf-8');
  return updated;
}

async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: 'string' },
      password: { type: 'string', default: 'test' },
      csv: { type: 'string' },
      provider: { type: 'string', default: 'oidc' },
      'base-url': { type: 'string', default: process.env.BASE_URL || 'http://localhost:7007' },
      'frontend-url': { type: 'string', default: process.env.FRONTEND_URL || 'http://localhost:3000' },
      'host-rewrite': { type: 'string', default: process.env.KEYCLOAK_HOST_REWRITE || '' },
    },
  });

  const opts = {
    provider: values.provider,
    baseUrl: values['base-url'],
    frontendUrl: values['frontend-url'],
    hostRewrite: values['host-rewrite'],
  };

  if (values.user) {
    const token = await getBackstageToken({ username: values.user, password: values.password, ...opts });
    process.stdout.write(`${token}\n`);
    return;
  }

  if (values.csv) {
    await loginUsersFromCsv(values.csv, opts);
    process.stderr.write(`Updated tokens in ${values.csv}\n`);
    return;
  }

  process.stderr.write(
    'Usage:\n' +
    '  backstage-login --user <name> [--password <pwd>] [--provider oidc|keycloak]\n' +
    '  backstage-login --csv <path>\n' +
    '\n' +
    'Options:\n' +
    '  --provider       Auth provider (default: oidc)\n' +
    '  --base-url       Backstage backend URL (default: $BASE_URL or http://localhost:7007)\n' +
    '  --frontend-url   Frontend origin (default: $FRONTEND_URL or http://localhost:3000)\n' +
    '  --host-rewrite   Host rewrites, e.g. keycloak:8080=localhost:8080\n',
  );
  process.exit(1);
}

main().catch(err => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
