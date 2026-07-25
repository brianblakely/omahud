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

test("dismisses immediately without an opacity animation or close delay", () => {
  assert.match(panel, /onTriggered:\s*root\.close\(\)/)
  assert.doesNotMatch(panel, /hudOpacity|closeTimer|Behavior on opacity|state = "fading"/)
})

test("removes workspace and number-badge outlines and places the badge flush", () => {
  assert.match(panel, /id:\s*workspaceFrame\b[^{}]*border\.width:\s*0/)
  assert.match(panel, /id:\s*numberBadge\b[^{}]*anchors\.margins:\s*0/)
  assert.match(panel, /id:\s*numberBadge\b[^{}]*border\.width:\s*0/)
})

test("uses workspace colors for the badge and formats its label through the model", () => {
  assert.match(
    panel,
    /id:\s*numberBadge\b[^{}]*color:\s*workspaceTile\.workspaceBackground/
  )
  assert.match(
    panel,
    /id:\s*numberLabel\b[^{}]*text:\s*HudModel\.workspaceLabel\(workspaceTile\.workspace\.id\)[^{}]*color:\s*workspaceTile\.workspaceForeground/
  )
})

process.stdout.write(`${passed} panel contract tests passed\n`)
