# GitLab sync through Seoul

GitHub Actions calls `/api/sync` in Vercel's `icn1` region after a push to `main`. The function synchronizes only `cbjworld/local-policy-mcp` on GitHub to `conicon/local-policy-mcp` on the public GitLab instance.

`GITLAB_SYNC_TOKEN` is the existing project-scoped `write_repository` token. It is held in GitHub Actions Secrets and an encrypted Vercel environment variable, and sent only over verified HTTPS. It is not stored in temporary Git files or returned in logs or responses. The endpoint checks this credential before accessing either repository.

Only fast-forward updates to `main` are allowed. Divergent history stops the job. Each invocation uses a temporary shallow clone of the last 64 commits, at most 128 MiB of received Git data, and a 240-second network deadline; temporary files are removed afterwards. Longer gaps require a direct resync. A newer GitHub head supersedes an older queued event without pushing it.

Run `node test.cjs` for fixed-host, credential isolation, access checks, fast-forward, repeat-call, stale-event, verification and cleanup tests.

The separate `/api/check` route checks two fixed public GitLab addresses without authentication or source content.
