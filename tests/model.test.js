const assert = require("node:assert/strict")
const {
  activateWorkspace,
  buildWorkspaceModel,
  matchDesktopEntry,
  memberWebIdentity,
  normalizeCorner,
  parseDuration,
  workspaceLabel
} = require("../HudModel.js")

let passed = 0

function test(name, callback) {
  callback()
  passed += 1
  process.stdout.write(`ok ${passed} - ${name}\n`)
}

function monitor(overrides = {}) {
  return Object.assign({
    id: 0,
    name: "DP-1",
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
    scale: 1,
    transform: 0,
    focused: true,
    activeWorkspace: { id: 1, name: "1" }
  }, overrides)
}

function client(overrides = {}) {
  return Object.assign({
    address: "0x1",
    mapped: true,
    at: [0, 0],
    size: [500, 500],
    workspace: { id: 1, name: "1" },
    monitor: 0,
    floating: false,
    fullscreen: 0,
    class: "example.App",
    initialClass: "example.App",
    focusHistoryID: 0,
    grouped: []
  }, overrides)
}

function closeTo(actual, expected, epsilon = 0.000001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  )
}

test("normalizes supported corners and defaults invalid values", () => {
  assert.equal(normalizeCorner(" bottom-LEFT "), "bottom-left")
  assert.equal(normalizeCorner("bottom-right"), "bottom-right")
  assert.equal(normalizeCorner("top-left"), "top-left")
  assert.equal(normalizeCorner("TOP-RIGHT"), "top-right")
  assert.equal(normalizeCorner("center"), "bottom-left")
  assert.equal(normalizeCorner(null), "bottom-left")
})

test("accepts bounded durations and defaults invalid values", () => {
  assert.equal(parseDuration(250), 250)
  assert.equal(parseDuration("1750"), 1750)
  assert.equal(parseDuration(999.6), 1000)
  assert.equal(parseDuration(10000), 10000)
  assert.equal(parseDuration(249), 1500)
  assert.equal(parseDuration(10001), 1500)
  assert.equal(parseDuration("500ms"), 1500)
  assert.equal(parseDuration(""), 1500)
  assert.equal(parseDuration(null), 1500)
})

test("formats workspace ten as zero without changing workspace identity", () => {
  assert.equal(workspaceLabel(1), "1")
  assert.equal(workspaceLabel(9), "9")
  assert.equal(workspaceLabel(10), "0")
  assert.equal(workspaceLabel(11), "11")
  assert.equal(workspaceLabel("invalid"), "")
})

test("reactively activates a cached workspace without mutating the snapshot", () => {
  const snapshot = {
    targetMonitorName: "DP-1",
    activeWorkspaceId: 2,
    workspaces: [
      {
        id: 2,
        monitorName: "DP-1",
        active: true,
        empty: false,
        aspectRatio: 16 / 9,
        windows: [{ x: 0, y: 0, width: 1, height: 1 }]
      },
      {
        id: 10,
        monitorName: "DP-1",
        active: false,
        empty: false,
        aspectRatio: 16 / 9,
        windows: [{ x: 0, y: 0, width: 0.5, height: 1 }]
      }
    ]
  }

  const activated = activateWorkspace(snapshot, 10, "DP-2")

  assert.equal(activated.targetMonitorName, "DP-2")
  assert.equal(activated.activeWorkspaceId, 10)
  assert.deepEqual(
    activated.workspaces.map(workspace => [workspace.id, workspace.active]),
    [[2, false], [10, true]]
  )
  assert.equal(activated.workspaces[1].monitorName, "DP-2")
  assert.equal(snapshot.activeWorkspaceId, 2)
  assert.equal(snapshot.workspaces[0].active, true)
  assert.equal(snapshot.workspaces[1].active, false)
})

test("adds a sorted empty placeholder for an uncached focused workspace", () => {
  const snapshot = {
    targetMonitorName: "DP-1",
    activeWorkspaceId: 2,
    workspaces: [
      {
        id: 10,
        monitorName: "DP-1",
        active: false,
        empty: false,
        aspectRatio: 16 / 9,
        windows: [{}]
      },
      {
        id: 2,
        monitorName: "DP-1",
        active: true,
        empty: false,
        aspectRatio: 16 / 9,
        windows: [{}]
      }
    ]
  }

  const activated = activateWorkspace(snapshot, 7, "HDMI-A-1")

  assert.deepEqual(activated.workspaces.map(workspace => workspace.id), [2, 7, 10])
  assert.deepEqual(
    activated.workspaces.filter(workspace => workspace.active).map(workspace => workspace.id),
    [7]
  )
  assert.equal(activated.workspaces[1].monitorName, "HDMI-A-1")
  assert.equal(activated.workspaces[1].empty, true)
  assert.deepEqual(activated.workspaces[1].windows, [])
})

test("filters non-mapped and non-numbered clients and sorts workspace ids", () => {
  const result = buildWorkspaceModel(
    [monitor({ activeWorkspace: { id: 2, name: "2" } })],
    [
      client({ address: "0x10", workspace: { id: 10, name: "10" } }),
      client({ address: "0x2", workspace: { id: 2, name: "2" }, hidden: true }),
      client({ address: "0xoff", mapped: false, workspace: { id: 3, name: "3" } }),
      client({ address: "0xzero", workspace: { id: 0, name: "0" } }),
      client({ address: "0xspecial", workspace: { id: -99, name: "special:scratch" } }),
      client({ address: "0xdecimal", workspace: { id: 4.5, name: "4.5" } })
    ]
  )

  assert.equal(result.targetMonitorName, "DP-1")
  assert.equal(result.activeWorkspaceId, 2)
  assert.deepEqual(result.workspaces.map(workspace => workspace.id), [2, 10])
  assert.equal(result.workspaces[0].windows.length, 1)
  assert.equal(result.workspaces[0].active, true)
})

test("adds the active positive workspace when it is empty", () => {
  const result = buildWorkspaceModel(
    [monitor({ activeWorkspace: { id: 7, name: "7" } })],
    [client({ workspace: { id: 2, name: "2" } })]
  )

  assert.deepEqual(result.workspaces.map(workspace => workspace.id), [2, 7])
  assert.equal(result.workspaces[1].active, true)
  assert.equal(result.workspaces[1].empty, true)
  assert.deepEqual(result.workspaces[1].windows, [])
})

test("normalizes scaled, offset, rotated, and clipped monitor geometry", () => {
  const portrait = monitor({
    id: 4,
    name: "DP-4",
    x: 100,
    y: 200,
    width: 3000,
    height: 2000,
    scale: 2,
    transform: 1,
    activeWorkspace: { id: 4, name: "4" }
  })
  const result = buildWorkspaceModel(
    [portrait],
    [
      client({
        address: "0xclipped-top-left",
        monitor: 4,
        workspace: { id: 4, name: "4" },
        at: [50, 100],
        size: [650, 850]
      }),
      client({
        address: "0xclipped-bottom-right",
        monitor: 4,
        workspace: { id: 4, name: "4" },
        at: [1000, 1500],
        size: [300, 500]
      })
    ]
  )

  const workspace = result.workspaces[0]
  closeTo(workspace.aspectRatio, 2 / 3)

  const topLeft = workspace.windows.find(window =>
    window.members[0].address === "0xclipped-top-left"
  )
  closeTo(topLeft.x, 0)
  closeTo(topLeft.y, 0)
  closeTo(topLeft.width, 0.6)
  closeTo(topLeft.height, 0.5)

  const bottomRight = workspace.windows.find(window =>
    window.members[0].address === "0xclipped-bottom-right"
  )
  closeTo(bottomRight.x, 0.9)
  closeTo(bottomRight.y, 1300 / 1500)
  closeTo(bottomRight.width, 0.1)
  closeTo(bottomRight.height, 1 - (1300 / 1500))
})

test("clusters explicit groups and coincident rectangles while preserving members", () => {
  const result = buildWorkspaceModel(
    [monitor()],
    [
      client({
        address: "0xa",
        at: [0, 0],
        size: [490, 500],
        grouped: ["0xa", "0xb"],
        class: "firefox",
        initialClass: "Firefox",
        focusHistoryID: 1
      }),
      client({
        address: "0xb",
        at: [10, 0],
        size: [490, 500],
        grouped: ["0xa", "0xb"],
        class: "code",
        initialClass: "code",
        focusHistoryID: 0
      }),
      client({
        address: "0xc",
        at: [500, 0],
        size: [500, 500],
        class: "org.example.C",
        initialClass: "",
        focusHistoryID: 3
      }),
      client({
        address: "0xd",
        at: [500, 0],
        size: [500, 500],
        class: "",
        initialClass: "org.example.D",
        focusHistoryID: 2
      })
    ]
  )

  const windows = result.workspaces[0].windows
  assert.equal(windows.length, 2)

  const explicitGroup = windows.find(window =>
    window.members.some(member => member.address === "0xa")
  )
  assert.deepEqual(explicitGroup.members.map(member => member.address), ["0xb", "0xa"])
  assert.deepEqual(explicitGroup.members[0].iconCandidates, ["code"])
  assert.deepEqual(explicitGroup.members[1].iconCandidates, ["firefox", "Firefox"])

  const coincidentGroup = windows.find(window =>
    window.members.some(member => member.address === "0xc")
  )
  assert.deepEqual(coincidentGroup.members.map(member => member.address), ["0xd", "0xc"])
  assert.deepEqual(coincidentGroup.members[0].iconCandidates, ["org.example.D"])
  assert.deepEqual(coincidentGroup.members[1].iconCandidates, ["org.example.C"])
})

test("draws large backgrounds before tiled windows and floating MRU windows last", () => {
  const result = buildWorkspaceModel(
    [monitor()],
    [
      client({
        address: "0xlarge",
        at: [20, 20],
        size: [950, 950],
        focusHistoryID: 5
      }),
      client({
        address: "0xfullscreen",
        at: [0, 0],
        size: [1000, 1000],
        fullscreen: 2,
        focusHistoryID: 2
      }),
      client({
        address: "0xtiled",
        at: [0, 500],
        size: [500, 500],
        focusHistoryID: 0
      }),
      client({
        address: "0xfloating-old",
        at: [550, 550],
        size: [200, 200],
        floating: true,
        focusHistoryID: 4
      }),
      client({
        address: "0xfloating-new",
        at: [700, 700],
        size: [200, 200],
        floating: true,
        focusHistoryID: 0
      })
    ]
  )

  assert.deepEqual(
    result.workspaces[0].windows.map(window => window.members[0].address),
    ["0xfullscreen", "0xlarge", "0xtiled", "0xfloating-old", "0xfloating-new"]
  )
})

test("uses class then initial class as deterministic icon candidates", () => {
  const result = buildWorkspaceModel(
    [monitor()],
    [
      client({
        address: "0xone",
        at: [0, 0],
        class: "org.example.One",
        initialClass: "one"
      }),
      client({
        address: "0xtwo",
        at: [500, 0],
        class: " same ",
        initialClass: "same"
      }),
      client({
        address: "0xthree",
        at: [0, 500],
        class: "",
        initialClass: "org.example.Three"
      })
    ]
  )

  const members = {}
  for (const window of result.workspaces[0].windows) {
    members[window.members[0].address] = window.members[0]
  }

  assert.deepEqual(members["0xone"].iconCandidates, ["org.example.One", "one"])
  assert.deepEqual(members["0xtwo"].iconCandidates, ["same"])
  assert.deepEqual(members["0xthree"].iconCandidates, ["org.example.Three"])
})

test("matches native desktop entries by id, startup class, and executable variants", () => {
  const entries = [
    {
      id: "foot.desktop",
      name: "Foot",
      startupClass: "foot",
      execString: "foot",
      icon: "foot"
    },
    {
      id: "steam.desktop",
      name: "Steam",
      startupClass: "",
      execString: "/usr/bin/steam %U",
      icon: "steam"
    },
    {
      id: "virtualbox.desktop",
      name: "Oracle VirtualBox",
      startupClass: "VirtualBox Manager",
      execString: "VirtualBox %U",
      icon: "virtualbox"
    }
  ]

  assert.equal(matchDesktopEntry({
    className: "foot",
    iconCandidates: ["foot"]
  }, entries), entries[0])
  assert.equal(matchDesktopEntry({
    className: "steam",
    iconCandidates: ["steam"]
  }, entries), entries[1])
  assert.equal(matchDesktopEntry({
    className: "VirtualBoxVM",
    iconCandidates: ["VirtualBoxVM"]
  }, entries), entries[2])
})

test("matches Omarchy web-app windows to desktop-entry URLs", () => {
  const entries = [
    {
      id: "ChatGPT.desktop",
      name: "ChatGPT",
      execString: "omarchy-launch-webapp https://chatgpt.com/",
      icon: "/icons/ChatGPT.png"
    },
    {
      id: "GitHub.desktop",
      name: "GitHub",
      execString: "omarchy-launch-webapp https://github.com/",
      icon: "/icons/GitHub.png"
    },
    {
      id: "Slack Loadup.desktop",
      name: "Slack Loadup",
      execString: "omarchy-launch-webapp https://app.slack.com/client/T0BD9A3HVQF",
      icon: "/icons/Slack.png"
    },
    {
      id: "Linear Loadup.desktop",
      name: "Linear Loadup",
      execString: "omarchy-launch-webapp https://linear.app/loadup-solutions",
      icon: "/icons/Linear.png"
    }
  ]

  assert.equal(matchDesktopEntry({
    initialTitle: "chatgpt.com_/",
    className: "chrome-chatgpt.com__-Default"
  }, entries), entries[0])
  assert.equal(matchDesktopEntry({
    className: "chrome-github.com__-Default"
  }, entries), entries[1])
  assert.equal(matchDesktopEntry({
    initialTitle: "app.slack.com_/client/T0BD9A3HVQF",
    className: "chrome-app.slack.com__client_T0BD9A3HVQF-Default"
  }, entries), entries[2])
  assert.equal(matchDesktopEntry({
    initialTitle: "linear.app_/loadup-solutions",
    className: "chrome-linear.app__loadup-solutions-Default"
  }, entries), entries[3])
})

test("uses a web-app host label when a handler desktop entry has no URL", () => {
  const hey = {
    id: "HEY.desktop",
    name: "HEY",
    execString: "omarchy-webapp-handler-hey %u",
    icon: "/icons/HEY.png"
  }
  const member = {
    initialTitle: "app.hey.com_/topics",
    className: "chrome-app.hey.com__topics-Default"
  }

  assert.deepEqual(memberWebIdentity(member), {
    host: "app.hey.com",
    path: "/topics"
  })
  assert.equal(matchDesktopEntry(member, [hey]), hey)
})

test("returns no desktop entry for an unknown application", () => {
  assert.equal(matchDesktopEntry({
    className: "org.example.Unknown",
    initialClass: "org.example.Unknown",
    iconCandidates: ["org.example.Unknown"]
  }, [{
    id: "foot.desktop",
    name: "Foot",
    startupClass: "foot",
    execString: "foot",
    icon: "foot"
  }]), null)
})

test("handles malformed snapshots without throwing or returning invalid geometry", () => {
  assert.deepEqual(buildWorkspaceModel(null, null), {
    targetMonitorName: "",
    activeWorkspaceId: 0,
    workspaces: []
  })

  const result = buildWorkspaceModel(
    [
      null,
      monitor({
        id: "bad",
        name: "Fallback",
        width: "not-a-number",
        height: -10,
        scale: 0,
        activeWorkspace: { id: "6", name: "6" }
      })
    ],
    [
      null,
      "not-a-client",
      client({
        address: null,
        monitor: "bad",
        workspace: { id: "6", name: "6" },
        at: ["bad"],
        size: null,
        class: null,
        initialClass: null
      }),
      { workspace: { id: 8 } }
    ]
  )

  assert.equal(result.targetMonitorName, "Fallback")
  assert.equal(result.activeWorkspaceId, 6)
  assert.equal(result.workspaces.length, 1)
  assert.equal(result.workspaces[0].aspectRatio, 16 / 9)
  assert.deepEqual(result.workspaces[0].windows[0].members[0].iconCandidates, [])
  assert.equal(result.workspaces[0].windows[0].members[0].initialTitle, "")

  const window = result.workspaces[0].windows[0]
  for (const value of [window.x, window.y, window.width, window.height]) {
    assert.equal(Number.isFinite(value), true)
    assert.equal(value >= 0 && value <= 1, true)
  }
})

process.stdout.write(`${passed} tests passed\n`)
