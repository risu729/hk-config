# Agent guide: extending hk-config

How to add or change entries in [`helpers.pkl`](helpers.pkl). For consumer usage, see
[README.md](README.md).

This guide covers **hk-config catalog policy** only. For hk step fields, template variables,
locking, hooks, and builtin behavior, use the [hk configuration docs](https://hk.jdx.dev/configuration),
[builtins reference](https://hk.jdx.dev/builtins.html), and the [hk source](https://github.com/jdx/hk)
(`pkl/builtins/`, bats tests) when you need authoritative detail beyond what is summarized here.

## Design conventions

- **Start from builtins** — hk ships maintained step definitions; use `Builtins.*` as-is when
  they already match this preset’s goals. Override only for stricter CLI, different file
  selection, or ordering — and comment why each override differs from the builtin.

- **Keep README.md in sync** — when the catalog changes, update [README.md](README.md)
  (groups/steps tables, profiles, and other consumer-facing docs) to match
  [`helpers.pkl`](helpers.pkl).

- **Separate lint and format** — when a tool exposes distinct check and format commands, use
  separate catalog steps so consumers can pick one without the other and `hk fix` only runs
  formatters that support write mode (e.g. `tombi` + `tombi-format`).

- **`types` vs `glob`** — `types` can be more precise than a broad `glob`, but do not replace a
  builtin’s `glob` with `types` just for preference; keep the builtin scope unless `types`,
  `exclude`, or a narrower `glob` fixes a real mismatch (lockfiles, tool ignores, wrong paths).

- **Lockfile handling** — exclude generated lockfiles on the **step** that should not
  process them, not in top-level `exclude`. A global exclude removes the path from every
  hook, including steps that must run when that file changes (audit/deny tools). Prefer the
  tool’s own ignore rules when it already skips lockfiles; use hk `exclude` only where the
  tool’s match is broader than what you want checked.

- **Align hk `exclude` with tool config** — if the linter’s config ignores paths but hk
  still selects them (wide `glob`/`types`), add the same paths on the step `exclude` so hk
  does not spawn the tool on files it would skip anyway.

- **Fix file selection, not CLI silence** — do not add flags whose only job is to suppress
  “no files matched” or similar noise from mis-scoped globs; narrow `glob`/`types`/`exclude`
  instead.

- **Explicit `Config.Step` / `Config.Hook`** — custom catalog steps and `standardHooks()` entries
  must use `new Config.Step { … }` / `new Config.Hook { … }`, not anonymous `{ … }` objects.
  Anonymous objects break when consumers `amends presets.pkl`. Prefer `Builtins.*` or
  `(Builtins.*) { … }` for overrides; do not amend builtins that carry `tests`.

See [Lockfiles and `types`](#lockfiles-and-types), [Template variables](#template-variables), [`check` / `check_diff` / `check_list_files`](#check-check_diff-check_list_files-and-fix), [`batch`](#batch), [`stomp` and `workspace_indicator`](#stomp-and-workspace_indicator), [oxfmt conflicts](#oxfmt-conflicts), and [Profiles](#profiles) for more detail and catalog examples.

## Mental model

1. hk **selects files** (`glob`, `types`, `exclude`, groups `dir`).
2. Each tool enforces quality via **CLI flags** and its own config (`.oxfmtrc.json`, etc.).
3. [`helpers.pkl`](helpers.pkl) exports a lazy **`lintSteps()`** catalog and **`pick()`**
   to opt in. Builtin references live inside `lintSteps()` so `pkl eval helpers.pkl`
   does not load every builtin at module load time.

## Adding a new catalog step

1. **Check for a builtin** in [hk builtins](https://hk.jdx.dev/builtins.html). Start from
   `Builtins.<name>` and override only what differs.

2. **Add an entry** inside `lintSteps()` in [`helpers.pkl`](helpers.pkl):

```pkl
["my-linter"] = (Builtins.some_tool) {
  // some-tool ≥ 1.2.0 — `--new-flag` added in 1.2.0
  check = "some-tool --strict {{ files }}"
}
```

3. **Pick key** = map key (kebab-case). Groups use one top-level key (e.g. `github-actions`).

4. **Pin the tool** in consumer `mise.toml`.

5. **Sync [README.md](README.md)** — groups/steps tables (mise tools column); profiles or
   other consumer docs if the step behavior affects them.

6. Run `mise run check`.

### Override comments

Document **intent**, not just the delta: why this preset needs a stricter or different
behavior than the hk builtin default (flags, command, file filter, `batch`, ordering). If the
builtin is sufficient, use it with no block.

### `check`, `check_diff`, `check_list_files`, and `fix`

hk step commands are not interchangeable — they control **check mode**, **fix probing**, and
**which files `fix` touches**.

| Field | Use case |
| ----- | -------- |
| `check` | Exit non-zero on failure; human-readable errors on stderr |
| `check_list_files` | Exit non-zero when fixes needed; **stdout = one file path per line** |
| `check_diff` | Exit non-zero when fixes needed; **stdout = unified diff** (hk may `git apply` it) |
| `fix` | Mutating command for `hk fix` / pre-commit |

**`hk check`** (read-only) uses the first defined command, in order: `check` → `check_diff` →
`check_list_files`. A step with both `check` and `check_list_files` (e.g. `Builtins.oxfmt`)
runs `check` in check mode — not the list command.

**`hk fix` / pre-commit** (`fix = true`, `check_first = true` by default) runs a **probe**
under read locks first (`check_diff` → `check` → `check_list_files`). Exit **0** skips `fix`;
non-zero narrows the file set (parse diff or paths) and runs `fix` with write locks on that
subset only. This keeps parallelism and avoids rewriting clean files.

| | `check_list_files` | `check_diff` |
| - | ------------------ | ------------ |
| Tool output | Paths (`oxfmt --list-different`, `prettier --list-different`) | Unified diff (`shfmt -d`, `rumdl fmt --check --diff`) |
| On fix failure | Runs `fix` on narrowed files | hk tries **`git apply` first**; `fix` only if apply fails |
| Good for | Tools with `--list-different` / `-l` | Tools with `-d` / `--diff` / patch output |

**When plain `check` is enough:** linters with no autofix (`actionlint`, `tombi lint`) or steps
without `fix`. **Formatters with `fix`:** prefer builtins that already ship `check_diff` or
`check_list_files` (oxfmt, shfmt, pinact, rumdl, yamlfmt) instead of a bare `check` + `fix`
pair. Override `check_diff` / `check_list_files` only when stricter flags differ from the
builtin probe.

**Misconfiguration:** if `check_list_files` exits non-zero but prints **no paths**, hk treats
that as a tool failure, not “files need fixing”.

Catalog examples: `pinact`, `zizmor`, `shfmt`, `rumdl-format` use `check_diff`; `oxfmt` keeps
builtin `check_list_files`.

### Minimum tool versions

Only when **updating** a step: if the change uses **CLI flags or behavior that require a
specific tool version**, add a short comment noting the minimum version. Do not research or
annotate minimum versions for existing config that already works.

```pkl
// pkl format requires pkl ≥ 0.30
["pkl-format"] = Builtins.pkl_format

// pinact ≥ 4.0 — v4 primary flags
["pinact"] = (Builtins.pinact) {
  check_diff = "pinact run --verify-comment --check {{ files }}"
  ...
}
```

### Groups and partial picks

`pick()` accepts **group keys** (whole group) or **step keys** (one step from inside a group):

```pkl
helpers.pick(new Listing { "hk" })           // all hk group steps
helpers.pick(new Listing { "hk-validate" })  // hk validate only
```

When adding a group, append its pick key to `catalogGroupNames` in [`helpers.pkl`](helpers.pkl).

### `depends`

Use `depends` to enforce **step order** when one tool assumes another has already run (e.g.
workflow pinning before workflow lint). List form: `depends = List("other-step")`. Order
specific tools, not whole-repo serialization.

### Lockfiles and `types`

hk file selection is per step. Lockfiles are often matched by `types` or broad globs, but
many formatters/linters should not rewrite or lint them; other steps exist specifically to
validate lock state when those files change.

| Principle | Why |
| --------- | --- |
| Step-level `exclude` for lockfiles | Skips noise for formatters/linters without hiding the file from audit steps |
| Avoid top-level `exclude` for lockfiles | Applies to all hooks — audit/deny steps stop triggering on lockfile edits |
| Tool-native ignore first | If the formatter already ignores a path (e.g. oxfmt on npm lockfiles), do not duplicate in hk |
| `types` + `exclude` together | When `types` matches lockfiles the tool should skip (e.g. `types = toml` + `exclude = List("Cargo.lock")`) |

Examples in this catalog:

| Step filter | Lockfile handling |
| ----------- | ----------------- |
| `tombi` / `tombi-format` | Builtin `glob = **/*.toml` — `Cargo.lock` not matched |
| `cargo-deny` glob | **Include** `Cargo.lock` as a trigger |
| `oxfmt` | Tool ignores common JS lockfiles — no hk exclude |
| `yamlfmt` / `yamllint` | `exclude = yamlLockExcludes` (`pnpm-lock.yaml`, `aube-lock.yaml`) |

### `batch`

`batch` is **not** “can this tool accept many files?” — it controls whether **hk** splits
matched files into **multiple parallel jobs** ([hk configuration](https://hk.jdx.dev/configuration)):

| `batch` | Behavior |
| ------- | -------- |
| `false` (default) | One invocation with **all** matching files |
| `true` | Split into chunks; run **multiple processes in parallel** |

**`batch = true`** — slow, single-threaded tools where per-chunk parallelism helps (e.g.
prettier, eslint, shfmt; many hk builtins set this).

**`batch = false`** — fast native tools that handle many files efficiently in one call (e.g.
oxfmt, biome, rustfmt). Do not override unless you have a measured reason.

**ARG_MAX is separate** — even with `batch = false`, hk auto-splits when the rendered command
would exceed ARG_MAX ([jdx/hk#901](https://github.com/jdx/hk/pull/901)). You do not need
`batch = true` for large file lists.

**`batch = false` for other reasons** — commands with no `{{ files }}` (e.g. `mise fmt`,
`mise task validate`, `cargo clippy`). Setting `batch = true` on a repo-wide command repeats
the whole run per chunk.

Do not toggle `batch` for caching or tooling quirks; fix config or step design instead.

**This catalog** — leave default `false` for fast native tools (`oxfmt`, `oxlint`, `pinact`,
`zizmor`, `tombi`, `typos`, …). Keep builtin `batch = true` where hk sets it (`actionlint`,
`shfmt`, `shellcheck`).

### Template variables

Commands use [hk template variables](https://hk.jdx.dev/configuration#template-variables)
(Tera). This catalog mostly uses:

| Variable | Use |
| -------- | --- |
| `{{ files }}` | Default — shell-quoted paths, space-separated (`tombi lint {{ files }}`) |
| `{{ files_list }}` | Raw path list for `stdin`, Tera filters, or custom joining |

Use `{{ files }}` for normal per-file CLI args. Reach for `{{ files_list }}` when piping into
`xargs`, setting step `stdin`, or building Tera expressions — see hk docs for `stdin` and
[file_list / files_list](https://hk.jdx.dev/configuration#stdin-string).

With `workspace_indicator`, hk also exposes `{{ workspace }}`, `{{ workspace_indicator }}`, and
`{{ workspace_files }}`. Git state (`git.staged_files`, etc.) and other variables are documented
in hk configuration — refer there rather than duplicating the full list.

### `stomp` and `workspace_indicator`

Project-scoped steps are documented in [hk configuration](https://hk.jdx.dev/configuration)
(`.stomp`, `.workspace_indicator`). Summary for catalog and consumer helpers:

**`workspace_indicator`** — hk walks up from each matched file until it finds the named marker
(e.g. `tsconfig.json`, `Cargo.toml`, `package.json`), then runs **one job per workspace**.
Use for monorepos where the tool ignores per-file `{{ files }}` and runs against a manifest or
project file (`tsc -p`, `cargo clippy --manifest-path`, …). Many builtins already set it —
prefer `Builtins.tsc`, `cargo_clippy`, etc. unless a repo-specific command needs an override.

**When not to use it:** single-package repos (a `Group { dir = "…" }` is enough); multiple
project files in one directory (separate amended steps); ordering — use `depends`, not
`workspace_indicator`.

**`stomp`** — skip hk read/write file locks for that step ([hooks / locking](https://hk.jdx.dev/hooks.html)).
Pair with **check-only, project-wide** steps so parallel formatters are not blocked. Do not use
on fix/format steps unless you accept concurrent writes.

This repo: catalog `tsc` is `Builtins.tsc`. Amend picked steps in `hk.pkl` for `dir`,
`workspace_indicator`, `depends`, `glob`, etc.

### oxfmt conflicts

Multiple formatters can target the same paths. When a consumer picks oxfmt alongside another
formatter for the same file type, **narrow oxfmt’s `exclude`** so each path has one owner —
avoid two formatters rewriting the same file in one hook.

`pick()` applies this automatically when oxfmt is co-picked with formatters:

| Co-picked formatter | Paths excluded from oxfmt |
| ------------------- | ----------------------- |
| `tombi-format` | `**/*.toml` |
| `yamlfmt` | `**/*.yml`, `**/*.yaml` |
| `rumdl-format` | `**/*.md`, `**/*.markdown` |

### Profiles

Use hk **profiles** for steps that are slow, network-dependent, or prone to flaky failures —
keep them off the default pre-commit / CI path and opt in explicitly (`--profile <name>` or
a task flag). Do not use profiles to skip required lint on every commit.

Example: `lychee` uses `profiles = List("flaky")`; see README for `mise run check --flaky`.

### Shell file matching

When both `glob` and `types` are set on a step, hk requires **both** to match (AND), not either.

Do not add `types` on top of a builtin that already sets `glob` — use the builtin scope, a
replacement filter (`types` **or** `glob`, not both), or consumer `glob` overrides in `hk.pkl`.

`types = shell` covers extension and shebang scripts; paths like `.bashrc` without a shebang need
**consumer-specific `glob`** in `hk.pkl`.

### `hygiene` group

Subset of [hk util builtins](https://hk.jdx.dev/builtins.html) with default settings. When hk
adds a new util builtin, include it in [`helpers.pkl`](helpers.pkl) unless it is already listed
below.

**Excluded:**

- `detect-private-key` — use catalog `betterleaks` for secrets scanning
- `check-added-large-files`
- `check-byte-order-marker` — deprecated since hk 1.30.0 ([jdx/hk#595](https://github.com/jdx/hk/pull/595)); use `byte-order-marker`
- `check-conventional-commit`
- `fix-byte-order-marker` — deprecated since hk 1.30.0 ([jdx/hk#595](https://github.com/jdx/hk/pull/595)); use `byte-order-marker`
- `no-commit-to-branch`
- `python-check-ast`
- `python-debug-statements`

### Typecheck (`tsc`)

Pick `tsc` from the catalog (`Builtins.tsc`, `workspace_indicator = "tsconfig.json"`,
`tsc --noEmit`). One `tsconfig.json` per tree is enough for most repos. Amend in consumer
`hk.pkl` when you need `dir`, a non-default `workspace_indicator`, `depends` (e.g. codegen
before typecheck), or extra `glob` entries (`checkJs`, `.astro`, …). Install `npm:typescript`
(e.g. `7.0.1-rc` for the native compiler) via mise for `hk install --mise`.

## hk version bumps

[`presets.pkl`](presets.pkl) inlines `min_hk_version = "x.y.z"` (no hooks). Consumer `hk.pkl`
sets `hooks`. [Renovate](.github/renovate.json5) bumps hk `package://…` imports and README
example tags; [`renovate-config`](https://github.com/risu729/renovate-config) bumps
`hk-config` raw URL tags in consumer `hk.pkl`.

## Checklist for new steps

1. Builtin sufficient? If not, minimal override with intent comment.
2. Custom step or hook? Use `new Config.Step` / `new Config.Hook` (not anonymous `{ … }`).
3. File scope — keep builtin `glob` unless `types`, `exclude`, or a narrower `glob` fixes a real mismatch; lockfile excludes where needed.
4. Formatters with `fix`: builtin `check_diff` or `check_list_files` when available; plain `check` only for non-fix linters.
5. When updating: min tool version comment if new flags require it.
6. `batch` / `depends` / `profiles` only when the tool or workflow requires it.
7. Sync [README.md](README.md) with catalog changes.
8. `mise run check`.
