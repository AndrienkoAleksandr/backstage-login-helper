# @oandriie/backstage-login-helper

Headless Backstage login helper — obtain bearer tokens via the Keycloak OIDC authorization-code flow without a browser or frontend app. Uses only Node.js built-ins, zero npm runtime dependencies.

## Install

```bash
npm install @oandriie/backstage-login-helper
```

Requires Node.js 18+.

## Features

- **OIDC and Keycloak auth providers** — works with both `/api/auth/oidc/start` and `/api/auth/keycloak/start`
- **Zero runtime dependencies** — only Node.js built-ins
- **Library and CLI** — import `getBackstageToken()` in code or use the `backstage-login` CLI
- **Cookie jar + redirect following** — full authorization-code flow with manual redirect handling
- **Docker host rewriting** — remap hostnames when Keycloak runs in a container (e.g. `keycloak:8080=localhost:8080`)

## CLI usage

```bash
npx @oandriie/backstage-login-helper --user ant_man --password test
npx @oandriie/backstage-login-helper --user ant_man --password test --provider keycloak
```

### CLI options

| Option           | Default                                   | Description                          |
| ---------------- | ----------------------------------------- | ------------------------------------ |
| `--user`         | **(required)**                            | Keycloak username                    |
| `--password`     | **(required)**                            | Keycloak password                    |
| `--provider`     | `oidc`                                    | Auth provider (`oidc` or `keycloak`) |
| `--base-url`     | `$BASE_URL` or `http://localhost:7007`    | Backstage backend URL                |
| `--frontend-url` | `$FRONTEND_URL` or `http://localhost:3000` | Frontend origin for popup flow       |
| `--host-rewrite` | `$KEYCLOAK_HOST_REWRITE`                  | Host rewrites (comma-separated)      |

## Library usage

```js
import { getBackstageToken } from '@oandriie/backstage-login-helper';

const token = await getBackstageToken({
  username: 'ant_man',
  password: 'test',
  provider: 'oidc',                    // 'oidc' (default) or 'keycloak'
  baseUrl: 'http://localhost:7007',     // Backstage backend
  frontendUrl: 'http://localhost:3000', // popup flow origin
  hostRewrite: '',                      // e.g. 'keycloak:8080=localhost:8080'
});
```

## How it works

1. Hits the Backstage auth start endpoint (`/api/auth/{provider}/start`)
2. Follows redirects to the Keycloak login page (tracking cookies manually)
3. Parses the HTML login form and POSTs credentials
4. Follows redirects back to Backstage's `/handler/frame`
5. Extracts the `backstageIdentity.token` from the response

No browser, no Playwright, no Puppeteer — just `fetch` and string parsing.

## License

Apache-2.0
