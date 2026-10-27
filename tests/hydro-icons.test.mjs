import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/ui/hydro-icon.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const iconModule = { exports: {} };
// Exercise the actual TSX module using the project's existing TypeScript compiler.
new Function("module", "exports", "require", compiled)(iconModule, iconModule.exports, require);
const { HydroIcon, HYDRO_ICON_NAMES, sourceIconFor } = iconModule.exports;
const renderIcon = (props) => renderToStaticMarkup(createElement(HydroIcon, props));

for (const name of HYDRO_ICON_NAMES) {
  test(`${name}: renders on the shared grid with decorative semantics`, () => {
    const svg = renderIcon({ name });
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /width="20" height="20"/);
    assert.match(svg, /stroke-width="1.75"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.match(svg, new RegExp(`data-icon="${name}"`));
    assert.match(svg, /class="hydro-icon__wash"/);
    assert.doesNotMatch(svg, /(?:href=|<image|<script|\bid=)/);
  });
}

test("meaningful standalone icons expose a name and image role", () => {
  const svg = renderIcon({ name: "turbine", label: "Screened hydropower potential" });
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="Screened hydropower potential"/);
  assert.match(svg, /<title>Screened hydropower potential<\/title>/);
  assert.doesNotMatch(svg, /aria-hidden=/);
});

test("icon sizes, classes, and semantic color are forwarded", () => {
  const svg = renderIcon({ name: "locate", size: 16, className: "map-tool", color: "var(--brand-text)" });
  assert.match(svg, /width="16" height="16"/);
  assert.match(svg, /class="hydro-icon map-tool"/);
  assert.match(svg, /color="var\(--brand-text\)"/);
});

test("each source category has a distinct technical glyph", () => {
  const expected = {
    Elevation: "terrain", Hydrology: "water", Climate: "climate",
    "Land cover": "leaf", Environment: "environment", Infrastructure: "transmission",
  };
  for (const [category, icon] of Object.entries(expected)) {
    assert.equal(sourceIconFor(category), icon);
    assert.ok(HYDRO_ICON_NAMES.includes(icon));
  }
  assert.equal(sourceIconFor("Unclassified"), "sources");
  assert.equal(sourceIconFor("__proto__"), "sources");
});

test("domain glyphs use inherited design tokens rather than fixed colors", () => {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  assert.match(source, /stroke="currentColor"/);
});

test("compact navigation hides labels, not the new icon containers", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.nav-label, \.nav-shortcut/);
  assert.doesNotMatch(css, /\.nav-item span[^{}]*\{[^}]*display:\s*none/);
  assert.match(css, /\.mobile-bottom-nav\s*\{\s*display:\s*none;/);
  assert.match(css, /\.mobile-bottom-nav svg\s*\{\s*width:\s*21px;/);
});
