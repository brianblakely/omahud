const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const panel = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

let passed = 0

function test(name, callback) {
  callback()
  passed += 1
  process.stdout.write(`ok ${passed} - ${name}\n`)
}

test("keeps every workspace on one row at half-size dimensions", () => {
  assert.match(panel, /tileWidth:\s*Style\.space\(46\)/)
  assert.match(panel, /tileHeight:\s*Style\.space\(29\)/)
  assert.match(panel, /gridColumns:\s*Math\.max\(1,\s*workspaces\.length\)/)
  assert.match(panel, /gridRows:\s*1/)
})

test("shows cached state on workspace events before refreshing geometry", () => {
  assert.match(
    panel,
    /function onRawEvent\(event\)\s*\{[^{}]*name === "workspacev2"\)\s*root\.requestShow\(\)/
  )
  assert.match(
    panel,
    /function requestShow\(\)\s*\{[\s\S]*?showCachedModel\(\)[\s\S]*?requestSnapshot\(\)/
  )
  assert.doesNotMatch(panel, /snapshotDebounce|onFocusedWorkspaceChanged/)
})

test("discards superseded snapshots before they can cancel a newer show", () => {
  assert.match(
    panel,
    /var rerun\s*=\s*snapshotQueued[\s\S]*?snapshotQueued\s*=\s*false[\s\S]*?if\s*\(rerun\)\s*\{\s*Qt\.callLater\(beginSnapshot\)\s*return\s*\}[\s\S]*?if\s*\(snapshotExitCode\s*===\s*0\)\s*applySnapshot\(snapshotOutput\)/
  )
})

test("dismisses instead of displaying an empty snapshot", () => {
  assert.match(
    panel,
    /hudModel\s*=\s*next\s*\n\s*if\s*\(next\.workspaces\.length\s*===\s*0\)\s*\{\s*close\(\)\s*return/
  )
})

test("uses the theme inactive border color and the Shell panel border width", () => {
  assert.doesNotMatch(panel, /hyprctl -j getoption general:border_size/)
  assert.doesNotMatch(panel, /general:col\.inactive_border/)
  assert.doesNotMatch(panel, /HudModel\.parseBorderWidth/)
  assert.match(panel, /defaultHudBorderColor:\s*"rgba\(595959aa\)"/)
  assert.match(
    panel,
    /command:\s*\[\s*root\.omarchyPath \+ "\/bin\/omarchy-theme-color",\s*"hyprland_inactive_border",\s*root\.defaultHudBorderColor\s*\]/
  )
  assert.match(
    panel,
    /function onShellValuesChanged\(\)\s*\{\s*root\.refreshHudBorderColor\(\)\s*\}/
  )
  assert.match(
    panel,
    /widths:\s*Border\.surfaceWidths\(\s*"popups",\s*"border",\s*Math\.max\(1,\s*Style\.space\(2\)\)\s*\)/
  )
  assert.match(panel, /borderSpec:\s*root\.hudBorderSpec/)
  assert.doesNotMatch(panel, /borderSpec:\s*Border\.flat\(Color\.muted/)
  assert.doesNotMatch(
    panel,
    /id:\s*card[\s\S]*?borderSpec:\s*Border\.surfaceSpec\(\s*"popups"/
  )
})

test("uses a 2000 millisecond default duration", () => {
  assert.match(
    panel,
    /displayDuration:\s*HudModel\.parseDuration\(setting\("durationMs",\s*2000\)\)/
  )
})

test("shows and dismisses immediately without mapping or opacity transitions", () => {
  assert.match(panel, /onTriggered:\s*root\.close\(\)/)
  assert.match(
    panel,
    /PanelWindow\s*\{[\s\S]*?\bscreen:\s*modelData\s*\n\s*visible:\s*true/
  )
  assert.match(
    panel,
    /\bvisible:\s*true[\s\S]*?\bcolor:\s*"transparent"[\s\S]*?\bexclusionMode:\s*ExclusionMode\.Ignore[\s\S]*?WlrLayershell\.keyboardFocus:\s*WlrKeyboardFocus\.None[\s\S]*?\bmask:\s*Region\s*\{\s*\}/
  )
  assert.match(
    panel,
    /BorderSurface\s*\{\s*id:\s*card\s*\n\s*visible:\s*root\.opened\s*&&\s*panel\.targetScreen/
  )
  assert.match(
    panel,
    /function showCachedModel\(\)\s*\{[\s\S]*?\bopened\s*=\s*true/
  )
  assert.match(
    panel,
    /function close\(\)\s*\{[\s\S]*?\bopened\s*=\s*false/
  )
  assert.doesNotMatch(
    panel,
    /hudOpacity|closeTimer|Behavior|Animation|Transition|state = "fading"|\bopacity\s*:/
  )
})

test("removes workspace and number-badge outlines and places the badge flush", () => {
  assert.match(panel, /id:\s*workspaceFrame\b[^{}]*border\.width:\s*0/)
  assert.match(panel, /id:\s*numberBadge\b[^{}]*anchors\.margins:\s*0/)
  assert.match(panel, /id:\s*numberBadge\b[^{}]*border\.width:\s*0/)
})

test("anchors the HUD flush without gap or Omarchy bar clearance", () => {
  assert.doesNotMatch(panel, /Style\.gapsOut|barPosition|barVisible|liveBarSize|Clearance/)
  assert.match(panel, /id:\s*card\b[\s\S]*?anchors\.margins:\s*0/)
})

test("collapses tiled outlines with per-side BorderSurface widths", () => {
  assert.match(panel, /delegate:\s*BorderSurface\s*\{\s*id:\s*windowFrame/)
  assert.match(
    panel,
    /borderSpec:\s*\(\{[\s\S]*?top:\s*windowData\.borderTop === false \? 0 : frameBorderWidth[\s\S]*?right:\s*windowData\.borderRight === false \? 0 : frameBorderWidth[\s\S]*?bottom:\s*windowData\.borderBottom === false \? 0 : frameBorderWidth[\s\S]*?left:\s*windowData\.borderLeft === false \? 0 : frameBorderWidth/
  )
  assert.match(panel, /width:\s*Math\.max\(Style\.space\(4\),\s*frameRight - frameLeft\)/)
  assert.match(panel, /height:\s*Math\.max\(Style\.space\(4\),\s*frameBottom - frameTop\)/)
})

test("uses opaque workspace colors and leaves window geometries unfilled", () => {
  assert.match(
    panel,
    /workspaceBackground:\s*workspace\.active\s*\?\s*Color\.foreground\s*:\s*Color\.background/
  )
  assert.match(panel, /id:\s*windowFrame\b[\s\S]*?color:\s*"transparent"/)
})

test("uses opaque workspace colors for the badge and formats its label through the model", () => {
  assert.match(
    panel,
    /id:\s*numberBadge\b[^{}]*color:\s*workspaceTile\.workspaceBackground/
  )
  assert.match(
    panel,
    /id:\s*numberLabel\b[^{}]*text:\s*HudModel\.workspaceLabel\(workspaceTile\.workspace\.id\)[^{}]*color:\s*workspaceTile\.workspaceForeground/
  )
})

test("prefers default Nerd Font glyphs and colorizes image fallbacks", () => {
  assert.match(panel, /import QtQuick\.Effects/)
  assert.match(
    panel,
    /iconFontFamily:\s*"JetBrainsMono Nerd Font"/
  )
  assert.match(
    panel,
    /glyph:\s*HudModel\.appGlyph\(modelData,\s*entry\)/
  )
  assert.match(
    panel,
    /OpticalGlyph\s*\{[^{}]*visible:\s*appIcon\.glyph\.length\s*>\s*0[^{}]*text:\s*appIcon\.glyph[^{}]*color:\s*workspaceTile\.workspaceForeground[^{}]*fontFamily:\s*root\.iconFontFamily/
  )
  assert.match(
    panel,
    /Image\s*\{[^{}]*visible:\s*appIcon\.glyph\.length\s*===\s*0[\s\S]*?layer\.effect:\s*MultiEffect\s*\{[^{}]*colorization:\s*1\.0[^{}]*colorizationColor:\s*workspaceTile\.fallbackIconColor/
  )
})

test("uses a contrast-safe image tint instead of near-black on light workspaces", () => {
  assert.match(
    panel,
    /fallbackIconColor:\s*root\.fallbackIconTint\(\s*workspaceForeground,\s*workspaceBackground\s*\)/
  )
})

process.stdout.write(`${passed} panel contract tests passed\n`)
