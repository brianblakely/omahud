# OmaHUD

OmaHUD briefly displays a compact diagram of your populated Hyprland workspaces when you switch workspaces. Each workspace shows its number, window layout, and application icons. The diagram appears in the lower-left corner by default.

## Install

Review the source at [github.com/brianblakely/omahud](https://github.com/brianblakely/omahud), then add the plugin:

```bash
omarchy plugin add https://github.com/brianblakely/omahud.git
```

Accept the prompt to enable OmaHUD during installation.

## Show OmaHUD

Display OmaHUD on demand:

```bash
omarchy-shell shell summon b.omahud
```

Hide it immediately:

```bash
omarchy-shell shell hide b.omahud
```

## Configuration

Choose any screen corner:

```bash
omarchy-shell b.omahud corner bottom-left
omarchy-shell b.omahud corner bottom-right
omarchy-shell b.omahud corner top-left
omarchy-shell b.omahud corner top-right
```

Set how long OmaHUD remains visible, in milliseconds:

```bash
omarchy-shell b.omahud duration 1500
```

The default is `1500`; accepted values range from `250` to `10000`.

## Optional shortcut

Global keybindings remain user-owned. Add this to your Hyprland bindings if desired:

```lua
o.bind("SUPER + ALT + H", "Show OmaHUD", "omarchy-shell shell summon b.omahud")
```

## Update

```bash
omarchy plugin update b.omahud
```
