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
  readonly property int displayDuration: HudModel.parseDuration(setting("durationMs", 2000))
  readonly property int focusedWorkspaceId: Hyprland.focusedWorkspace
    ? Number(Hyprland.focusedWorkspace.id) || 0
    : 0
  property int eventWorkspaceId: 0
  property int eventScratchState: -1
  readonly property int displayWorkspaceId: eventWorkspaceId > 0
    ? eventWorkspaceId
    : focusedWorkspaceId
  readonly property string focusedMonitorName: {
    var workspace = Hyprland.focusedWorkspace
    if (workspace && workspace.monitor && workspace.monitor.name !== undefined)
      return String(workspace.monitor.name)

    var monitor = Hyprland.focusedMonitor
    return monitor && monitor.name !== undefined ? String(monitor.name) : ""
  }
  readonly property var displayModel: HudModel.activateWorkspace(
    hudModel,
    displayWorkspaceId,
    focusedMonitorName,
    eventScratchState
  )
  readonly property var workspaces: displayModel && Array.isArray(displayModel.workspaces)
    ? displayModel.workspaces
    : []
  readonly property var emptyWorkspaceSlot: ({
    id: 0,
    monitorName: "",
    active: false,
    scratch: false,
    empty: true,
    aspectRatio: 16 / 9,
    windows: []
  })
  readonly property string targetMonitorName: displayModel
    ? String(displayModel.targetMonitorName || "")
    : ""

  readonly property int cardPadding: Style.space(10)
  readonly property int gridGap: Style.space(7)
  readonly property int tileWidth: Style.space(46)
  readonly property int tileHeight: Style.space(29)
  readonly property int windowDiagramBorderWidth: 1
  readonly property int gridColumns: Math.max(1, workspaces.length)
  readonly property int gridRows: 1
  readonly property int gridWidth: gridColumns * tileWidth + Math.max(0, gridColumns - 1) * gridGap
  readonly property int gridHeight: gridRows * tileHeight + Math.max(0, gridRows - 1) * gridGap
  readonly property string iconFontFamily: "JetBrainsMono Nerd Font"
  readonly property string defaultHudBorderColor: "rgba(595959aa)"
  readonly property color hudBorderColor: Color.flatColor(
    hudBorderColorValue,
    Qt.rgba(0x59 / 255, 0x59 / 255, 0x59 / 255, 0xaa / 255)
  )
  readonly property var hudBorderSpec: ({
    color: hudBorderColor,
    widths: Border.surfaceWidths(
      "popups",
      "border",
      Math.max(1, Style.space(2))
    ),
    gradient: { colors: [], angle: 0, enabled: false }
  })

  property var hudModel: ({
    targetMonitorName: "",
    activeWorkspaceId: 0,
    workspaces: []
  })
  // Omarchy quattro exposes ten numbered workspaces plus special:scratchpad.
  // Keep their delegates alive so additions and removals are one frame update;
  // custom workspace counts can grow this pool, but it never shrinks.
  property int workspaceSlotCount: 11
  property bool showRequested: false
  property bool snapshotInFlight: false
  property bool snapshotQueued: false
  property bool snapshotStreamDone: false
  property bool snapshotExited: false
  property int snapshotExitCode: -1
  property string snapshotOutput: ""
  property var desktopEntries: []
  property string hudBorderColorValue: defaultHudBorderColor
  property bool borderColorRefreshQueued: false
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

  function desktopEntry(member) {
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

    return entry
  }

  function iconSource(member, entry) {
    if (entry === undefined) entry = desktopEntry(member)
    var candidates = member && Array.isArray(member.iconCandidates)
      ? member.iconCandidates
      : []
    var genericSource = String(
      Quickshell.iconPath("application-x-executable", true) || ""
    )

    function actualIcon(source) {
      var value = String(source || "")
      return value.length > 0 && value !== genericSource ? source : ""
    }

    if (entry && entry.icon) {
      if (shell && shell.appLibrary && typeof shell.appLibrary.iconSource === "function") {
        var libraryIcon = actualIcon(shell.appLibrary.iconSource(entry.icon))
        if (libraryIcon) return libraryIcon
      }

      var entryIcon = actualIcon(Quickshell.iconPath(String(entry.icon), true))
      if (entryIcon) return entryIcon
    }

    for (var j = 0; j < candidates.length; j++) {
      var classIconCandidate = String(candidates[j] || "").trim()
      if (!classIconCandidate) continue
      var classIcon = actualIcon(Quickshell.iconPath(classIconCandidate, true))
      if (classIcon) return classIcon
    }

    return ""
  }

  function fallbackIconTint(foreground, surface) {
    var tint = HudModel.fallbackIconTint(foreground, surface)
    return Qt.rgba(tint.r, tint.g, tint.b, tint.a)
  }

  function refreshHudBorderColor() {
    if (borderColorProcess.running) {
      borderColorRefreshQueued = true
      return
    }

    borderColorRefreshQueued = false
    borderColorProcess.running = true
  }

  function requestShow() {
    showRequested = true
    hideTimer.stop()
    showCachedModel()
    requestSnapshot()
    return opened ? "visible" : "queued"
  }

  function reconcileEventWorkspace() {
    if (eventWorkspaceId > 0 && eventWorkspaceId === focusedWorkspaceId)
      eventWorkspaceId = 0
  }

  function reserveWorkspaceSlots(count) {
    var requested = Math.max(11, Math.floor(Number(count) || 0))
    if (requested > workspaceSlotCount) workspaceSlotCount = requested
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

    if (rerun) {
      Qt.callLater(beginSnapshot)
      return
    }

    if (snapshotExitCode === 0) applySnapshot(snapshotOutput)
    else failSnapshot(lastError || "hyprctl workspace snapshot failed")
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
    if (!next || !next.targetMonitorName || !Array.isArray(next.workspaces)) {
      failSnapshot("no numbered workspaces to display")
      return
    }

    hudModel = next
    if (next.workspaces.length === 0) {
      close()
      return
    }
    eventScratchState = -1

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

  Process {
    id: borderColorProcess
    command: [
      root.omarchyPath + "/bin/omarchy-theme-color",
      "hyprland_inactive_border",
      root.defaultHudBorderColor
    ]

    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var value = String(text || "").trim()
        root.hudBorderColorValue = value || root.defaultHudBorderColor
      }
    }

    onExited: {
      if (!root.borderColorRefreshQueued) return
      root.borderColorRefreshQueued = false
      Qt.callLater(root.refreshHudBorderColor)
    }
  }

  Connections {
    target: Hyprland

    function onRawEvent(event) {
      var name = String(event && event.name ? event.name : "")
      if (name === "workspacev2") {
        var workspaceId = HudModel.workspaceEventId(event)
        if (workspaceId > 0) root.eventWorkspaceId = workspaceId
        root.requestShow()
        Qt.callLater(root.reconcileEventWorkspace)
      } else if (name === "activespecialv2" || name === "activespecial") {
        root.eventScratchState = HudModel.scratchEventActive(event) ? 1 : 0
        root.requestShow()
      }
    }
  }

  onFocusedWorkspaceIdChanged: reconcileEventWorkspace()
  onWorkspacesChanged: reserveWorkspaceSlots(workspaces.length)

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { root.refreshDesktopEntries() }
  }

  Connections {
    target: Color
    function onShellValuesChanged() { root.refreshHudBorderColor() }
  }

  Component.onCompleted: {
    root.refreshDesktopEntries()
    root.refreshHudBorderColor()
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

      screen: modelData
      visible: true
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

        visible: root.opened && panel.targetScreen
        width: borderLeft + root.cardPadding + root.gridWidth + root.cardPadding + borderRight
        height: borderTop + root.cardPadding + root.gridHeight + root.cardPadding + borderBottom
        anchors.left: panel.cornerLeft ? parent.left : undefined
        anchors.right: panel.cornerLeft ? undefined : parent.right
        anchors.top: panel.cornerTop ? parent.top : undefined
        anchors.bottom: panel.cornerTop ? undefined : parent.bottom
        anchors.margins: 0
        color: Util.alpha(Color.background, 0.94)
        borderSpec: root.hudBorderSpec
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
            model: root.workspaceSlotCount

            delegate: Item {
              id: workspaceTile
              required property int index
              readonly property var workspaceData: index < root.workspaces.length
                ? root.workspaces[index]
                : null
              readonly property var workspace: workspaceData || root.emptyWorkspaceSlot
              readonly property color workspaceBackground: workspace.active
                ? Color.foreground
                : Color.background
              readonly property color workspaceForeground: workspace.active
                ? Color.background
                : Color.popups.text
              readonly property color fallbackIconColor: root.fallbackIconTint(
                workspaceForeground,
                workspaceBackground
              )
              readonly property real workspaceAspect: Math.max(
                0.5,
                Math.min(3, Number(workspace.aspectRatio) || (16 / 9))
              )
              readonly property var workspaceDimensions: HudModel.integerWorkspaceSize(
                workspaceAspect,
                width,
                height
              )
              readonly property int workspaceWidth: workspaceDimensions.width
              readonly property int workspaceHeight: workspaceDimensions.height

              width: root.tileWidth
              height: root.tileHeight
              visible: workspaceData !== null
                && (!workspace.empty || workspace.id === root.displayWorkspaceId)

              Rectangle {
                id: workspaceFrame

                x: Math.floor((workspaceTile.width - width) / 2)
                y: Math.floor((workspaceTile.height - height) / 2)
                width: workspaceTile.workspaceWidth
                height: workspaceTile.workspaceHeight
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
                      readonly property var frameGeometry: HudModel.integerWindowRect(
                        windowData,
                        layoutFrame.width,
                        layoutFrame.height
                      )
                      readonly property int frameX: frameGeometry.x
                      readonly property int frameY: frameGeometry.y
                      readonly property int frameWidth: frameGeometry.width
                      readonly property int frameHeight: frameGeometry.height
                      readonly property var members: windowData && windowData.members
                        ? windowData.members
                        : []
                      readonly property int iconSpacing: 1
                      readonly property real iconPixelRatio: Math.max(
                        1,
                        Number(Screen.devicePixelRatio) || 1
                      )
                      readonly property int iconSize: HudModel.integerIconSize(
                        frameWidth,
                        frameHeight,
                        members.length,
                        Style.space(14),
                        iconSpacing,
                        root.windowDiagramBorderWidth
                      )

                      x: frameX
                      y: frameY
                      width: frameWidth
                      height: frameHeight
                      color: "transparent"
                      border.width: 0
                      radius: 0
                      clip: false

                      Item {
                        anchors.fill: parent
                        clip: true

                        Row {
                          id: iconRow

                          x: HudModel.pixelSnap(
                            (parent.width - width) / 2,
                            windowFrame.iconPixelRatio
                          )
                          y: HudModel.pixelSnap(
                            (parent.height - height) / 2,
                            windowFrame.iconPixelRatio
                          )
                          width: implicitWidth
                          height: implicitHeight
                          spacing: windowFrame.iconSpacing

                          Repeater {
                            model: windowFrame.members

                            Item {
                              id: appIcon
                              required property var modelData
                              readonly property var entry: root.desktopEntry(modelData)
                              readonly property string mappedGlyph: HudModel.appGlyph(modelData, entry)
                              readonly property var imageSource: mappedGlyph.length === 0
                                ? root.iconSource(modelData, entry)
                                : ""
                              readonly property bool imageUnavailable: mappedGlyph.length === 0
                                && (String(imageSource).length === 0 || appImage.status === Image.Error)
                              readonly property string glyph: mappedGlyph.length > 0
                                ? mappedGlyph
                                : (imageUnavailable ? HudModel.genericAppGlyph() : "")

                              width: windowFrame.iconSize
                              height: width
                              visible: width > 0

                              TextMetrics {
                                id: appGlyphMetrics

                                font.family: root.iconFontFamily
                                font.pixelSize: Math.max(1, Math.round(appIcon.height))
                                text: appIcon.glyph
                              }

                              OpticalGlyph {
                                id: appGlyph
                                readonly property real rawVerticalCenterOffset: appIcon.glyph.length > 0
                                  ? height / 2 - (
                                    baselineY
                                    + appGlyphMetrics.tightBoundingRect.y
                                    + appGlyphMetrics.tightBoundingRect.height / 2
                                  )
                                  : 0

                                anchors.centerIn: parent
                                anchors.verticalCenterOffset: HudModel.pixelSnap(
                                  rawVerticalCenterOffset,
                                  windowFrame.iconPixelRatio
                                )
                                width: parent.width
                                height: parent.height
                                visible: appIcon.glyph.length > 0
                                text: appIcon.glyph
                                color: workspaceTile.workspaceForeground
                                fontFamily: root.iconFontFamily
                                fontSize: appIcon.height
                              }

                              Image {
                                id: appImage
                                anchors.fill: parent
                                visible: appIcon.glyph.length === 0
                                fillMode: Image.PreserveAspectFit
                                sourceSize.width: Math.max(
                                  1,
                                  Math.round(width * windowFrame.iconPixelRatio)
                                )
                                sourceSize.height: Math.max(
                                  1,
                                  Math.round(height * windowFrame.iconPixelRatio)
                                )
                                asynchronous: true
                                smooth: true
                                mipmap: false
                                source: appIcon.imageSource
                                layer.enabled: visible
                                layer.effect: MultiEffect {
                                  colorization: 1.0
                                  colorizationColor: workspaceTile.fallbackIconColor
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }

                  // Target: Omarchy quattro caeffdc27b7ffbfe4d9d6e8cc1ba0f6c8842256f.
                  // Its BorderSurface/BorderOverlay paints asymmetric sides inward,
                  // so the one-pixel segments are centered on shared edges explicitly.
                  Item {
                    id: windowBorderLayer

                    anchors.fill: parent
                    z: 100000

                    Repeater {
                      model: workspaceTile.workspace.windows || []

                      delegate: Item {
                        id: windowBorder
                        required property var modelData
                        readonly property var windowData: modelData
                        readonly property var frameGeometry: HudModel.integerWindowRect(
                          windowData,
                          windowBorderLayer.width,
                          windowBorderLayer.height
                        )
                        readonly property int frameX: frameGeometry.x
                        readonly property int frameY: frameGeometry.y
                        readonly property int frameWidth: frameGeometry.width
                        readonly property int frameHeight: frameGeometry.height
                        readonly property bool projectedOuterTop: frameY <= 0
                        readonly property bool projectedOuterRight: frameGeometry.right >= windowBorderLayer.width
                        readonly property bool projectedOuterBottom: frameGeometry.bottom >= windowBorderLayer.height
                        readonly property bool projectedOuterLeft: frameX <= 0
                        readonly property int strokeWidth: root.windowDiagramBorderWidth
                        readonly property real halfStroke: strokeWidth / 2
                        readonly property color strokeColor: windowData.floating
                          ? (workspaceTile.workspace.active
                            ? Color.background
                            : Color.foreground)
                          : Util.alpha(workspaceTile.workspaceForeground, 0.42)

                        x: frameX
                        y: frameY
                        width: frameWidth
                        height: frameHeight

                        Rectangle {
                          visible: windowBorder.windowData.borderTop !== false
                            && (windowBorder.windowData.floating === true
                              || windowBorder.windowData.outerTop !== true)
                          x: 0
                          y: windowBorder.projectedOuterTop
                            ? 0
                            : -windowBorder.halfStroke
                          width: parent.width
                          height: windowBorder.strokeWidth
                          color: windowBorder.strokeColor
                        }

                        Rectangle {
                          visible: windowBorder.windowData.borderRight !== false
                            && (windowBorder.windowData.floating === true
                              || windowBorder.windowData.outerRight !== true)
                          x: windowBorder.projectedOuterRight
                            ? parent.width - windowBorder.strokeWidth
                            : parent.width - windowBorder.halfStroke
                          y: 0
                          width: windowBorder.strokeWidth
                          height: parent.height
                          color: windowBorder.strokeColor
                        }

                        Rectangle {
                          visible: windowBorder.windowData.borderBottom !== false
                            && (windowBorder.windowData.floating === true
                              || windowBorder.windowData.outerBottom !== true)
                          x: 0
                          y: windowBorder.projectedOuterBottom
                            ? parent.height - windowBorder.strokeWidth
                            : parent.height - windowBorder.halfStroke
                          width: parent.width
                          height: windowBorder.strokeWidth
                          color: windowBorder.strokeColor
                        }

                        Rectangle {
                          visible: windowBorder.windowData.borderLeft !== false
                            && (windowBorder.windowData.floating === true
                              || windowBorder.windowData.outerLeft !== true)
                          x: windowBorder.projectedOuterLeft
                            ? 0
                            : -windowBorder.halfStroke
                          y: 0
                          width: windowBorder.strokeWidth
                          height: parent.height
                          color: windowBorder.strokeColor
                        }
                      }
                    }
                  }
                }

                Rectangle {
                  id: numberBadge

                  readonly property int badgeSize: Math.ceil(
                    Math.max(numberLabel.implicitWidth, numberLabel.implicitHeight)
                  )

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
