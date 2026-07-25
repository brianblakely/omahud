var DEFAULT_CORNER = "bottom-left"
var DEFAULT_DURATION = 1500
var MIN_DURATION = 250
var MAX_DURATION = 10000
var FALLBACK_ASPECT_RATIO = 16 / 9
var COINCIDENT_EPSILON = 0.0001

function finiteNumber(value, fallback) {
  var parsed = Number(value)
  return isFinite(parsed) ? parsed : fallback
}

function positiveInteger(value) {
  var parsed

  if (typeof value === "number") {
    parsed = value
  } else if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) {
    parsed = Number(value)
  } else {
    return 0
  }

  if (!isFinite(parsed) || parsed <= 0 || Math.floor(parsed) !== parsed) return 0
  return parsed
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function normalizeCorner(value) {
  var corner = String(value === undefined || value === null ? "" : value)
    .trim()
    .toLowerCase()

  if (corner === "bottom-left"
      || corner === "bottom-right"
      || corner === "top-left"
      || corner === "top-right") {
    return corner
  }

  return DEFAULT_CORNER
}

function parseDuration(value) {
  if (value === undefined || value === null) return DEFAULT_DURATION

  var raw = String(value).trim()
  if (raw.length === 0) return DEFAULT_DURATION

  var parsed = Number(raw)
  if (!isFinite(parsed) || parsed < MIN_DURATION || parsed > MAX_DURATION) {
    return DEFAULT_DURATION
  }

  return Math.round(parsed)
}

function normalizedTransform(value) {
  var transform = Math.floor(finiteNumber(value, 0)) % 8
  return transform < 0 ? transform + 8 : transform
}

function normalizeMonitor(raw, index) {
  raw = raw && typeof raw === "object" ? raw : {}

  var scale = finiteNumber(raw.scale, 1)
  if (scale <= 0) scale = 1

  var width = Math.max(0, finiteNumber(raw.width, 0)) / scale
  var height = Math.max(0, finiteNumber(raw.height, 0)) / scale
  if (normalizedTransform(raw.transform) % 2 === 1) {
    var swapped = width
    width = height
    height = swapped
  }

  var activeWorkspace = raw.activeWorkspace && typeof raw.activeWorkspace === "object"
    ? raw.activeWorkspace
    : {}

  return {
    id: raw.id === undefined || raw.id === null ? index : raw.id,
    name: String(raw.name === undefined || raw.name === null ? "" : raw.name),
    x: finiteNumber(raw.x, 0),
    y: finiteNumber(raw.y, 0),
    width: width,
    height: height,
    validGeometry: width > 0 && height > 0,
    focused: raw.focused === true,
    activeWorkspaceId: positiveInteger(activeWorkspace.id)
  }
}

function monitorKey(value) {
  return String(value === undefined || value === null ? "" : value)
}

function normalizeMonitors(monitors) {
  if (!Array.isArray(monitors)) return []

  var normalized = []
  for (var i = 0; i < monitors.length; i++) {
    if (!monitors[i] || typeof monitors[i] !== "object") continue
    normalized.push(normalizeMonitor(monitors[i], i))
  }
  return normalized
}

function focusedMonitor(monitors) {
  for (var i = 0; i < monitors.length; i++) {
    if (monitors[i].focused) return monitors[i]
  }
  return monitors.length > 0 ? monitors[0] : null
}

function monitorForClient(client, workspaceId, monitors, fallback) {
  var requested = monitorKey(client.monitor)

  for (var i = 0; i < monitors.length; i++) {
    if (monitorKey(monitors[i].id) === requested || monitors[i].name === requested) {
      return monitors[i]
    }
  }

  for (var j = 0; j < monitors.length; j++) {
    if (monitors[j].activeWorkspaceId === workspaceId) return monitors[j]
  }

  return fallback || (monitors.length > 0 ? monitors[0] : null)
}

function arrayNumber(value, index, fallback) {
  if (!Array.isArray(value) || index >= value.length) return fallback
  return finiteNumber(value[index], fallback)
}

function normalizedRect(client, monitor) {
  if (!monitor || !monitor.validGeometry) {
    return { x: 0, y: 0, width: 1, height: 1 }
  }

  var left = arrayNumber(client.at, 0, monitor.x)
  var top = arrayNumber(client.at, 1, monitor.y)
  var width = Math.max(0, arrayNumber(client.size, 0, 0))
  var height = Math.max(0, arrayNumber(client.size, 1, 0))

  var normalizedLeft = clamp((left - monitor.x) / monitor.width, 0, 1)
  var normalizedTop = clamp((top - monitor.y) / monitor.height, 0, 1)
  var normalizedRight = clamp((left + width - monitor.x) / monitor.width, 0, 1)
  var normalizedBottom = clamp((top + height - monitor.y) / monitor.height, 0, 1)

  return {
    x: normalizedLeft,
    y: normalizedTop,
    width: Math.max(0, normalizedRight - normalizedLeft),
    height: Math.max(0, normalizedBottom - normalizedTop)
  }
}

function nonEmptyString(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function iconCandidates(client) {
  var candidates = []
  var className = nonEmptyString(client["class"])
  var initialClass = nonEmptyString(client.initialClass)

  if (className.length > 0) candidates.push(className)
  if (initialClass.length > 0 && candidates.indexOf(initialClass) === -1) {
    candidates.push(initialClass)
  }

  return candidates
}

function flag(value) {
  return value === true || value === 1 || value === "1"
}

function focusHistoryId(value) {
  var parsed = Math.floor(finiteNumber(value, -1))
  return parsed >= 0 ? parsed : -1
}

function clientEntry(client, workspaceId, monitor, inputIndex) {
  var address = nonEmptyString(client.address)
  var grouped = Array.isArray(client.grouped) ? client.grouped : []
  var groupAddresses = []

  for (var i = 0; i < grouped.length; i++) {
    var groupedAddress = nonEmptyString(grouped[i]).toLowerCase()
    if (groupedAddress.length > 0 && groupAddresses.indexOf(groupedAddress) === -1) {
      groupAddresses.push(groupedAddress)
    }
  }

  return {
    workspaceId: workspaceId,
    monitor: monitor,
    rect: normalizedRect(client, monitor),
    floating: flag(client.floating),
    fullscreen: flag(client.fullscreen) || finiteNumber(client.fullscreen, 0) > 0,
    history: focusHistoryId(client.focusHistoryID),
    inputIndex: inputIndex,
    addressKey: address.toLowerCase(),
    groupAddresses: groupAddresses,
    member: {
      address: address,
      title: nonEmptyString(client.title),
      className: nonEmptyString(client["class"]),
      initialClass: nonEmptyString(client.initialClass),
      iconCandidates: iconCandidates(client)
    }
  }
}

function coincident(first, second) {
  if (first.width <= 0 || first.height <= 0 || second.width <= 0 || second.height <= 0) {
    return false
  }

  return Math.abs(first.x - second.x) <= COINCIDENT_EPSILON
    && Math.abs(first.y - second.y) <= COINCIDENT_EPSILON
    && Math.abs(first.width - second.width) <= COINCIDENT_EPSILON
    && Math.abs(first.height - second.height) <= COINCIDENT_EPSILON
}

function unionFind(size) {
  var parents = []
  for (var i = 0; i < size; i++) parents.push(i)

  function root(index) {
    var current = index
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]]
      current = parents[current]
    }
    return current
  }

  function join(first, second) {
    var firstRoot = root(first)
    var secondRoot = root(second)
    if (firstRoot === secondRoot) return
    if (firstRoot < secondRoot) parents[secondRoot] = firstRoot
    else parents[firstRoot] = secondRoot
  }

  return { root: root, join: join }
}

function memberForegroundOrder(first, second) {
  var firstHistory = first.history < 0 ? 2147483647 : first.history
  var secondHistory = second.history < 0 ? 2147483647 : second.history
  if (firstHistory !== secondHistory) return firstHistory - secondHistory

  var firstKey = first.addressKey || first.member.className || String(first.inputIndex)
  var secondKey = second.addressKey || second.member.className || String(second.inputIndex)
  if (firstKey < secondKey) return -1
  if (firstKey > secondKey) return 1
  return first.inputIndex - second.inputIndex
}

function clusterEntries(entries) {
  if (entries.length === 0) return []

  var groups = unionFind(entries.length)
  var addressOwners = {}
  var groupOwners = {}
  var i

  for (i = 0; i < entries.length; i++) {
    if (entries[i].addressKey.length > 0) addressOwners[entries[i].addressKey] = i
  }

  for (i = 0; i < entries.length; i++) {
    for (var groupIndex = 0; groupIndex < entries[i].groupAddresses.length; groupIndex++) {
      var groupAddress = entries[i].groupAddresses[groupIndex]
      if (addressOwners[groupAddress] !== undefined) groups.join(i, addressOwners[groupAddress])
      if (groupOwners[groupAddress] !== undefined) groups.join(i, groupOwners[groupAddress])
      else groupOwners[groupAddress] = i
    }
  }

  for (i = 0; i < entries.length; i++) {
    for (var j = i + 1; j < entries.length; j++) {
      if (coincident(entries[i].rect, entries[j].rect)) groups.join(i, j)
    }
  }

  var buckets = {}
  for (i = 0; i < entries.length; i++) {
    var root = String(groups.root(i))
    if (!buckets[root]) buckets[root] = []
    buckets[root].push(entries[i])
  }

  var clusters = []
  var roots = Object.keys(buckets).sort(function (first, second) {
    return Number(first) - Number(second)
  })

  for (i = 0; i < roots.length; i++) {
    var members = buckets[roots[i]].slice().sort(memberForegroundOrder)
    var foreground = members[0]
    var floating = false
    var fullscreen = false
    var mostRecentHistory = -1
    var outputMembers = []

    for (j = 0; j < members.length; j++) {
      floating = floating || members[j].floating
      fullscreen = fullscreen || members[j].fullscreen
      if (members[j].history >= 0
          && (mostRecentHistory < 0 || members[j].history < mostRecentHistory)) {
        mostRecentHistory = members[j].history
      }
      outputMembers.push(members[j].member)
    }

    var area = foreground.rect.width * foreground.rect.height
    clusters.push({
      x: foreground.rect.x,
      y: foreground.rect.y,
      width: foreground.rect.width,
      height: foreground.rect.height,
      floating: floating,
      fullscreen: fullscreen,
      members: outputMembers,
      _background: fullscreen || area >= 0.82,
      _area: area,
      _history: mostRecentHistory,
      _key: foreground.addressKey || foreground.member.className || String(foreground.inputIndex)
    })
  }

  return clusters
}

function drawingCategory(cluster) {
  if (cluster._background) return 0
  return cluster.floating ? 2 : 1
}

function drawingOrder(first, second) {
  var firstCategory = drawingCategory(first)
  var secondCategory = drawingCategory(second)
  if (firstCategory !== secondCategory) return firstCategory - secondCategory

  if (firstCategory === 0 && Math.abs(first._area - second._area) > COINCIDENT_EPSILON) {
    return second._area - first._area
  }

  var firstHistory = first._history < 0 ? 2147483647 : first._history
  var secondHistory = second._history < 0 ? 2147483647 : second._history
  if (firstHistory !== secondHistory) return secondHistory - firstHistory

  if (first._key < second._key) return -1
  if (first._key > second._key) return 1
  if (first.y !== second.y) return first.y - second.y
  return first.x - second.x
}

function publicCluster(cluster) {
  return {
    x: cluster.x,
    y: cluster.y,
    width: cluster.width,
    height: cluster.height,
    floating: cluster.floating,
    fullscreen: cluster.fullscreen,
    members: cluster.members
  }
}

function workspaceAspectRatio(monitor) {
  if (!monitor || !monitor.validGeometry || monitor.height <= 0) return FALLBACK_ASPECT_RATIO
  return monitor.width / monitor.height
}

function buildWorkspaceModel(monitors, clients) {
  var normalizedMonitors = normalizeMonitors(monitors)
  var targetMonitor = focusedMonitor(normalizedMonitors)
  var activeWorkspaceId = targetMonitor ? targetMonitor.activeWorkspaceId : 0
  var buckets = {}

  if (Array.isArray(clients)) {
    for (var i = 0; i < clients.length; i++) {
      var client = clients[i]
      if (!client || typeof client !== "object" || client.mapped !== true) continue

      var workspace = client.workspace && typeof client.workspace === "object"
        ? client.workspace
        : {}
      var workspaceId = positiveInteger(workspace.id)
      if (workspaceId === 0) continue

      var monitor = monitorForClient(client, workspaceId, normalizedMonitors, targetMonitor)
      var key = String(workspaceId)
      if (!buckets[key]) {
        buckets[key] = {
          id: workspaceId,
          monitor: monitor,
          entries: []
        }
      }
      buckets[key].entries.push(clientEntry(client, workspaceId, monitor, i))
    }
  }

  if (activeWorkspaceId > 0 && !buckets[String(activeWorkspaceId)]) {
    buckets[String(activeWorkspaceId)] = {
      id: activeWorkspaceId,
      monitor: targetMonitor,
      entries: []
    }
  }

  var workspaceIds = Object.keys(buckets).map(function (value) {
    return Number(value)
  }).sort(function (first, second) {
    return first - second
  })

  var workspaces = []
  for (var workspaceIndex = 0; workspaceIndex < workspaceIds.length; workspaceIndex++) {
    var bucket = buckets[String(workspaceIds[workspaceIndex])]
    var clusters = clusterEntries(bucket.entries).sort(drawingOrder)
    var windows = []

    for (var clusterIndex = 0; clusterIndex < clusters.length; clusterIndex++) {
      windows.push(publicCluster(clusters[clusterIndex]))
    }

    workspaces.push({
      id: bucket.id,
      monitorName: bucket.monitor ? bucket.monitor.name : "",
      active: bucket.id === activeWorkspaceId,
      empty: windows.length === 0,
      aspectRatio: workspaceAspectRatio(bucket.monitor),
      windows: windows
    })
  }

  return {
    targetMonitorName: targetMonitor ? targetMonitor.name : "",
    activeWorkspaceId: activeWorkspaceId,
    workspaces: workspaces
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    buildWorkspaceModel: buildWorkspaceModel,
    normalizeCorner: normalizeCorner,
    parseDuration: parseDuration
  }
}
