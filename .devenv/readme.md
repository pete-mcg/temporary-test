# Local Development with Identity Server

.devenv contains a development version of the [Identity Server](https://github.com/desdigital/IdentityServer "Identity Server Github Repository") which is built on top of Identity Server 7 (Duende) DE&S Digital Cloud Version 1.1 and, in production, allows MODNet users to automatically be authenticated without the need for manual login.

This development version uses manual login for users configured in `.devenv\IdentityServerConfig\TestUsers.json`

### Setting up Test Users

Create `TestUsers.json` in `.devenv\IdentityServerConfig\`, in the following format:

[
  {
    "UserName": "{insert here}",
    "Password": "{insert here}",
    "Email": "{insert here}",
    "DisplayName": "{insert here}",
    "FullDisplayName": "{insert here}"
  },
  ...
]

### Running generate_certs.ps1

Open Administrator PowerShell window.

Install OpenSSL via Chocolatey

```powershell
choco install openssl -y
```

Verify installation by using

```powershell
openssl version
```

Navigate to .devenv:

```powershell
cd .devenv
```

Run the PowerShell script

```powershell
.\generate_certs.ps1
```

### Pre-requisites
[Generate a PAT token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) and add it to the shell's path 

### Start up

To run identity server locally, navigate to .devenv:

```bash
cd .devenv
```

Login to docker repo

```bash
echo GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

Ensuring Docker Desktop is running, execute:

```bash
docker-compose up -d
```

This builds a container from the image specified in `.devenv\docker-compose.yml`, with config specified in the `.json` files in `.devenv\IdentityServerConfig\`

It may take some time to start up fully but will be available at `https://localhost:8443/`.

### Shutting down

To shut down the identity server instancem run:

```bash
docker-compose down
```

This will shut down identity server and delete the container.

If you make any changes to the config (e.g. TestUsers or Resources), you must make sure to delete the container and start it up again before these changes will take effect.