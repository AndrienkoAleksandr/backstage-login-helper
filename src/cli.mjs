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

import { parseArgs } from 'node:util';
import { getBackstageToken } from './index.mjs';

async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: 'string' },
      password: { type: 'string' },
      provider: { type: 'string', default: 'oidc' },
      'base-url': { type: 'string', default: process.env.BASE_URL || 'http://localhost:7007' },
      'frontend-url': { type: 'string', default: process.env.FRONTEND_URL || 'http://localhost:3000' },
      'host-rewrite': { type: 'string', default: process.env.KEYCLOAK_HOST_REWRITE || '' },
    },
  });

  if (!values.user || !values.password) {
    process.stderr.write(
      'Usage: backstage-login --user <name> --password <pwd> [options]\n' +
      '\n' +
      'Options:\n' +
      '  --provider       Auth provider (default: oidc)\n' +
      '  --base-url       Backstage backend URL (default: $BASE_URL or http://localhost:7007)\n' +
      '  --frontend-url   Frontend origin (default: $FRONTEND_URL or http://localhost:3000)\n' +
      '  --host-rewrite   Host rewrites, e.g. keycloak:8080=localhost:8080\n',
    );
    process.exit(1);
  }

  const token = await getBackstageToken({
    username: values.user,
    password: values.password,
    provider: values.provider,
    baseUrl: values['base-url'],
    frontendUrl: values['frontend-url'],
    hostRewrite: values['host-rewrite'],
  });

  process.stdout.write(`${token}\n`);
}

main().catch(err => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
