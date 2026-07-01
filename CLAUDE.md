# CLAUDE.md

Guidance for working in this repo. See `README.md` for full docs; this file
captures the non-obvious bits.

## What this is

Next.js (pages router) front-end for the **nsi-orchestrator** backend. It is a
thin wrapper: nearly every screen is a component re-exported from
`@orchestrator-ui/orchestrator-ui-components`. Most `pages/*` files are
one-liners that render a `Wfo*` component. This repo only owns the integration
glue — menu, branding, translations, auth, config.

Forked from `example-orchestrator-ui`. Keep it generic: it targets NSI, but
deployment specifics (logos, cluster names, orgs) come from env vars and Helm
values, not hard-coded here.

## Where things live

- `configuration/configuration.ts` — env vars → `OrchestratorConfig` passed to
  the library.
- `pages/_app.tsx` — providers, page `<title>`, side-nav via `addMenuItems`
  (`overrideMenuItems` prop), logo wiring.
- `pages/api/auth/[...nextauth].ts` — NextAuth + generic OIDC provider.
- `components/AppLogo/AppLogo.tsx` — wordmark fallback; `APP_LOGO_URL` env
  swaps in an image, no code change needed.
- `translations/` — per-locale JSON merged over the library defaults + provider.
- `chart/` — Helm chart; image is `ghcr.io/workfloworchestrator/nsi-orchestrator-ui`.

There is **no** agent/CopilotKit page and no `example-form` here (they exist in
the upstream fork but were removed). Only a `Search` entry is added to the nav.

## Before committing

CI runs `npm run prettier` = `prettier -c "{**/*,*}.{ts,tsx,json,js,md}"` and
fails on any unformatted file — **including Markdown**. Always run:

```sh
npm run prettier-fix   # or: npx prettier --write <file>
npm run lint
npm run tsc
```

A Husky `pre-commit` hook runs formatting/linting on staged files.
</content>
