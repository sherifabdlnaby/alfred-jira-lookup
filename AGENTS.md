# AGENTS.md

## Toolchain (mise)

This project uses [**mise**](https://mise.jdx.dev) to pin tools, expose tasks, and wire git hooks. `mise.toml` is the source of truth. Don't install tools by hand or add ad-hoc scripts; add a mise tool or task instead.

**Setup** (once, and per new worktree): `mise trust && mise run setup`.

**Run via mise.** Run `mise run check` before you call work done. A few examples, not the full list:

```sh
mise run check          # all linters/formatters/validators (alias: lint); add --fix to auto-fix
mise run build          # zip src/ into the .alfredworkflow (--version vX.Y.Z stamps info.plist)
mise run test           # tests (placeholder — none yet)
mise tasks              # discover every task
mise run <task> --help  # a task's flags
```

Prefer `mise run <task>` over calling the tool directly, so local, hooks, and CI stay in sync.

## Git hooks (hk)

Commits run [hk](https://hk.jdx.dev), the same `check` CI runs, to format and lint staged files. Fix failures with `mise run check --fix`. Don't disable steps to push a commit through; `git commit --no-verify` skips hooks for a WIP commit.

## Project notes

- The workflow source lives in `src/`: `index.js` (cached search), `search-live.js` (live Jira API), `update-data.js` (cache refresh), `utils/`, and `info.plist` (the real Alfred workflow definition — the root `info.plist` is an unrelated stub).
- JS deps install into `src/node_modules` (gitignored). `mise.toml` puts `src/node_modules/.bin` on `PATH` so `eslint`/`prettier`/`run-node` resolve. `mise run build` vendors those deps into the `.alfredworkflow` bundle.
- **ESLint** uses a flat config at `src/eslint.config.mjs` (ESLint 9, `@eslint/js` recommended + node globals); formatting is owned by **Prettier** via the root `.prettierrc.json`. hk's `eslint` step points at `src/eslint.config.mjs` so plugins resolve from `src/node_modules`.
- `src/info.plist` carries a placeholder version (`1.0.0`); `mise run build --version vX.Y.Z` stamps the real version into a throwaway copy at build time, then restores the placeholder.
- `mise run clean` removes `build/` and `src/node_modules/`.

## Extending the setup

Changing tools, tasks, env, or hooks? Edit the config, don't bolt on scripts, then run `mise run check`. Where things live:

- **`mise.toml`**: the source of truth for `[tools]`, `[tasks]`, `[vars]`, `[settings]`, and `[hooks]`.
- **`mise.lock`**: resolved versions plus checksums. Commit it; regenerate with `mise install` then `mise lock --platform macos-arm64,linux-x64` after a `[tools]` change.
- **`.mise/`**: project-local state (gitignored), like the setup stamp the `setup`/`enter` hooks read.
- **`hk.pkl`**: the pre-commit and `check` pipeline (linters and formatters, in Pkl). Add or edit a lint step here.
- Linter config scaffolds live at the repo root (`typos.toml`, `.betterleaks.toml`, `lychee.toml`, `rumdl.toml`, `.yamllint`); JS lint/format config in `src/eslint.config.mjs` and `.prettierrc.json`.

For tool, task, and hook syntax, see the [mise](https://mise.jdx.dev) and [hk](https://hk.jdx.dev) docs.
