# Production / PR Safety

GitHub Actions workflow `.github/workflows/pr-production-safety.yml` performs a
read-only safety check for pull requests to `main`. Its green verdict is
**SAFE TO CONTINUE REVIEW**, never “safe to deploy”.

## What it checks

- `LIVE_PROD_SHA` from `https://audiolad.ru/api/health/build` field
  `deployCommit`;
- current GitHub `refs/heads/main` and current PR head (not SHA from a PR
  description);
- ancestry: PROD → MAIN, PROD → PR, MAIN → PR, and PR → MAIN;
- ahead/behind counts and merge base;
- migrations changed from PROD to MAIN and from MAIN to PR;
- duplicate migration version prefixes;
- `npm run test:database-migrations`, typecheck, lint, and build.

The production endpoint reads `process.cwd()/.deploy-commit`, which the release
pipeline writes with the full target Git SHA. Missing or malformed metadata
returns `deployCommit: null`; the workflow blocks rather than guessing from
the Next build ID or release directory name.

## What it never does

- no SSH or self-hosted runner;
- no server shell, root access, deployment, restart, or migration apply;
- no production database credentials or SQL;
- no `pull_request_target` event and no repository write token.

It runs on GitHub-hosted runners using public HTTPS health metadata and
read-only GitHub API access.

## Blocking conditions

The check blocks when production SHA cannot be determined or fetched, production
is not an ancestor of main or the PR, the PR is behind/diverged from current
main, duplicate migration versions exist, or a repository validation fails.
It never rebases or merges a PR.

## Rerun

Use **Actions → Production / PR Safety → Run workflow**, supply `pr_number`,
and select the desired workflow ref. The workflow resolves both main and PR
head again at runtime, so no SHA must be copied into the UI.

## Required check setup

After this workflow has run successfully on `main`, a repository administrator
can add the check named **Production / PR Safety** to the `main` branch
protection required-status-check list. This repository change does not modify
branch protection.

The guard does not replace staging, live RLS checks, runtime smoke, or explicit
production deployment approval.
