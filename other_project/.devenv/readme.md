# Running IRiS with Authentication

This `.devenv` directory a development version of the [Identity Server](https://github.com/desdigital/IdentityServer "Identity Server Github Repository") which is built on top of Identity Server 7 (Duende) DE&S Digital Cloud Version 1.1 and, in production, allows MODNet users to automatically be authenticated without the need for manual login. This development version allows local authentication without needing access to the production identity provider.

## Prerequisites

- Rauncher Desktop running
- `.env` file created from `.env.example`

## Step 1 — Configure environment variables

Ensure the following auth-related values are set in your **root** `.env` file:

```
AUTH_ENABLED=True
AUTH_HOST=https://localhost:8443
AUTH_CLIENT_ID=dx4d_client
AUTH_CLIENT_SECRET="insert-anything-here-locally-just-not-blank"
AUTH_REDIRECT_URI=http://localhost:50505/auth/callback
AUTH_SCOPE="openid profile dx4dllm_api"
AUTH_VERIFY_SSL=false
```

> [!NOTE]
> `AUTH_CLIENT_SECRET` can be any non-empty string when running locally.
>
> `AUTH_VERIFY_SSL` must be `false` because the Identity Server uses a self-signed certificate.
>
> `AUTH_REDIRECT_URI` must use `localhost`, not `127.0.0.1`. The frontend is served on `localhost`, so the session cookie is scoped to that hostname. If the callback redirects to `127.0.0.1` instead, the browser treats it as a different origin and will not send the session cookie.

## Step 2 — Generate the TLS certificate

The Identity Server requires a self-signed certificate. From the `.devenv` directory, run the generation script (requires OpenSSL installed):

```powershell
cd .devenv
.\generate_certs.ps1
```

This creates `id_cert.pfx` (and supporting files) which the Identity Server container mounts as its HTTPS certificate. You only need to do this once — or again if the certificate expires (valid for 365 days).

## Step 3 — Authenticate with GitHub Container Registry

The Identity Server image is hosted on GitHub Container Registry. On first setup, generate a GitHub Personal Access Token (PAT) with **`read:packages`** scope selected, then log in:

```shell
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

You only need to do this once per machine.

## Step 4 — Start the Identity Server

From the `.devenv` directory:

```shell
docker compose up
```

Wait for the container to be healthy. The Identity Server will be available at **https://localhost:8443**.

## Step 5 — Start the application

Return to the repository root and start the app as normal:

**Windows:**
```shell
start.cmd
```

The app starts on `http://localhost:50505`, and serves the pre-built frontend automatically.

> [!WARNING]
> When running with `AUTH_ENABLED=true`, you **must** use production mode (`start.cmd`) where the backend serves the pre-built frontend. Development mode with separate frontend/backend servers (`start-dev.cmd`) will not work because the authentication middleware blocks CORS preflight requests from the frontend dev server (`localhost:5173`), preventing cross-origin API calls to the backend (`localhost:50505`). In production mode, both frontend and backend are served from the same origin, avoiding CORS issues entirely.

## Step 6 — Log in

1. Open **http://localhost:50505** in your browser.
2. The app will redirect you to the Identity Server login page at **https://localhost:8443**.
3. Your browser will warn about the self-signed certificate — accept and proceed.
4. Log in with one of the test users below.
5. After successful login you will be redirected back to **http://localhost:50505**.

## Test Users

Test users are configured in `.devenv/IdentityServerConfig/TestUsers.json`.

## Stopping the Identity Server

```shell
cd .devenv
docker compose down
```
