# @risu729/hk-config

Shared [hk](https://github.com/jdx/hk) presets and Pkl helpers for risu729 projects.

Design goal: **strict linters** (warnings as errors, stale suppressions reported, pedantic
modes where available) with **opt-in** step selection. hk selects files; each tool enforces
quality via CLI flags and its own config file.

See [AGENTS.md](AGENTS.md) for how to extend the catalog.

## Usage

```pkl
amends "https://raw.githubusercontent.com/risu729/hk-config/v1.0.0/presets.pkl"
import "https://raw.githubusercontent.com/risu729/hk-config/v1.0.0/helpers.pkl"

hooks = helpers.standardHooks(helpers.pick(new Listing {
  "github-actions"
  "tombi-format"
  "oxfmt"
}))
```

Unknown step names fail at eval time.

`presets.pkl` sets `min_hk_version` only — your `hk.pkl` must assign
`hooks = helpers.standardHooks(helpers.pick(...))`.

`pick()` accepts **group keys** (whole group) or **step keys** (one step from inside a group).
When `oxfmt` is picked with formatters (`tombi`, `yaml`, `rumdl`, or their `*-format` steps), conflicting
paths are auto-excluded from oxfmt.

#### Pick a whole group

```pkl
helpers.pick(new Listing { "hk" })  // hk-validate, pkl, pkl-format
```

#### Pick specific steps only

```pkl
helpers.pick(new Listing {
  "hk-validate"   // not pkl / pkl-format
  "actionlint"    // not the whole github-actions group
})
```

### Examples

- [dotfiles/hk.pkl](https://github.com/risu729/dotfiles/blob/main/hk.pkl)
- [biwa/hk.pkl](https://github.com/risu729/biwa/blob/main/hk.pkl)

### Catalog keys

#### Groups

| Key | Steps |
| --- | --- |
| `github-actions` | `actionlint`, `pinact`, `ghalint`, `zizmor` |
| `shell` | `shfmt`, `shellcheck` |
| `rust` | `clippy`, `rustfmt`, `cargo-deny` |
| `tombi` | `tombi`, `tombi-format` |
| `rumdl` | `rumdl`, `rumdl-format` |
| `yaml` | `yamllint`, `yamlfmt` |
| `mise` | `mise-fmt`, `mise-tasks` |
| `hygiene` | `newlines`, `trailing-whitespace`, `mixed-line-ending`, `byte-order-marker`, `fix-smart-quotes`, `check-merge-conflict`, `check-case-conflict`, `check-symlinks`, `check-executables-have-shebangs` |
| `hk` | `hk-validate`, `pkl`, `pkl-format` |

#### Steps

All pickable step keys and the **mise tools** to install for each (`hk install --mise`).

| Step | mise tools |
| --- | --- |
| `actionlint` | `actionlint`, `shellcheck` |
| `pinact` | `pinact` |
| `ghalint` | `ghalint` |
| `zizmor` | `zizmor` |
| `shfmt` | `shfmt` |
| `shellcheck` | `shellcheck` |
| `clippy` | `cargo` |
| `rustfmt` | `cargo` |
| `cargo-deny` | `cargo-deny` |
| `mise-fmt` | `mise` |
| `mise-tasks` | `mise` |
| `hk-validate` | `hk` |
| `pkl` | `pkl` |
| `pkl-format` | `pkl` |
| `newlines` | `hk` |
| `trailing-whitespace` | `hk` |
| `mixed-line-ending` | `hk` |
| `byte-order-marker` | `hk` |
| `fix-smart-quotes` | `hk` |
| `check-merge-conflict` | `hk` |
| `check-case-conflict` | `hk` |
| `check-symlinks` | `hk` |
| `check-executables-have-shebangs` | `hk` |
| `oxlint` | `oxlint` |
| `oxfmt` | `oxfmt` |
| `tombi` | `tombi` |
| `tombi-format` | `tombi` |
| `rumdl` | `rumdl` |
| `rumdl-format` | `rumdl` |
| `typos` | `typos` |
| `yamllint` | `yamllint` |
| `yamlfmt` | `yamlfmt` |
| `hadolint` | `hadolint` |
| `lychee` | `lychee` |
| `betterleaks` | `betterleaks` |
| `tsc` | `npm:typescript` |

Step options, override reasons, and CLI flags live in [`helpers.pkl`](helpers.pkl).

### Repo-specific overrides

```pkl
amends "https://raw.githubusercontent.com/risu729/hk-config/v1.0.0/presets.pkl"
import "https://raw.githubusercontent.com/risu729/hk-config/v1.0.0/helpers.pkl"

hooks = helpers.standardHooks((helpers.pick(new Listing {
  "tombi-format"
  "oxfmt"
  "tsc"
})) {
  ["tsc-api"] = (helpers.lintSteps()["tsc"]) {
    workspace_indicator = "tsconfig.api.json"
    depends = List("generate-types")
  }
})
```

Override `hk-validate` `glob` in consumer `hk.pkl` when validating preset files beyond
`hk.pkl` (this repo dogfoods with `hk.pkl`, `presets.pkl`, `helpers.pkl`).

### Profiles (`flaky`)

The `lychee` step sets `profiles = List("flaky")`, so it is skipped unless you pass
`--profile flaky` (or `mise run check --flaky` / `--lint --flaky`).

```toml
# tasks.toml
[check]
usage = '''
flag "--lint" help="Run hk check instead of fix"
flag "--flaky" help="Also enable hk flaky profile (lychee)"
'''
run = """
hk \
  {% if usage.flaky %}--profile flaky {% endif %}\
  {% if usage.lint %}check{% else %}fix{% endif %} \
  --all --no-progress --no-fail-fast
"""
description = "Run hk linters and formatters."
```

```yaml
# .github/workflows/ci.yml
jobs:
  lint:
    steps:
      - name: Run check
        if: github.event_name != 'schedule'
        run: mise run check --lint
        env:
          GITHUB_TOKEN: ${{ github.token }}

      - name: Run flaky check
        if: github.event_name == 'schedule'
        run: mise run check --lint --flaky
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

### Updating

Extend [`renovate-config`](https://github.com/risu729/renovate-config) in your repo — it bumps
`presets.pkl` and `helpers.pkl` URL tags in `hk.pkl`.

## Layout

| File | Purpose |
|------|---------|
| `presets.pkl` | `min_hk_version` (no hooks) |
| `helpers.pkl` | `lintSteps()`, `pick()`, `standardHooks()` |
| `hk.pkl` | In-repo dogfood |
| `AGENTS.md` | How to add catalog entries |

## License

MIT — see [LICENSE](LICENSE).
