# Production / PR Safety

GitHub Actions workflow `.github/workflows/pr-production-safety.yml` performs a
read-only safety check for pull requests to `main`. Its green verdict is
**SAFE TO CONTINUE REVIEW**, never “safe to deploy”.

The trusted job runs only on `pull_request_target`: GitHub takes that workflow
from the protected base `main`, checks out `main`, and never checks out or
executes PR code. It fetches the PR only as Git objects for `merge-base`,
`rev-list`, `diff`, and `ls-tree`. Its permissions are `contents: read` and
`pull-requests: read`; it uses neither SSH nor production credentials.

## What it checks

- `LIVE_PROD_SHA` from `https://audiolad.ru/api/health/build` field
  `deployCommit`;
- current GitHub `refs/heads/main` and current PR head (not SHA from a PR
  description);
- the main ref again immediately before verdict; if it changed, the result is
  `BLOCK MERGE` / stale;
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
- no repository write token;

It runs on GitHub-hosted runners using public HTTPS health metadata and
read-only GitHub API access.

## Blocking conditions

The check blocks when production SHA cannot be determined or fetched, production
is not an ancestor of main or the PR, the PR is behind/diverged from current
main, duplicate migration versions exist, or a repository validation fails.
It never rebases or merges a PR.

## Rerun

Use **Actions → Production / PR Safety → Run workflow**, choose the trusted
`main` workflow ref, and supply an open numeric `pr_number` that targets
`main`. The workflow resolves main and PR head again at runtime, so no SHA must
be copied into the UI.

`workflow_dispatch` is diagnostic/manual verification only. It must not be
treated as a replacement for a required PR check because GitHub does not
guarantee that a manually dispatched run attaches its status to the required
PR head. To rerun a required PR check, use GitHub’s rerun action on the
original PR workflow run or push a new PR commit.

## Required check setup

Bootstrap order:

1. Review and merge this infrastructure PR normally.
2. Deploy main through the separately approved release process.
3. Confirm `GET /api/health/build` includes a valid `deployCommit`.
4. Run the trusted guard on a real PR and obtain a green run.
5. Only then consider making **Production / PR Safety** required in main branch
   protection.

This repository change does not modify branch protection.

## Required-check trust model

For future PRs, the **Production / PR Safety** job is protected from PR code:
`pull_request_target` supplies the workflow from base main and its trusted job
does not checkout the PR. The separate **PR Repository Validation** job runs
build/typecheck/lint/migration tests from the PR under ordinary `pull_request`
semantics; it is not the production-lineage security source of truth.

The bootstrap PR itself is an exception: until it is merged, current main
cannot supply this workflow. The workflow dispatch job is also diagnostic and
must be launched from `main`. Protecting workflow files themselves with a
GitHub Ruleset/CODEOWNERS is recommended as an additional governance layer;
branch protection cannot make a PR-branch `pull_request` workflow trusted by
itself.

The guard does not replace staging, live RLS checks, runtime smoke, or explicit
production deployment approval.
