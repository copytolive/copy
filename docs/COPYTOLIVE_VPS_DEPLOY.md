# CopyToLive VPS deploy

Production deploy is handled by GitHub Actions workflow `Deploy CopyToLive VPS`.

Required repository secrets:

- `COPYTOLIVE_SSH_HOST`
- `COPYTOLIVE_SSH_USER`
- `COPYTOLIVE_SSH_PORT`
- `COPYTOLIVE_SSH_KEY`

Store them at: Settings > Secrets and variables > Actions > Repository secrets.

Never commit the private SSH key to the repository.

The deploy package is the already-built static package in this repository:

- `index.html`
- `compounding_live.html`
- `assets/`

Safety flow:

1. Validate package.
2. Connect to VPS.
3. Back up the current production files.
4. Upload into a staging directory.
5. Activate the staged release.
6. Verify production checksums and HTTP.
7. Run a headless-browser smoke test.
8. Roll back from the backup automatically if a post-activation step fails.

After the SSH secrets exist, pushes that change `index.html`, `compounding_live.html`, or `assets/**` on `main` can deploy automatically.

A manual run is also available. It requires the exact confirmation text:

`DEPLOY_COPYTOLIVE_PRODUCTION`
