# OmaHUD

Flashes a discreet Hyprland workspace indicator when you switch workspaces. It's designed for people who hide their Omarchy bar most of the time, and would like help navigating their workspaces.

## Install

```bash
omarchy plugin add https://github.com/brianblakely/omahud.git
```

## Configuration

Choose where OmaHUD is positioned:

```bash
omarchy-shell b.omahud corner bottom-left
omarchy-shell b.omahud corner bottom-right
omarchy-shell b.omahud corner top-left
omarchy-shell b.omahud corner top-right
```

Set how long OmaHUD remains visible, in milliseconds:

```bash
omarchy-shell b.omahud duration 2000
```

The default is `2000`; accepted values range from `250` to `10000`.

## Shortcut

```lua
o.bind("SUPER + ALT + H", "Show OmaHUD", "omarchy-shell shell summon b.omahud")
```

## Update

```bash
omarchy plugin update b.omahud
```
