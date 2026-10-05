## Updating the `@orchestrator-ui/...` packages

All `@orchestrator-ui/...` packages are pinned to an exact version in `package.json`. Renovate opens a PR
for each new release; to upgrade by hand:

```bash
npm install --save-exact @orchestrator-ui/orchestrator-ui-components@<version>
npm install --save-exact --save-dev @orchestrator-ui/eslint-config-custom@<version>
npm install --save-exact --save-dev @orchestrator-ui/jest-config@<version>
npm install --save-exact --save-dev @orchestrator-ui/tsconfig@<version>
```

Releases younger than `min-release-age` in `.npmrc` are refused; add `--min-release-age=0` to install
one anyway.

Before upgrading, read the library release notes for breaking changes and the orchestrator-core
version they require. Then run `npm run tsc`, `npm run lint` and `npm test`.
