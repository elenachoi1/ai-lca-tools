---
name: github-pages-setup
description: >
  Set up GitHub Pages for this Vite workspace. Use when the user asks to publish
  the AI Chat Tool, enable Pages, configure a Pages workflow, or obtain its
  public URL.
---

# GitHub Pages Setup (Vite Workspace)

Publish the production output from `apps/ai-chat-tool/dist` with GitHub Actions.
Do not configure Pages to serve the repository root: this application requires
a TypeScript/Vite build.

## 1. Inspect before changing anything

```bash
git status --short
git remote -v
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef
```

Confirm the intended repository and preserve unrelated local changes. Publishing
and changing repository settings are external writes, so confirm the user's
request covers them before proceeding.

## 2. Configure the Vite base path

GitHub project Pages sites are hosted below `/<repository-name>/`. Configure
Vite's `base` from an environment variable so local development remains rooted
at `/` and the Pages build can use the repository subpath.

In `apps/ai-chat-tool/vite.config.ts`, use a value such as:

```ts
base: process.env.VITE_BASE_PATH || '/',
```

The workflow should set `VITE_BASE_PATH` to `/${{ github.event.repository.name }}/`.
For a user or organization Pages repository named `<owner>.github.io`, use `/`.

## 3. Add the deployment workflow

Create `.github/workflows/pages.yml` with least-privilege Pages permissions. The
workflow should:

1. Check out the repository.
2. Set up the current Node.js LTS release with npm caching.
3. Run `npm ci` from the repository root.
4. Run `npm run lint`, `npm run check`, `npm test`, and `npm run build`.
5. Upload `apps/ai-chat-tool/dist` with `actions/upload-pages-artifact`.
6. Deploy with `actions/deploy-pages` in a `github-pages` environment.

Use the current major versions of official GitHub actions after verifying them
against their upstream repositories. Trigger deployment on pushes to the actual
default branch and allow `workflow_dispatch`.

## 4. Verify the build locally

```bash
npm ci
VITE_BASE_PATH="/$(basename "$(git rev-parse --show-toplevel)")/" npm run build
test -f apps/ai-chat-tool/dist/index.html
```

Inspect the built `index.html` and confirm asset URLs include the expected base
path.

## 5. Enable Pages for GitHub Actions

After the workflow is pushed, set Pages to use GitHub Actions. Prefer the GitHub
repository settings UI or the current GitHub API/CLI support after checking the
official documentation. Do not use the legacy branch-and-folder Pages source for
this Vite application.

Then inspect the workflow and deployment:

```bash
gh run list --workflow pages.yml --limit 5
gh api "repos/{owner}/{repo}/pages" --jq '{status: .status, url: .html_url}'
```

## Handoff

Report:

- The Pages URL.
- The workflow run status.
- The configured Vite base path.
- Any required repository setting the user must still enable.
