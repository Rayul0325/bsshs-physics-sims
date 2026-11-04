# `sims/_template` — starting point for an original sim

A minimal original sim (one screen, a slider for a made-up input and a readout of a value derived from it,
no physics) written against the pinned PhET libraries of `newSimBase` (`data/build-matrix.json`:
energy-skate-park-basics 1.5.0, chipper 2.0.0, Node 24). It is never published: `build-all` skips every
`_`-prefixed folder. Korean build-flow notes: `docs/new-sims.md`.

## Copy it into a new sim

```sh
node tools/build-new-sim.mjs --create photoelectric-effect --title "광전 효과"
```

This copies the folder to `sims/<id>/` and renames every template name (paths and contents):
`bsshs-template` → `<id>`, `BsshsTemplate` → Pascal case, `bsshsTemplate` → camel case,
`BSSHS_TEMPLATE` → constant case. This README is not copied. Rules for `<id>` (chipper's): lower-case
letters and single dashes only, no digits, no `_`; `package.json` `name` must equal the folder id.

## Layout

| path | what |
| --- | --- |
| `package.json` | `name` = id, `phet.requirejsNamespace` = constant case, `phet.supportedBrands` must include `adapted-from-phet` (the slot the bsshs brand rides in), `devDependencies.grunt` (grunt-cli needs a local grunt) |
| `<id>-strings_en.json` | **all on-screen text, in Korean** (see Strings) |
| `js/<id>-main.ts` | entry point chipper bundles |
| `js/<id camel>.ts` | namespace; every class registers itself |
| `js/<Pascal>Strings.ts` | typed string access; keep `StringsType` in sync with the JSON by hand |
| `js/<Pascal>Screen.ts` | screen = model factory + view factory |
| `js/model/` | physics. Part of the physics hash (`drawer/hash.mjs`): any change here resets a teacher's approval |
| `js/view/` | drawing and controls |
| `Gruntfile.cjs`, `tsconfig.json`, `.gitignore` | build glue; keep as is |

Every code file starts with the two-line GPL-3.0 header crediting `bsshs-physics-sims contributors`; no
`@author` tags or personal names (`tests/new-sims/sources.test.mjs`). Import PhET code by relative path
(`../../axon/js/NumberProperty.js`, `.js` even for `.ts` files); the slot puts the libraries next to the sim.

## Strings

Write Korean directly in `<id>-strings_en.json` (`{ "key": { "value": "한국어" } }`, nesting allowed). chipper
needs this `_en` file (its fallback locale defines the keys); at build time the same file is also written as
`babel/<id>/<id>-strings_ko.json` in the slot so `--locales=ko` really builds `ko`. Patterns use
`{{value}}` placeholders. No English words in values (checked by the test). Title key: `<id>.title`.

## Two pitfalls

- **Always write strings as `<Pascal>Strings.…StringProperty`, spelled out in full.** chipper finds the
  strings to bundle by scanning the source text for the module name followed by the key path ending in
  `StringProperty` (`BsshsTemplateStrings.sideLengthStringProperty`). An alias (`const S =
  BsshsTemplateStrings; S.sideLengthStringProperty`) or a destructuring (`const { sideLengthStringProperty }
  = BsshsTemplateStrings`) hides the reference: chipper silently drops those strings, the type check still
  passes, and the sim crashes at startup because the string value is missing.
- **Using bamboo (charts) needs two entries.** Add `"phetLibs": [ "bamboo" ]` under `phet` in
  `package.json` (the build only accepts libraries in the `newSimBase` set) and add
  `{ "path": "../bamboo/tsconfig.json" }` to `references` in `tsconfig.json`. Without the first, chipper
  does not bundle bamboo; without the second, `tsc -b` cannot resolve the bamboo files and the build fails.
  Example: `sims/bsshs-photoelectric/`.

## Colors, fonts, design

Use the stock components (`Panel`, `NumberControl`, `Checkbox`, buttons, `PhetFont`) with their default
colors; the build's theme patches recolor them from `theme/tokens.json`. Do not write color literals
(`#hex`, `rgb(`) or font names in `sims/` (the test fails). Physically meaningful colors (a photon, an
electron) come from a model/view constant computed from physics (e.g. `VisibleColor.wavelengthToColor`),
never a design value.

## Exposing values to the class drawer

The drawer adapter (`adapters/<id>/adapter.mjs`, written by the sim task) reads the live model at
`phet.joist.sim.screens[ i ].model` (`drawer.helpers.model()` = the selected screen's model). So:

- keep every measurable quantity as a **public** Property on the model (`sideLengthProperty`,
  `areaProperty` here), in the unit `drawer.json` declares;
- make inputs settable (`NumberProperty`) so `apply()` can drive automated physics cases (`cases.json`);
- give time-dependent models a way to pause or reach a steady state, so the case runner can settle.

```js
read: () => { const m = drawer.helpers.model(); return { sideLength: m.sideLengthProperty.value, area: m.areaProperty.value }; }
```

## Build and check

```sh
node tools/build-new-sim.mjs <id>                     # ~40 s; -> build/bsshs-theme/<id>/<id>_ko.html
node tools/check-sim.mjs build/bsshs-theme/<id>/<id>_ko.html
node tools/check-sim.mjs build/bsshs-theme/<id>/<id>_ko.html --width 390
node tools/inject-drawer.mjs build/bsshs-theme/<id>/<id>_ko.html <id>   # after adapters/<id>/ exists
node tools/build-all.mjs --new-only                   # every sims/<id> except _template
```

The build type-checks the sim (`tsc -b`): any TypeScript error in the sim's own files fails it.
