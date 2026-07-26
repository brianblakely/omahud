import QtQuick
import QtQuick.Effects
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "HudModel.js" as HudModel

Item {
  id: root

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null
  property bool opened: false

  readonly property string pluginId: manifest && manifest.id ? String(manifest.id) : "b.omahud"
  readonly property var pluginSettings: currentSettings()
  readonly property string selectedCorner: HudModel.normalizeCorner(setting("corner", "bottom-left"))
  readonly property int displayDuration: HudModel.parseDuration(setting("durationMs", 1500))
  readonly property int focusedWorkspaceId: Hyprland.focusedWorkspace
    ? Number(Hyprland.focusedWorkspace.id) || 0
    : 0
  readonly property string focusedMonitorName: {
    var workspace = Hyprland.focusedWorkspace
    if (workspace && workspace.monitor && workspace.monitor.name !== undefined)
      return String(workspace.monitor.name)

    var monitor = Hyprland.focusedMonitor
    return monitor && monitor.name !== undefined ? String(monitor.name) : ""
  }
  readonly property var displayModel: HudModel.activateWorkspace(
    hudModel,
    focusedWorkspaceId,
    focusedMonitorName
  )
  readonly property var workspaces: displayModel && Array.isArray(displayModel.workspaces)
    ? displayModel.workspaces
    : []
  readonly property string targetMonitorName: displayModel
    ? String(displayModel.targetMonitorName || "")
    : ""

  readonly property int cardPadding: Style.space(10)
  readonly property int gridGap: Style.space(7)
  readonly property int tileWidth: Style.space(46)
  readonly property int tileHeight: Style.space(29)
  readonly property int gridColumns: Math.max(1, workspaces.length)
  readonly property int gridRows: 1
  readonly property int gridWidth: gridColumns * tileWidth + Math.max(0, gridColumns - 1) * gridGap
  readonly property int gridHeight: gridRows * tileHeight + Math.max(0, gridRows - 1) * gridGap

  property var hudModel: ({
    targetMonitorName: "",
    activeWorkspaceId: 0,
    workspaces: []
  })
  property bool showRequested: false
  property bool snapshotInFlight: false
  property bool snapshotQueued: false
  property bool snapshotStreamDone: false
  property bool snapshotExited: false
  property int snapshotExitCode: -1
  property string snapshotOutput: ""
  property var desktopEntries: []
  property string lastError: ""
  property string state: "idle"

  function currentSettings() {
    var config = shell && shell.shellConfig ? shell.shellConfig : null
    var plugins = config && Array.isArray(config.plugins) ? config.plugins : []

    for (var i = 0; i < plugins.length; i++) {
      var entry = plugins[i]
      if (entry && String(entry.id || "") === pluginId) return entry
    }

    return {}
  }

  function setting(name, fallback) {
    var value = pluginSettings ? pluginSettings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function saveSettings(values) {
    if (!shell || typeof shell.updateEntryInline !== "function") return false

    var next = {}
    var current = pluginSettings || {}
    for (var key in current) {
      if (key !== "id") next[key] = current[key]
    }
    for (var valueKey in values) {
      if (valueKey !== "id") next[valueKey] = values[valueKey]
    }

    shell.updateEntryInline(pluginId, next)
    return true
  }

  function setCorner(value) {
    var requested = String(value === undefined || value === null ? "" : value)
      .trim()
      .toLowerCase()
    var allowed = ["bottom-left", "bottom-right", "top-left", "top-right"]

    if (allowed.indexOf(requested) === -1)
      return "error: corner must be bottom-left, bottom-right, top-left, or top-right"
    if (!saveSettings({ corner: requested }))
      return "error: settings unavailable"
    return requested
  }

  function setDuration(value) {
    var requested = String(value === undefined || value === null ? "" : value).trim()
    if (!/^\d+$/.test(requested))
      return "error: duration must be an integer from 250 to 10000"

    var duration = Number(requested)
    if (!isFinite(duration) || duration < 250 || duration > 10000)
      return "error: duration must be an integer from 250 to 10000"
    if (!saveSettings({ durationMs: duration }))
      return "error: settings unavailable"
    return String(duration)
  }

  function monitorName(screen) {
    var monitor = Hyprland.monitorFor(screen)
    if (monitor && monitor.name !== undefined) return String(monitor.name)
    return screen && screen.name !== undefined ? String(screen.name) : ""
  }

  function refreshDesktopEntries() {
    var next = []
    try {
      var values = DesktopEntries.applications.values || []
      for (var i = 0; i < values.length; i++) {
        if (values[i]) next.push(values[i])
      }
    } catch (error) {}
    desktopEntries = next
  }

  function iconSource(member) {
    var entry = HudModel.matchDesktopEntry(member, desktopEntries)
    var candidates = member && Array.isArray(member.iconCandidates)
      ? member.iconCandidates
      : []

    if (!entry) {
      for (var i = 0; i < candidates.length && !entry; i++) {
        var candidate = String(candidates[i] || "").trim()
        if (!candidate) continue

        try {
          entry = DesktopEntries.byId(candidate)
            || DesktopEntries.byId(candidate + ".desktop")
            || DesktopEntries.heuristicLookup(candidate)
        } catch (error) {}
      }
    }

    if (entry && entry.icon) {
      if (shell && shell.appLibrary && typeof shell.appLibrary.iconSource === "function")
        return shell.appLibrary.iconSource(entry.icon)

      var entryIcon = Quickshell.iconPath(String(entry.icon), true)
      if (entryIcon) return entryIcon
    }

    for (var j = 0; j < candidates.length; j++) {
      var classIconCandidate = String(candidates[j] || "").trim()
      if (!classIconCandidate) continue
      var classIcon = Quickshell.iconPath(classIconCandidate, true)
      if (classIcon) return classIcon
    }

    if (shell && shell.appLibrary && typeof shell.appLibrary.iconSource === "function")
      return shell.appLibrary.iconSource("application-x-executable")
    return Quickshell.iconPath("application-x-executable", true)
  }

  function requestShow() {
    showRequested = true
    hideTimer.stop()
    showCachedModel()
    requestSnapshot()
    return opened ? "visible" : "queued"
  }

  function showCachedModel() {
    if (!targetMonitorName || workspaces.length === 0) return false

    opened = true
    state = "visible"
    hideTimer.restart()
    return true
  }

  function requestSnapshot() {
    if (snapshotInFlight) {
      snapshotQueued = true
      return
    }

    beginSnapshot()
  }

  function beginSnapshot() {
    if (snapshotInFlight) return

    snapshotInFlight = true
    snapshotQueued = false
    snapshotStreamDone = false
    snapshotExited = false
    snapshotExitCode = -1
    snapshotOutput = ""
    lastError = ""
    state = opened ? "visible" : "querying"
    snapshotProcess.running = true
  }

  function finishSnapshot() {
    if (!snapshotStreamDone || !snapshotExited) return

    snapshotInFlight = false
    var rerun = snapshotQueued
    snapshotQueued = false

    if (snapshotExitCode === 0) applySnapshot(snapshotOutput)
    else failSnapshot(lastError || "hyprctl workspace snapshot failed")

    if (rerun) Qt.callLater(beginSnapshot)
  }

  function applySnapshot(raw) {
    var parsed
    try {
      parsed = JSON.parse(String(raw || ""))
    } catch (error) {
      failSnapshot("invalid workspace snapshot")
      return
    }

    if (!parsed || !Array.isArray(parsed.monitors) || !Array.isArray(parsed.clients)) {
      failSnapshot("incomplete workspace snapshot")
      return
    }

    var next = HudModel.buildWorkspaceModel(parsed.monitors, parsed.clients)
    if (!next || !next.targetMonitorName || !Array.isArray(next.workspaces)
        || next.workspaces.length === 0) {
      failSnapshot("no numbered workspaces to display")
      return
    }

    hudModel = next
    if (showRequested) {
      if (!opened) showCachedModel()
      else state = "visible"
    } else {
      state = "idle"
    }
  }

  function failSnapshot(message) {
    lastError = String(message || "workspace snapshot failed")

    if (!showRequested) {
      state = "idle"
      return
    }
    if (opened) {
      state = "visible"
      return
    }

    state = "error"
    opened = false
    showRequested = false
    hideTimer.stop()
  }

  function open(payloadJson) {
    return requestShow()
  }

  function close() {
    showRequested = false
    snapshotQueued = false
    hideTimer.stop()
    opened = false
    state = "idle"
  }

  Timer {
    id: hideTimer
    interval: root.displayDuration
    repeat: false
    onTriggered: root.close()
  }

  Process {
    id: snapshotProcess
    command: [
      "bash",
      "-c",
      "printf '{\"monitors\":'; hyprctl monitors -j 2>/dev/null || exit 1; printf ',\"clients\":'; hyprctl clients -j 2>/dev/null || exit 1; printf '}'"
    ]

    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.snapshotOutput = text
        root.snapshotStreamDone = true
        root.finishSnapshot()
      }
    }

    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.lastError = String(text || "").trim()
    }

    onExited: function(exitCode) {
      root.snapshotExitCode = exitCode
      root.snapshotExited = true
      root.finishSnapshot()
    }
  }

  Connections {
    target: Hyprland

    function onRawEvent(event) {
      var name = String(event && event.name ? event.name : "")
      if (name === "workspacev2") root.requestShow()
    }
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { root.refreshDesktopEntries() }
  }

  Component.onCompleted: {
    root.refreshDesktopEntries()
    root.requestSnapshot()
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: panel
      required property var modelData

      readonly property bool targetScreen: root.monitorName(modelData) === root.targetMonitorName
      readonly property bool cornerLeft: root.selectedCorner.indexOf("left") !== -1
      readonly property bool cornerTop: root.selectedCorner.indexOf("top") === 0
      readonly property string barPosition: root.shell && root.shell.barConfig
        ? String(root.shell.barConfig.position || "top")
        : "top"
      readonly property bool barVertical: barPosition === "left" || barPosition === "right"
      readonly property int fallbackBarSize: barVertical
        ? Style.bar.sizeVertical
        : Style.bar.sizeHorizontal
      readonly property bool barVisible: !root.shell || !root.shell.bar
        || !("barHidden" in root.shell.bar)
        || root.shell.bar.barHidden !== true
      readonly property int liveBarSize: root.shell && root.shell.bar
        && ("barSize" in root.shell.bar)
        ? Math.max(0, Number(root.shell.bar.barSize) || fallbackBarSize)
        : fallbackBarSize
      readonly property int leftClearance: barVisible && barPosition === "left"
        ? liveBarSize + Style.gapsOut
        : Style.gapsOut
      readonly property int rightClearance: barVisible && barPosition === "right"
        ? liveBarSize + Style.gapsOut
        : Style.gapsOut
      readonly property int topClearance: barVisible && barPosition === "top"
        ? liveBarSize + Style.gapsOut
        : Style.gapsOut
      readonly property int bottomClearance: barVisible && barPosition === "bottom"
        ? liveBarSize + Style.gapsOut
        : Style.gapsOut

      screen: modelData
      visible: root.opened && targetScreen
      anchors {
        top: true
        bottom: true
        left: true
        right: true
      }
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "b-omahud"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      mask: Region {}

      BorderSurface {
        id: card

        width: borderLeft + root.cardPadding + root.gridWidth + root.cardPadding + borderRight
        height: borderTop + root.cardPadding + root.gridHeight + root.cardPadding + borderBottom
        anchors.left: panel.cornerLeft ? parent.left : undefined
        anchors.right: panel.cornerLeft ? undefined : parent.right
        anchors.top: panel.cornerTop ? parent.top : undefined
        anchors.bottom: panel.cornerTop ? undefined : parent.bottom
        anchors.leftMargin: panel.leftClearance
        anchors.rightMargin: panel.rightClearance
        anchors.topMargin: panel.topClearance
        anchors.bottomMargin: panel.bottomClearance
        color: Util.alpha(Color.background, 0.94)
        borderSpec: Border.surfaceSpec(
          "popups",
          "border",
          Color.popups.border,
          Math.max(1, Style.space(1))
        )
        radius: 0

        Grid {
          id: workspaceGrid

          anchors.left: parent.left
          anchors.top: parent.top
          anchors.leftMargin: card.borderLeft + root.cardPadding
          anchors.topMargin: card.borderTop + root.cardPadding
          columns: root.gridColumns
          rowSpacing: root.gridGap
          columnSpacing: root.gridGap

          Repeater {
            model: root.workspaces

            delegate: Item {
              id: workspaceTile
              required property var modelData
              readonly property var workspace: modelData
              readonly property color workspaceBackground: workspace.active
                ? Color.foreground
                : Color.background
              readonly property color workspaceForeground: workspace.active
                ? Color.background
                : Color.popups.text

              width: root.tileWidth
              height: root.tileHeight

              Rectangle {
                id: workspaceFrame

                readonly property real workspaceAspect: Math.max(
                  0.5,
                  Math.min(3, Number(workspaceTile.workspace.aspectRatio) || (16 / 9))
                )

                anchors.centerIn: parent
                width: Math.min(workspaceTile.width, workspaceTile.height * workspaceAspect)
                height: Math.min(workspaceTile.height, workspaceTile.width / workspaceAspect)
                color: workspaceTile.workspaceBackground
                border.width: 0
                radius: 0

                Item {
                  id: layoutFrame

                  anchors.fill: parent
                  clip: true

                  Repeater {
                    model: workspaceTile.workspace.windows || []

                    delegate: Rectangle {
                      id: windowFrame
                      required property var modelData
                      readonly property var windowData: modelData
                      readonly property real rawWidth: Math.max(0, Number(windowData.width) || 0)
                      readonly property real rawHeight: Math.max(0, Number(windowData.height) || 0)

                      x: Math.round((Number(windowData.x) || 0) * layoutFrame.width)
                      y: Math.round((Number(windowData.y) || 0) * layoutFrame.height)
                      width: Math.max(Style.space(4), Math.round(rawWidth * layoutFrame.width))
                      height: Math.max(Style.space(4), Math.round(rawHeight * layoutFrame.height))
                      color: "transparent"
                      border.color: windowData.floating
                        ? Util.alpha(
                          workspaceTile.workspace.active ? Color.background : Color.accent,
                          0.8
                        )
                        : Util.alpha(workspaceTile.workspaceForeground, 0.42)
                      border.width: windowData.fullscreen ? Math.max(1, Style.space(2)) : 1
                      radius: 0
                      clip: true

                      Row {
                        id: iconRow

                        anchors.centerIn: parent
                        spacing: 1
                        scale: Math.max(0, Math.min(
                          1,
                          (windowFrame.width - Style.space(2)) / Math.max(1, implicitWidth),
                          (windowFrame.height - Style.space(2)) / Math.max(1, implicitHeight)
                        ))

                        Repeater {
                          model: windowFrame.windowData.members || []

                          Image {
                            required property var modelData

                            width: Style.space(14)
                            height: width
                            fillMode: Image.PreserveAspectFit
                            sourceSize.width: width * Screen.devicePixelRatio
                            sourceSize.height: height * Screen.devicePixelRatio
                            asynchronous: true
                            mipmap: true
                            source: root.iconSource(modelData)
                            layer.enabled: true
                            layer.effect: MultiEffect {
                              colorization: 1.0
                              colorizationColor: workspaceTile.workspaceForeground
                            }
                          }
                        }
                      }
                    }
                  }
                }

                Rectangle {
                  id: numberBadge

                  readonly property int badgeSize: Math.ceil(
                    Math.max(numberLabel.implicitWidth, numberLabel.implicitHeight)
                  ) + Style.space(4)

                  anchors.left: parent.left
                  anchors.top: parent.top
                  anchors.margins: 0
                  width: badgeSize
                  height: badgeSize
                  radius: 0
                  color: workspaceTile.workspaceBackground
                  border.width: 0

                  Text {
                    id: numberLabel

                    anchors.centerIn: parent
                    text: HudModel.workspaceLabel(workspaceTile.workspace.id)
                    color: workspaceTile.workspaceForeground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.caption
                    font.bold: true
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  IpcHandler {
    target: root.pluginId

    function corner(value: string): string {
      return root.setCorner(value)
    }

    function duration(value: string): string {
      return root.setDuration(value)
    }
  }
}
