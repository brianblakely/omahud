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

test("uses the event workspace before refreshing cached geometry", () => {
  assert.match(
    panel,
    /function onRawEvent\(event\)\s*\{[\s\S]*?name === "workspacev2"\)[\s\S]*?HudModel\.workspaceEventId\(event\)[\s\S]*?root\.eventWorkspaceId = workspaceId[\s\S]*?root\.requestShow\(\)[\s\S]*?Qt\.callLater\(root\.reconcileEventWorkspace\)/
  )
  assert.match(
    panel,
    /function requestShow\(\)\s*\{[\s\S]*?showCachedModel\(\)[\s\S]*?requestSnapshot\(\)/
  )
  assert.match(
    panel,
    /displayWorkspaceId:\s*eventWorkspaceId > 0\s*\? eventWorkspaceId\s*:\s*focusedWorkspaceId/
  )
  assert.match(
    panel,
    /function reconcileEventWorkspace\(\)\s*\{[^{}]*eventWorkspaceId === focusedWorkspaceId\)\s*eventWorkspaceId = 0/
  )
  assert.doesNotMatch(panel, /snapshotDebounce|onFocusedWorkspaceChanged/)
})

test("refreshes and activates the Omarchy scratch workspace on special events", () => {
  assert.match(
    panel,
    /name === "activespecialv2" \|\| name === "activespecial"\)[\s\S]*?root\.eventScratchState = HudModel\.scratchEventActive\(event\) \? 1 : 0[\s\S]*?root\.requestShow\(\)/
  )
  assert.match(
    panel,
    /HudModel\.activateWorkspace\(\s*hudModel,\s*displayWorkspaceId,\s*focusedMonitorName,\s*eventScratchState\s*\)/
  )
})

test("reuses stable workspace slots for atomic add and remove frames", () => {
  assert.match(panel, /property int workspaceSlotCount:\s*11/)
  assert.match(
    panel,
    /function reserveWorkspaceSlots\(count\)\s*\{[^{}]*Math\.max\(11,[^{}]*if \(requested > workspaceSlotCount\) workspaceSlotCount = requested/
  )
  assert.match(panel, /onWorkspacesChanged:\s*reserveWorkspaceSlots\(workspaces\.length\)/)
  assert.match(
    panel,
    /Repeater\s*\{\s*model:\s*root\.workspaceSlotCount\s*delegate:\s*Item\s*\{\s*id:\s*workspaceTile\s*required property int index[\s\S]*?workspaceData:\s*index < root\.workspaces\.length\s*\? root\.workspaces\[index\]\s*:\s*null/
  )
  assert.match(
    panel,
    /id:\s*workspaceTile\b[\s\S]*?visible:\s*workspaceData !== null\s*&& \(!workspace\.empty \|\| workspace\.id === root\.displayWorkspaceId\)/
  )
})

test("hides stale window delegates while a workspace slot is reassigned", () => {
  const staleGuards = panel.match(
    /visible:\s*workspaceTile\.workspace\.windows\.indexOf\(windowData\) !== -1/g
  ) || []
  assert.equal(staleGuards.length, 2)
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

test("uses even integer workspace and window geometry", () => {
  assert.match(
    panel,
    /windowDiagramBorderWidth:\s*1/
  )
  assert.match(
    panel,
    /workspaceDimensions:\s*HudModel\.integerWorkspaceSize\(\s*workspaceAspect,\s*width,\s*height\s*\)/
  )
  assert.match(panel, /id:\s*workspaceFrame\b[\s\S]*?x:\s*Math\.floor\(\(workspaceTile\.width - width\) \/ 2\)/)
  assert.match(panel, /id:\s*workspaceFrame\b[\s\S]*?y:\s*Math\.floor\(\(workspaceTile\.height - height\) \/ 2\)/)
  assert.match(
    panel,
    /frameGeometry:\s*HudModel\.integerWindowRect\(\s*windowData,\s*layoutFrame\.width,\s*layoutFrame\.height\s*\)/
  )
  assert.doesNotMatch(panel, /Style\.spaceReal|frameLeft|frameTop|frameRight|frameBottom/)
})

test("centers one-pixel border segments on owned shared edges", () => {
  assert.doesNotMatch(panel, /delegate:\s*BorderSurface\s*\{\s*id:\s*windowFrame/)
  assert.match(panel, /Target:\s*Omarchy quattro caeffdc27b7ffbfe4d9d6e8cc1ba0f6c8842256f/)
  assert.match(panel, /id:\s*windowBorderLayer\b[\s\S]*?z:\s*100000/)
  assert.match(panel, /strokeWidth:\s*root\.windowDiagramBorderWidth/)
  assert.match(panel, /property real halfStroke:\s*strokeWidth \/ 2/)
  assert.match(
    panel,
    /outerRight === true\s*\? parent\.width - windowBorder\.strokeWidth\s*:\s*parent\.width - windowBorder\.halfStroke/
  )
  assert.match(
    panel,
    /outerBottom === true\s*\? parent\.height - windowBorder\.strokeWidth\s*:\s*parent\.height - windowBorder\.halfStroke/
  )
})

test("omits workspace-edge borders except on floating windows", () => {
  for (const side of ["Top", "Right", "Bottom", "Left"]) {
    assert.match(
      panel,
      new RegExp(
        `visible: windowBorder\\.windowData\\.border${side} !== false\\s*`
        + `&& \\(windowBorder\\.windowData\\.floating === true\\s*`
        + `\\|\\| windowBorder\\.windowData\\.outer${side} !== true\\)`
      )
    )
  }
})

test("uses the non-muted inverse foreground for floating window borders", () => {
  assert.match(
    panel,
    /strokeColor:\s*windowData\.floating\s*\? \(workspaceTile\.workspace\.active\s*\? Color\.background\s*:\s*Color\.foreground\)\s*:\s*Util\.alpha\(workspaceTile\.workspaceForeground,\s*0\.42\)/
  )
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

test("centers app icon groups and painted glyph bounds in each window", () => {
  assert.match(
    panel,
    /id:\s*iconRow\b[\s\S]*?x:\s*HudModel\.pixelSnap\([\s\S]*?\(parent\.width - width\) \/ 2[\s\S]*?y:\s*HudModel\.pixelSnap\([\s\S]*?\(parent\.height - height\) \/ 2[\s\S]*?width:\s*implicitWidth[\s\S]*?height:\s*implicitHeight/
  )
  assert.match(
    panel,
    /id:\s*appGlyph\b[\s\S]*?rawVerticalCenterOffset:[\s\S]*?baselineY[\s\S]*?appGlyphMetrics\.tightBoundingRect\.y[\s\S]*?appGlyphMetrics\.tightBoundingRect\.height \/ 2[\s\S]*?anchors\.verticalCenterOffset:\s*HudModel\.pixelSnap/
  )
})

test("renders icons at their fitted destination size without transform resampling", () => {
  assert.match(
    panel,
    /iconSize:\s*HudModel\.integerIconSize\(\s*frameWidth,\s*frameHeight,\s*members\.length,\s*Style\.space\(14\),\s*iconSpacing,\s*root\.windowDiagramBorderWidth\s*\)/
  )
  assert.match(panel, /id:\s*appIcon\b[\s\S]*?width:\s*windowFrame\.iconSize/)

  const row = panel.match(/Row\s*\{\s*id:\s*iconRow[\s\S]*?Repeater\s*\{/)
  assert.ok(row)
  assert.doesNotMatch(row[0], /\bscale\s*:/)
  assert.match(
    panel,
    /sourceSize\.width:\s*Math\.max\(\s*1,\s*Math\.round\(width \* windowFrame\.iconPixelRatio\)\s*\)[\s\S]*?smooth:\s*true[\s\S]*?mipmap:\s*false/
  )
})

test("uses a contrast-safe image tint instead of near-black on light workspaces", () => {
  assert.match(
    panel,
    /fallbackIconColor:\s*root\.fallbackIconTint\(\s*workspaceForeground,\s*workspaceBackground\s*\)/
  )
})

process.stdout.write(`${passed} panel contract tests passed\n`)
