var DEFAULT_CORNER = "bottom-left"
var DEFAULT_DURATION = 2000
var MIN_DURATION = 250
var MAX_DURATION = 10000
var FALLBACK_ASPECT_RATIO = 16 / 9
var COINCIDENT_EPSILON = 0.0001
var EDGE_EPSILON = 0.0001
// Omarchy quattro's SUPER+S binding targets this named special workspace.
var SCRATCH_WORKSPACE_ID = "special:scratchpad"
// nf-md-application: used only after both mapped glyph and image lookup fail.
var GENERIC_APP_GLYPH = "\udb82\udcc6"

// App glyphs already assigned by Omarchy's default menu and provided by its
// default JetBrainsMono Nerd Font package. Keep matching exact so a web app
// class such as "chrome-chatgpt.com__-Default" does not become Chrome.
var APP_GLYPHS = {
  "1password": "\udb82\udc81",
  "alacritty": "\ue795",
  "app.zen_browser.zen": "\udb81\udd9f",
  "bitwarden": "\udb81\udff5",
  "brave": "\udb81\udd9f",
  "brave-browser": "\udb81\udd9f",
  "brave-origin": "\udb81\udd9f",
  "chrome": "\udb80\udeaf",
  "chromium": "\uf268",
  "chromium-browser": "\uf268",
  "code": "\ue8da",
  "code-oss": "\ue8da",
  "com.1password.1password": "\udb82\udc81",
  "com.bitwarden.desktop": "\udb81\udff5",
  "com.brave.browser": "\udb81\udd9f",
  "com.google.chrome": "\udb80\udeaf",
  "com.heroicgameslauncher.hgl": "\udb85\udcdf",
  "com.microsoft.edge": "\udb80\udde9",
  "com.mitchellh.ghostty": "\ue795",
  "com.spotify.client": "\udb81\udcc7",
  "com.valvesoftware.steam": "\uf1b6",
  "com.visualstudio.code": "\ue8da",
  "com.vscodium.codium": "\ue8da",
  "dropbox": "\ue707",
  "edge": "\udb80\udde9",
  "firefox": "\udb80\ude39",
  "firefox-esr": "\udb80\ude39",
  "foot": "\ue795",
  "ghostty": "\ue795",
  "google-chrome": "\udb80\udeaf",
  "google-chrome-stable": "\udb80\udeaf",
  "heroic": "\udb85\udcdf",
  "heroic games launcher": "\udb85\udcdf",
  "io.neovim.nvim": "\ue6ae",
  "kitty": "\ue795",
  "lutris": "\uef94",
  "microsoft-edge": "\udb80\udde9",
  "microsoft-edge-stable": "\udb80\udde9",
  "minecraft": "\udb80\udf73",
  "minecraft-launcher": "\udb80\udf73",
  "net.lutris.lutris": "\uef94",
  "neovim": "\ue6ae",
  "nvim": "\ue6ae",
  "org.codeberg.dnkl.foot": "\ue795",
  "org.libretro.retroarch": "\udb82\udfc9",
  "org.mozilla.firefox": "\udb80\ude39",
  "org.omarchy.nvim": "\ue6ae",
  "org.signal.signal": "\udb82\udf79",
  "retroarch": "\udb82\udfc9",
  "signal": "\udb82\udf79",
  "signal-desktop": "\udb82\udf79",
  "spotify": "\udb81\udcc7",
  "steam": "\uf1b6",
  "vim": "\ue62b",
  "visual studio code": "\ue8da",
  "vscode": "\ue8da",
  "xbox cloud gaming": "\ued3e",
  "zen": "\udb81\udd9f",
  "zen-browser": "\udb81\udd9f"
}

var ENTRY_ONLY_APP_GLYPHS = {
  "com.docker.desktop": "\uf21f",
  "docker": "\uf21f"
}

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

function isScratchWorkspace(value) {
  if (value && typeof value === "object") {
    return nonEmptyString(value.id).toLowerCase() === SCRATCH_WORKSPACE_ID
      || nonEmptyString(value.name).toLowerCase() === SCRATCH_WORKSPACE_ID
  }

  return nonEmptyString(value).toLowerCase() === SCRATCH_WORKSPACE_ID
}

function workspaceIdentity(workspace) {
  return isScratchWorkspace(workspace) ? SCRATCH_WORKSPACE_ID : positiveInteger(workspace && workspace.id)
}

function compareWorkspaceIds(first, second) {
  var firstScratch = isScratchWorkspace(first)
  var secondScratch = isScratchWorkspace(second)
  if (firstScratch || secondScratch) {
    if (firstScratch && secondScratch) return 0
    return firstScratch ? 1 : -1
  }
  return positiveInteger(first) - positiveInteger(second)
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
  var specialWorkspace = raw.specialWorkspace && typeof raw.specialWorkspace === "object"
    ? raw.specialWorkspace
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
    activeWorkspaceId: positiveInteger(activeWorkspace.id),
    scratchActive: isScratchWorkspace(specialWorkspace)
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

function lowerString(value) {
  return nonEmptyString(value).toLowerCase()
}

function desktopId(value) {
  var id = lowerString(value)
  return id.slice(-8) === ".desktop" ? id.slice(0, -8) : id
}

function compactIdentity(value) {
  return lowerString(value).replace(/[^a-z0-9]+/g, "")
}

function finalIdentityToken(value) {
  var tokens = lowerString(value).split(/[^a-z0-9]+/)
  for (var i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].length >= 3) return tokens[i]
  }
  return ""
}

function objectString(object, property) {
  try {
    return object ? nonEmptyString(object[property]) : ""
  } catch (error) {
    return ""
  }
}

function memberIdentityCandidates(member) {
  member = member && typeof member === "object" ? member : {}

  var input = Array.isArray(member.iconCandidates) ? member.iconCandidates.slice() : []
  input.push(member.className)
  input.push(member.initialClass)

  var output = []
  for (var i = 0; i < input.length; i++) {
    var candidate = nonEmptyString(input[i])
    if (candidate.length > 0 && output.indexOf(candidate) === -1) output.push(candidate)
  }
  return output
}

function normalizedAppIdentity(value) {
  var identity = lowerString(value)
  return identity.slice(-8) === ".desktop" ? identity.slice(0, -8) : identity
}

function iconIdentity(value) {
  var identity = lowerString(value).split("?")[0]
  var slash = Math.max(identity.lastIndexOf("/"), identity.lastIndexOf("\\"))
  if (slash >= 0) identity = identity.slice(slash + 1)
  return identity.replace(/\.(?:png|svg|xpm)$/i, "")
}

function appendIdentity(output, value) {
  var identity = normalizedAppIdentity(value)
  if (identity && output.indexOf(identity) === -1) output.push(identity)
}

function entryAppIdentities(entry) {
  var output = []
  appendIdentity(output, objectString(entry, "id"))
  appendIdentity(output, objectString(entry, "startupClass"))
  appendIdentity(output, objectString(entry, "name"))
  appendIdentity(output, executableName(objectString(entry, "execString")))
  appendIdentity(output, iconIdentity(objectString(entry, "icon")))
  return output
}

function memberAppIdentities(member) {
  var input = memberIdentityCandidates(member)
  var output = []
  for (var i = 0; i < input.length; i++) appendIdentity(output, input[i])
  return output
}

function mappedGlyph(identities, mapping) {
  for (var i = 0; i < identities.length; i++) {
    if (Object.prototype.hasOwnProperty.call(mapping, identities[i]))
      return mapping[identities[i]]
  }
  return ""
}

function appGlyph(member, entry) {
  var entryIdentities = entryAppIdentities(entry)
  var glyph = mappedGlyph(entryIdentities, APP_GLYPHS)
    || mappedGlyph(entryIdentities, ENTRY_ONLY_APP_GLYPHS)
  if (glyph) return glyph
  return mappedGlyph(memberAppIdentities(member), APP_GLYPHS)
}

function genericAppGlyph() {
  return GENERIC_APP_GLYPH
}

function colorChannelLuminance(value) {
  var channel = clamp(finiteNumber(value, 0), 0, 1)
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4)
}

function colorLuminance(color) {
  color = color && typeof color === "object" ? color : {}
  return 0.2126 * colorChannelLuminance(color.r)
    + 0.7152 * colorChannelLuminance(color.g)
    + 0.0722 * colorChannelLuminance(color.b)
}

function fallbackIconTint(foreground, surface) {
  foreground = foreground && typeof foreground === "object" ? foreground : {}
  surface = surface && typeof surface === "object" ? surface : {}
  var amount = colorLuminance(foreground) < 0.08 && colorLuminance(surface) > 0.35
    ? 0.35
    : 0
  var foregroundRed = clamp(finiteNumber(foreground.r, 0), 0, 1)
  var foregroundGreen = clamp(finiteNumber(foreground.g, 0), 0, 1)
  var foregroundBlue = clamp(finiteNumber(foreground.b, 0), 0, 1)
  var surfaceRed = clamp(finiteNumber(surface.r, 0), 0, 1)
  var surfaceGreen = clamp(finiteNumber(surface.g, 0), 0, 1)
  var surfaceBlue = clamp(finiteNumber(surface.b, 0), 0, 1)

  return {
    r: foregroundRed + (surfaceRed - foregroundRed) * amount,
    g: foregroundGreen + (surfaceGreen - foregroundGreen) * amount,
    b: foregroundBlue + (surfaceBlue - foregroundBlue) * amount,
    a: 1
  }
}

function normalizeWebHost(value) {
  var host = lowerString(value)
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/:].*$/, "")
    .replace(/^www\./, "")
  return /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(host) ? host : ""
}

function normalizeWebPath(value) {
  var path = lowerString(value)
  if (!path || path === "/") return ""
  path = path.replace(/^[^/]*:\/\//, "")
  var slash = path.indexOf("/")
  if (slash >= 0) path = path.slice(slash)
  if (path.charAt(0) !== "/") path = "/" + path
  return path.replace(/\/+$/, "")
}

function initialTitleWebIdentity(value) {
  var raw = lowerString(value)
  var marker = raw.indexOf("_/")
  if (marker <= 0) return null

  var host = normalizeWebHost(raw.slice(0, marker))
  if (!host) return null
  return {
    host: host,
    path: normalizeWebPath(raw.slice(marker + 1))
  }
}

function classWebIdentity(value) {
  var raw = nonEmptyString(value)
  var match = raw.match(
    /^(?:chrome|chromium|google-chrome|brave(?:-browser)?|microsoft-edge|opera|vivaldi(?:-stable)?|helium)-(.+?)-Default$/i
  )
  if (!match) return null

  var identity = match[1]
  var marker = identity.indexOf("__")
  var host = normalizeWebHost(marker >= 0 ? identity.slice(0, marker) : identity)
  if (!host) return null

  return {
    host: host,
    path: marker >= 0
      ? normalizeWebPath(identity.slice(marker + 2).replace(/_/g, "/"))
      : ""
  }
}

function memberWebIdentity(member) {
  member = member && typeof member === "object" ? member : {}

  var fromTitle = initialTitleWebIdentity(member.initialTitle)
  if (fromTitle) return fromTitle

  var candidates = memberIdentityCandidates(member)
  for (var i = 0; i < candidates.length; i++) {
    var fromClass = classWebIdentity(candidates[i])
    if (fromClass) return fromClass
  }
  return null
}

function execWebIdentity(value) {
  var match = nonEmptyString(value).match(/https?:\/\/([a-z0-9.-]+)(\/[^\s"'%]*)?/i)
  if (!match) return null

  var host = normalizeWebHost(match[1])
  if (!host) return null
  return {
    host: host,
    path: normalizeWebPath(match[2] || "")
  }
}

function executableName(value) {
  var raw = nonEmptyString(value)
  if (!raw) return ""

  var match = raw.match(/^(?:"([^"]+)"|'([^']+)'|([^\s]+))/)
  var executable = match ? (match[1] || match[2] || match[3] || "") : ""
  var slash = executable.lastIndexOf("/")
  if (slash >= 0) executable = executable.slice(slash + 1)
  return desktopId(executable)
}

function webIdentityLabel(identity) {
  if (!identity || !identity.host) return ""

  var ignored = {
    app: true,
    com: true,
    dev: true,
    io: true,
    mail: true,
    net: true,
    org: true,
    tv: true,
    web: true,
    www: true
  }
  var labels = identity.host.split(".")
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].length >= 3 && !ignored[labels[i]]) return labels[i]
  }
  return ""
}

function matchDesktopEntry(member, entries) {
  var values = entries && typeof entries.length === "number" ? entries : []
  var candidates = memberIdentityCandidates(member)
  var i
  var j

  for (i = 0; i < candidates.length; i++) {
    var candidateId = desktopId(candidates[i])
    var candidateLower = lowerString(candidates[i])

    for (j = 0; j < values.length; j++) {
      var exactEntry = values[j]
      if (!exactEntry) continue
      if (desktopId(objectString(exactEntry, "id")) === candidateId
          || lowerString(objectString(exactEntry, "startupClass")) === candidateLower) {
        return exactEntry
      }
    }
  }

  var webIdentity = memberWebIdentity(member)
  if (webIdentity) {
    var bestWebEntry = null
    var bestWebScore = -1

    for (i = 0; i < values.length; i++) {
      var webEntry = values[i]
      if (!webEntry) continue
      var entryIdentity = execWebIdentity(objectString(webEntry, "execString"))
      if (!entryIdentity || entryIdentity.host !== webIdentity.host) continue

      var score = 100
      if (webIdentity.path && entryIdentity.path) {
        if (webIdentity.path === entryIdentity.path) score += 30
        else if (webIdentity.path.indexOf(entryIdentity.path) === 0
            || entryIdentity.path.indexOf(webIdentity.path) === 0) score += 20
      }
      if (score > bestWebScore) {
        bestWebScore = score
        bestWebEntry = webEntry
      }
    }

    if (bestWebEntry) return bestWebEntry

    var webLabel = webIdentityLabel(webIdentity)
    if (webLabel) {
      for (i = 0; i < values.length; i++) {
        var labelEntry = values[i]
        if (!labelEntry) continue
        if (desktopId(objectString(labelEntry, "id")) === webLabel
            || compactIdentity(objectString(labelEntry, "name")) === compactIdentity(webLabel)) {
          return labelEntry
        }
      }
    }
  }

  for (i = 0; i < candidates.length; i++) {
    var candidateCompact = compactIdentity(candidates[i])
    var candidateToken = finalIdentityToken(candidates[i])
    if (!candidateCompact) continue

    for (j = 0; j < values.length; j++) {
      var entry = values[j]
      if (!entry) continue

      var id = desktopId(objectString(entry, "id"))
      var startup = compactIdentity(objectString(entry, "startupClass"))
      var name = compactIdentity(objectString(entry, "name"))
      var executable = executableName(objectString(entry, "execString"))

      if (candidateCompact === compactIdentity(id)
          || candidateCompact === startup
          || candidateCompact === name
          || candidateCompact === compactIdentity(executable)
          || (candidateToken && (candidateToken === id || candidateToken === executable))) {
        return entry
      }

      if (id && candidateCompact.indexOf(compactIdentity(id)) === 0) {
        var suffix = candidateCompact.slice(compactIdentity(id).length)
        if (suffix === "manager" || suffix === "machine" || suffix === "vm") return entry
      }
    }
  }

  return null
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
      initialTitle: nonEmptyString(client.initialTitle),
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

function intervalOverlap(firstStart, firstLength, secondStart, secondLength) {
  return Math.min(firstStart + firstLength, secondStart + secondLength)
    - Math.max(firstStart, secondStart)
}

// Reconstruct one axis of the logical tiling from post-gap client rectangles.
// Facing edges share a midpoint, while the outermost tiled edges become 0/1.
function collapsedAxis(clusters, tiledIndexes, positionKey, sizeKey, crossPositionKey, crossSizeKey) {
  if (tiledIndexes.length === 0) return null

  var edges = []
  var groups = unionFind(tiledIndexes.length * 2)
  var i
  var j

  for (i = 0; i < tiledIndexes.length; i++) {
    var cluster = clusters[tiledIndexes[i]]
    var start = cluster[positionKey]
    var end = start + cluster[sizeKey]
    edges.push({
      clusterIndex: tiledIndexes[i],
      localIndex: i,
      start: true,
      value: start,
      crossStart: cluster[crossPositionKey],
      crossLength: cluster[crossSizeKey]
    })
    edges.push({
      clusterIndex: tiledIndexes[i],
      localIndex: i,
      start: false,
      value: end,
      crossStart: cluster[crossPositionKey],
      crossLength: cluster[crossSizeKey]
    })
  }

  // Hyprland gives clients their post-gap rectangles. Equal edges are already
  // one logical split; facing edges separated by a gap become one below.
  for (i = 0; i < edges.length; i++) {
    for (j = i + 1; j < edges.length; j++) {
      if (Math.abs(edges[i].value - edges[j].value) <= EDGE_EPSILON) {
        groups.join(i, j)
      }
    }
  }

  for (i = 0; i < edges.length; i++) {
    var trailing = edges[i]
    if (trailing.start) continue

    var nearestDistance = Infinity
    var nearest = []
    for (j = 0; j < edges.length; j++) {
      var leading = edges[j]
      if (!leading.start || leading.clusterIndex === trailing.clusterIndex) continue
      if (intervalOverlap(
        trailing.crossStart,
        trailing.crossLength,
        leading.crossStart,
        leading.crossLength
      ) <= EDGE_EPSILON) continue

      var distance = leading.value - trailing.value
      if (distance < -EDGE_EPSILON) continue

      if (distance < nearestDistance - EDGE_EPSILON) {
        nearestDistance = distance
        nearest = [j]
      } else if (Math.abs(distance - nearestDistance) <= EDGE_EPSILON) {
        nearest.push(j)
      }
    }

    for (j = 0; j < nearest.length; j++) groups.join(i, nearest[j])
  }

  var minimum = Infinity
  var maximum = -Infinity
  for (i = 0; i < tiledIndexes.length; i++) {
    var tiled = clusters[tiledIndexes[i]]
    minimum = Math.min(minimum, tiled[positionKey])
    maximum = Math.max(maximum, tiled[positionKey] + tiled[sizeKey])
  }

  var span = maximum - minimum
  if (!isFinite(span) || span <= EDGE_EPSILON) return null

  var groupBounds = {}
  for (i = 0; i < edges.length; i++) {
    var groupKey = String(groups.root(i))
    if (!groupBounds[groupKey]) {
      groupBounds[groupKey] = { minimum: edges[i].value, maximum: edges[i].value }
    } else {
      groupBounds[groupKey].minimum = Math.min(groupBounds[groupKey].minimum, edges[i].value)
      groupBounds[groupKey].maximum = Math.max(groupBounds[groupKey].maximum, edges[i].value)
    }
  }

  var edgeTargets = []
  var anchors = []
  for (i = 0; i < edges.length; i++) {
    var bounds = groupBounds[String(groups.root(i))]
    var midpoint = (bounds.minimum + bounds.maximum) / 2
    var target = clamp((midpoint - minimum) / span, 0, 1)
    edgeTargets.push(target)
    anchors.push({ source: edges[i].value, target: target })
  }

  anchors.sort(function (first, second) {
    if (first.source !== second.source) return first.source - second.source
    return first.target - second.target
  })

  function map(value) {
    value = finiteNumber(value, minimum)
    if (value <= anchors[0].source) return anchors[0].target
    if (value >= anchors[anchors.length - 1].source)
      return anchors[anchors.length - 1].target

    for (var anchorIndex = 1; anchorIndex < anchors.length; anchorIndex++) {
      var right = anchors[anchorIndex]
      if (value > right.source) continue

      var left = anchors[anchorIndex - 1]
      var sourceSpan = right.source - left.source
      if (sourceSpan <= EDGE_EPSILON) return right.target
      var progress = (value - left.source) / sourceSpan
      return left.target + (right.target - left.target) * progress
    }

    return anchors[anchors.length - 1].target
  }

  return {
    starts: edgeTargets.filter(function (_, index) { return index % 2 === 0 }),
    ends: edgeTargets.filter(function (_, index) { return index % 2 === 1 }),
    map: map
  }
}

function collapseTiledGeometry(clusters) {
  var tiledIndexes = []
  var i

  for (i = 0; i < clusters.length; i++) {
    if (!clusters[i].floating && !clusters[i].fullscreen) tiledIndexes.push(i)
  }

  var horizontal = collapsedAxis(clusters, tiledIndexes, "x", "width", "y", "height")
  var vertical = collapsedAxis(clusters, tiledIndexes, "y", "height", "x", "width")

  for (i = 0; i < tiledIndexes.length; i++) {
    var cluster = clusters[tiledIndexes[i]]
    if (horizontal) {
      cluster.x = horizontal.starts[i]
      cluster.width = Math.max(0, horizontal.ends[i] - horizontal.starts[i])
    }
    if (vertical) {
      cluster.y = vertical.starts[i]
      cluster.height = Math.max(0, vertical.ends[i] - vertical.starts[i])
    }
  }

  // Floating windows keep their relationship to the tiled layout while the
  // same removed outer reservations and inner gaps are compressed beneath them.
  for (i = 0; i < clusters.length; i++) {
    var floating = clusters[i]
    if (!floating.floating || floating.fullscreen) continue

    if (horizontal) {
      var floatingRight = horizontal.map(floating.x + floating.width)
      floating.x = horizontal.map(floating.x)
      floating.width = Math.max(0, floatingRight - floating.x)
    }
    if (vertical) {
      var floatingBottom = vertical.map(floating.y + floating.height)
      floating.y = vertical.map(floating.y)
      floating.height = Math.max(0, floatingBottom - floating.y)
    }
  }

  for (i = 0; i < clusters.length; i++) {
    var outlined = clusters[i].floating || clusters[i].fullscreen
    clusters[i].outerTop = clusters[i].y <= EDGE_EPSILON
    clusters[i].outerRight = clusters[i].x + clusters[i].width >= 1 - EDGE_EPSILON
    clusters[i].outerBottom = clusters[i].y + clusters[i].height >= 1 - EDGE_EPSILON
    clusters[i].outerLeft = clusters[i].x <= EDGE_EPSILON
    clusters[i].borderTop = outlined || clusters[i].y <= EDGE_EPSILON
    clusters[i].borderRight = true
    clusters[i].borderBottom = true
    clusters[i].borderLeft = outlined || clusters[i].x <= EDGE_EPSILON
  }

  return clusters
}

function publicCluster(cluster) {
  return {
    x: cluster.x,
    y: cluster.y,
    width: cluster.width,
    height: cluster.height,
    floating: cluster.floating,
    fullscreen: cluster.fullscreen,
    outerTop: cluster.outerTop,
    outerRight: cluster.outerRight,
    outerBottom: cluster.outerBottom,
    outerLeft: cluster.outerLeft,
    borderTop: cluster.borderTop,
    borderRight: cluster.borderRight,
    borderBottom: cluster.borderBottom,
    borderLeft: cluster.borderLeft,
    members: cluster.members
  }
}

function evenMaximum(value) {
  var maximum = Math.floor(finiteNumber(value, 2))
  return Math.max(2, maximum - Math.abs(maximum % 2))
}

function nearestEven(value, maximum) {
  var rounded = Math.round(finiteNumber(value, 2) / 2) * 2
  return clamp(rounded, 2, maximum)
}

function integerIconSize(windowWidth, windowHeight, memberCount, maximumSize, spacing, borderAllowance) {
  var count = positiveInteger(memberCount)
  if (count === 0) return 0

  var width = Math.max(0, Math.floor(finiteNumber(windowWidth, 0)))
  var height = Math.max(0, Math.floor(finiteNumber(windowHeight, 0)))
  var maximum = Math.max(0, Math.floor(finiteNumber(maximumSize, 0)))
  var gap = Math.max(0, Math.floor(finiteNumber(spacing, 0)))
  var inset = Math.max(0, Math.floor(finiteNumber(borderAllowance, 0)))
  var availableWidth = Math.max(0, width - inset - gap * Math.max(0, count - 1))
  var availableHeight = Math.max(0, height - inset)

  return Math.max(0, Math.min(
    maximum,
    availableHeight,
    Math.floor(availableWidth / count)
  ))
}

function pixelSnap(value, devicePixelRatio) {
  var ratio = finiteNumber(devicePixelRatio, 1)
  if (ratio <= 0) ratio = 1
  return Math.round(finiteNumber(value, 0) * ratio) / ratio
}

// Omarchy quattro's Style.space() contract is integer-valued. Keep both
// workspace axes even as well so equal halves and 2x2 layouts rasterize exactly.
function integerWorkspaceSize(aspectRatio, maximumWidth, maximumHeight) {
  var aspect = finiteNumber(aspectRatio, FALLBACK_ASPECT_RATIO)
  if (aspect <= 0) aspect = FALLBACK_ASPECT_RATIO

  var widthLimit = evenMaximum(maximumWidth)
  var heightLimit = evenMaximum(maximumHeight)
  var width
  var height

  if (widthLimit / heightLimit > aspect) {
    height = heightLimit
    width = nearestEven(height * aspect, widthLimit)
  } else {
    width = widthLimit
    height = nearestEven(width / aspect, heightLimit)
  }

  return { width: width, height: height }
}

function integerWindowRect(window, workspaceWidth, workspaceHeight) {
  window = window && typeof window === "object" ? window : {}

  var frameWidth = Math.max(0, Math.floor(finiteNumber(workspaceWidth, 0)))
  var frameHeight = Math.max(0, Math.floor(finiteNumber(workspaceHeight, 0)))
  var left = Math.round(clamp(finiteNumber(window.x, 0), 0, 1) * frameWidth)
  var top = Math.round(clamp(finiteNumber(window.y, 0), 0, 1) * frameHeight)
  var right = Math.round(clamp(
    finiteNumber(window.x, 0) + Math.max(0, finiteNumber(window.width, 0)),
    0,
    1
  ) * frameWidth)
  var bottom = Math.round(clamp(
    finiteNumber(window.y, 0) + Math.max(0, finiteNumber(window.height, 0)),
    0,
    1
  ) * frameHeight)

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    right: right,
    bottom: bottom
  }
}

function workspaceAspectRatio(monitor) {
  if (!monitor || !monitor.validGeometry || monitor.height <= 0) return FALLBACK_ASPECT_RATIO
  return monitor.width / monitor.height
}

function workspaceLabel(value) {
  if (isScratchWorkspace(value)) return "S"
  var workspaceId = positiveInteger(value)
  if (workspaceId === 0) return ""
  return workspaceId === 10 ? "0" : String(workspaceId)
}

function eventParts(event, count) {
  var parts = []

  try {
    if (event && typeof event.parse === "function") parts = event.parse(count)
  } catch (error) {}

  if (!parts || parts.length === 0) {
    parts = String(event && event.data !== undefined ? event.data : "").split(",")
  }

  return parts || []
}

function workspaceEventId(event) {
  return positiveInteger(eventParts(event, 2)[0])
}

function scratchEventActive(event) {
  var parts = eventParts(event, 3)
  for (var i = 0; i < parts.length; i++) {
    var part = nonEmptyString(parts[i]).toLowerCase()
    if (part === SCRATCH_WORKSPACE_ID || part === "scratchpad") return true
  }
  return false
}

function activateWorkspace(model, workspaceId, monitorName, scratchState) {
  model = model && typeof model === "object" ? model : {}

  var activeWorkspaceId = positiveInteger(workspaceId)
  var targetMonitorName = nonEmptyString(monitorName)
    || nonEmptyString(model.targetMonitorName)
  var source = Array.isArray(model.workspaces) ? model.workspaces : []
  var fallbackAspectRatio = FALLBACK_ASPECT_RATIO
  var fallbackAspectFound = false
  var workspaces = []
  var activeFound = false
  var scratchActive = scratchState === true || scratchState === 1
  var scratchStateKnown = scratchState === true
    || scratchState === false
    || scratchState === 0
    || scratchState === 1
  var i

  if (!scratchStateKnown) {
    for (i = 0; i < source.length; i++) {
      if (isScratchWorkspace(source[i]) && source[i].active === true) {
        scratchActive = true
        break
      }
    }
  }

  for (i = 0; i < source.length; i++) {
    var aspectWorkspace = source[i]
    if (!aspectWorkspace || typeof aspectWorkspace !== "object") continue

    var candidateAspectRatio = finiteNumber(aspectWorkspace.aspectRatio, 0)
    if (candidateAspectRatio <= 0) continue
    if (!fallbackAspectFound) {
      fallbackAspectRatio = candidateAspectRatio
      fallbackAspectFound = true
    }
    if (nonEmptyString(aspectWorkspace.monitorName) === targetMonitorName) {
      fallbackAspectRatio = candidateAspectRatio
      break
    }
  }

  for (i = 0; i < source.length; i++) {
    var workspace = source[i]
    if (!workspace || typeof workspace !== "object") continue

    var id = workspaceIdentity(workspace)
    if (id === 0) continue

    var windows = Array.isArray(workspace.windows) ? workspace.windows : []
    var scratch = isScratchWorkspace(id)
    var numberedTarget = !scratch && activeWorkspaceId > 0 && id === activeWorkspaceId
    var active = scratch ? scratchActive : (numberedTarget && !scratchActive)
    var workspaceMonitorName = nonEmptyString(workspace.monitorName)
    var aspectRatio = Math.max(
      0.1,
      finiteNumber(workspace.aspectRatio, FALLBACK_ASPECT_RATIO)
    )

    if (windows.length === 0 && !active && !numberedTarget) continue
    if (numberedTarget) activeFound = true

    workspaces.push({
      id: id,
      monitorName: active && targetMonitorName
        ? targetMonitorName
        : workspaceMonitorName,
      active: active,
      scratch: scratch,
      empty: windows.length === 0,
      aspectRatio: aspectRatio,
      windows: windows
    })
  }

  if (activeWorkspaceId > 0 && !activeFound) {
    workspaces.push({
      id: activeWorkspaceId,
      monitorName: targetMonitorName,
      active: !scratchActive,
      scratch: false,
      empty: true,
      aspectRatio: fallbackAspectRatio,
      windows: []
    })
  }

  workspaces.sort(function (first, second) { return compareWorkspaceIds(first.id, second.id) })

  return {
    targetMonitorName: targetMonitorName,
    activeWorkspaceId: activeWorkspaceId,
    workspaces: workspaces
  }
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
      var workspaceId = workspaceIdentity(workspace)
      if (workspaceId === 0) continue

      var monitorWorkspaceId = isScratchWorkspace(workspaceId) ? 0 : workspaceId
      var monitor = monitorForClient(client, monitorWorkspaceId, normalizedMonitors, targetMonitor)
      var key = String(workspaceId)
      if (!buckets[key]) {
        buckets[key] = {
          id: workspaceId,
          scratch: isScratchWorkspace(workspaceId),
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
      scratch: false,
      monitor: targetMonitor,
      entries: []
    }
  }

  if (targetMonitor && targetMonitor.scratchActive && !buckets[SCRATCH_WORKSPACE_ID]) {
    buckets[SCRATCH_WORKSPACE_ID] = {
      id: SCRATCH_WORKSPACE_ID,
      scratch: true,
      monitor: targetMonitor,
      entries: []
    }
  }

  var workspaceKeys = Object.keys(buckets).sort(function (first, second) {
    return compareWorkspaceIds(buckets[first].id, buckets[second].id)
  })

  var workspaces = []
  for (var workspaceIndex = 0; workspaceIndex < workspaceKeys.length; workspaceIndex++) {
    var bucket = buckets[workspaceKeys[workspaceIndex]]
    var clusters = collapseTiledGeometry(clusterEntries(bucket.entries)).sort(drawingOrder)
    var windows = []

    for (var clusterIndex = 0; clusterIndex < clusters.length; clusterIndex++) {
      windows.push(publicCluster(clusters[clusterIndex]))
    }

    workspaces.push({
      id: bucket.id,
      monitorName: bucket.monitor ? bucket.monitor.name : "",
      active: bucket.scratch
        ? Boolean(bucket.monitor && bucket.monitor.scratchActive)
        : Boolean(targetMonitor && !targetMonitor.scratchActive && bucket.id === activeWorkspaceId),
      scratch: bucket.scratch,
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
    activateWorkspace: activateWorkspace,
    appGlyph: appGlyph,
    buildWorkspaceModel: buildWorkspaceModel,
    fallbackIconTint: fallbackIconTint,
    genericAppGlyph: genericAppGlyph,
    integerIconSize: integerIconSize,
    integerWindowRect: integerWindowRect,
    integerWorkspaceSize: integerWorkspaceSize,
    matchDesktopEntry: matchDesktopEntry,
    memberWebIdentity: memberWebIdentity,
    normalizeCorner: normalizeCorner,
    parseDuration: parseDuration,
    pixelSnap: pixelSnap,
    scratchEventActive: scratchEventActive,
    workspaceEventId: workspaceEventId,
    workspaceLabel: workspaceLabel
  }
}
