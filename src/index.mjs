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

/**
 * Headless Backstage login helper.
 *
 * Performs the full OIDC/Keycloak authorization-code flow using only Node.js
 * built-ins (fetch + cookie jar). No browser, no npm dependencies.
 *
 * @example
 * ```js
 * import { getBackstageToken } from '@oandriie/backstage-login-helper';
 *
 * const token = await getBackstageToken({
 *   username: 'ant_man',
 *   password: 'test',
 *   provider: 'oidc',
 * });
 * ```
 */

const MAX_REDIRECT_HOPS = 20;

function buildHostRewrites(envValue) {
  return (envValue || '')
    .split(',')
    .map(r => r.trim())
    .filter(r => r.includes('='))
    .map(r => {
      const [old, replacement] = r.split('=', 2);
      return [old.trim(), replacement.trim()];
    })
    .filter(([old]) => old.length > 0);
}

function applyRewrites(url, rewrites) {
  let rewritten = url;
  for (const [old, replacement] of rewrites) {
    rewritten = rewritten.replaceAll(old, replacement);
  }
  return rewritten;
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  update(response) {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const header of setCookies) {
      const [pair] = header.split(';', 1);
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        this.cookies.set(
          pair.slice(0, eqIdx).trim(),
          pair.slice(eqIdx + 1).trim(),
        );
      }
    }
  }

  header() {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function followRedirects(jar, response, rewrites, method = 'GET', body = null) {
  let resp = response;
  let currentMethod = method;
  let currentBody = body;

  for (let i = 0; i < MAX_REDIRECT_HOPS; i++) {
    const status = resp.status;
    if (![301, 302, 303, 307, 308].includes(status)) break;

    const location = resp.headers.get('location');
    if (!location) break;

    const target = applyRewrites(location, rewrites);
    const headers = {};
    const cookie = jar.header();
    if (cookie) headers.cookie = cookie;

    if ([301, 302, 303].includes(status)) {
      currentMethod = 'GET';
      currentBody = null;
    }

    resp = await fetch(target, {
      method: currentMethod,
      body: currentBody,
      redirect: 'manual',
      headers,
    });
    jar.update(resp);
  }
  return resp;
}

/**
 * Obtain a Backstage bearer token via the OIDC/Keycloak auth flow.
 *
 * @param {object} options
 * @param {string} options.username - Keycloak username (required)
 * @param {string} options.password - Keycloak password (required)
 * @param {string} [options.provider='oidc'] - Auth provider name ('oidc' or 'keycloak')
 * @param {string} [options.baseUrl='http://localhost:7007'] - Backstage backend URL
 * @param {string} [options.frontendUrl='http://localhost:3000'] - Frontend origin for popup flow
 * @param {string} [options.hostRewrite=''] - Comma-separated old=new host rewrites
 * @returns {Promise<string>} Backstage identity JWT
 */
export async function getBackstageToken({
  username,
  password,
  provider = 'oidc',
  baseUrl = 'http://localhost:7007',
  frontendUrl = 'http://localhost:3000',
  hostRewrite = '',
}) {
  const rewrites = buildHostRewrites(hostRewrite);
  const jar = new CookieJar();

  const startUrl =
    `${baseUrl}/api/auth/${provider}/start` +
    `?env=development&scope=openid+profile+email` +
    `&origin=${encodeURIComponent(frontendUrl)}&flow=popup`;

  let resp = await fetch(startUrl, { redirect: 'manual' });
  jar.update(resp);
  resp = await followRedirects(jar, resp, rewrites);

  const html = await resp.text();

  const actionMatch = html.match(/action="([^"]+)"/);
  if (!actionMatch) {
    const errorMatch = html.match(
      /id="kc-error-message"[^>]*>.*?<p class="instruction">([^<]+)<\/p>/s,
    );
    if (errorMatch) {
      throw new Error(
        `Keycloak authorization failed at ${resp.url}: ${errorMatch[1].trim()}`,
      );
    }
    throw new Error(`No Keycloak login form found at ${resp.url}`);
  }

  const loginUrl = applyRewrites(actionMatch[1].replaceAll('&amp;', '&'), rewrites);

  const loginBody = new URLSearchParams({
    username,
    password,
    credentialId: '',
  });

  const loginHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const cookie = jar.header();
  if (cookie) loginHeaders.cookie = cookie;

  let loginResp = await fetch(loginUrl, {
    method: 'POST',
    headers: loginHeaders,
    body: loginBody.toString(),
    redirect: 'manual',
  });
  jar.update(loginResp);
  loginResp = await followRedirects(
    jar,
    loginResp,
    rewrites,
    'POST',
    loginBody.toString(),
  );

  if (!loginResp.ok) {
    throw new Error(
      `Login POST failed: ${loginResp.status} ${loginResp.statusText}`,
    );
  }

  const responseText = await loginResp.text();

  const authMatch = responseText.match(/decodeURIComponent\('([^']+)'\)/);
  if (!authMatch) {
    throw new Error(`No auth response in handler/frame for ${username}`);
  }

  const authData = JSON.parse(decodeURIComponent(authMatch[1]));
  if (authData.error) {
    const message =
      typeof authData.error === 'object'
        ? authData.error.message || JSON.stringify(authData.error)
        : authData.error;
    throw new Error(`Auth error for ${username}: ${message}`);
  }

  const token = authData?.response?.backstageIdentity?.token;
  if (!token) {
    throw new Error(`No backstageIdentity token for ${username}`);
  }

  return token;
}
