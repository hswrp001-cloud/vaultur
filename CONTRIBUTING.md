# Contributing to Vaultur

Issues and PRs are welcome.

## Before you start

Read **[CLAUDE.md](CLAUDE.md)** — it documents the conventions this codebase
leans on (error envelopes, request-body parsing, admin-settings wiring, etc.),
useful whether or not you're using an AI coding agent. **vaultwarden is the
behavioral reference**: when a response shape or permission rule is unclear,
the [vaultwarden source](https://github.com/dani-garcia/vaultwarden) is the
tiebreaker, ported field-for-field (camelCase keys, `object` discriminators,
list envelopes).

## Setup

```bash
pnpm install
pnpm exec lefthook install         # activates local git hooks (see below)
cp .env.example .env               # set JWT_SECRET
pnpm db:migrate:local && pnpm dev  # http://localhost:8787
```

## Making a change

- New behavior needs a test in `test/*.spec.ts`. Tests run against a real
  Worker in workerd via `@cloudflare/vitest-pool-workers` (D1/KV/R2/DO
  bindings included) — don't mock the platform. External services (YubiCloud,
  Duo, OIDC providers) are mocked at the fetch layer with `fetchMock` from
  `cloudflare:test`; see `test/{sso,yubikey-duo}.spec.ts` and
  [docs/testing.md](docs/testing.md).
- Every vaultwarden route must stay covered by
  [test/route-parity.spec.ts](test/route-parity.spec.ts) — it fires a request
  at all ~245 vaultwarden routes and fails if one goes missing.
- Schema changes go in `src/db/schema.ts`, then run `pnpm db:generate`
  (drizzle-kit). Never hand-edit the generated SQL under `migrations/`.
- New admin-editable settings need both an env default in `config.ts` and a
  form field in `config-schema.ts` (`SETTINGS_GROUPS`) — skipping the latter
  leaves it as an env-only var, invisible in the admin UI.
- Formatting is oxfmt (tabs, double quotes, no semicolons, 100-col). Run
  `pnpm format` before pushing.

## Before opening a PR

Fork the repository, make your change on a branch in your fork, and open a PR
against `nommyt/vaultur:main`. External contributors do not need collaborator
access. The maintainer reviews and merges PRs after the required checks pass.

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

[lefthook](https://lefthook.dev) runs `format:check` + `typecheck` before each
commit once installed (`pnpm exec lefthook install`). CI runs those checks,
`test`, `test:heavy`, and `build` on every PR.

## Reporting bugs / requesting features

Use the issue templates. For security vulnerabilities, see
[SECURITY.md](SECURITY.md) instead of opening a public issue.
