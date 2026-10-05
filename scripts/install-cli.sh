#!/bin/sh
# Add or remove the `xump` command-line entry point for an installed XuMP
# desktop app on macOS and Linux.
#
# Usage:
#   install-cli.sh install [--target <app-executable>] [--force]
#   install-cli.sh uninstall [--target <app-executable>] [--force]
#
# The script locates the app executable automatically when it ships inside the
# installation; pass --target to override (e.g. for an AppImage):
#
#   macOS (bundled with the .app):
#     sudo /Applications/XuMP.app/Contents/Resources/scripts/install-cli.sh install
#
#   Linux tar.gz (bundled next to the `xump` binary):
#     ./XuMP-linux-*/scripts/install-cli.sh install
#
#   Linux AppImage:
#     ./install-cli.sh install --target ~/bin/XuMP-0.1.1.AppImage
#
# Platform notes:
#   - Linux packages (deb/rpm/pacman/snap) already expose `xump` on PATH via
#     /usr/bin/xump; this script reports that and does nothing.
#   - Windows users should tick "Add XuMP to PATH" in the NSIS installer.

set -eu

CMD="${1:-}"
case "$CMD" in
  install | uninstall) shift ;;
  -h | --help | '')
    sed -n '2,30p' "$0" | sed 's/^#\{1,\} \{0,1\}//'
    exit 0
    ;;
  *)
    echo "Usage: $0 {install|uninstall} [--target <app-executable>] [--force]" >&2
    exit 2
    ;;
esac

TARGET=""
FORCE=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      [ "$#" -ge 2 ] || { echo "--target requires a value" >&2; exit 2; }
      TARGET="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

log() {
  echo "install-cli: $*"
}

fail() {
  echo "install-cli: error: $*" >&2
  exit 1
}

# Resolve a path to a canonical absolute path (resolving "." and "..") so
# comparisons against readlink(1) output are stable. The parent directory
# must exist.
canonicalize() {
  target_dir=$(CDPATH= cd -P "$(dirname "$1")" 2>/dev/null && pwd) ||
    fail "target directory does not exist: $1"
  printf '%s/%s\n' "$target_dir" "$(basename "$1")"
}

# Run a command with sudo when the destination is not writable and we are not
# already root. Used for /usr/local/bin on macOS and system-wide installs.
# For directories that do not exist yet, the nearest existing ancestor decides
# so that user-level dirs under \$HOME are never created via sudo.
writable_path() {
  check_dir="$1"
  while [ ! -e "$check_dir" ]; do
    check_dir=$(dirname "$check_dir")
  done
  [ -w "$check_dir" ]
}

maybe_sudo() {
  if writable_path "$DEST_DIR" || [ "$(id -u)" = "0" ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    fail "no write access to $DEST_DIR; rerun as root or install sudo"
  fi
}

# Locate the app executable relative to this script when no --target is given.
resolve_target() {
  if [ -n "$TARGET" ]; then
    [ -e "$TARGET" ] || fail "target does not exist: $TARGET"
    TARGET=$(canonicalize "$TARGET")
    return 0
  fi

  script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd)

  # macOS: <Name>.app/Contents/Resources/scripts/install-cli.sh
  macos_dir="$script_dir/../../MacOS"
  if [ -d "$macos_dir" ]; then
    bundle_dir=$(dirname "$(dirname "$script_dir")")
    bundle_bin="$macos_dir/$(basename "$bundle_dir" .app)"
    if [ -x "$bundle_bin" ]; then
      TARGET=$(canonicalize "$bundle_bin")
      return 0
    fi
    for candidate in "$macos_dir/"*; do
      if [ -x "$candidate" ] && [ ! -d "$candidate" ]; then
        TARGET=$(canonicalize "$candidate")
        return 0
      fi
    done
    fail "found app bundle but no executable in $macos_dir; pass --target"
  fi

  # Linux portable layout: <root>/scripts/install-cli.sh next to <root>/xump
  sibling="$script_dir/../xump"
  if [ -x "$sibling" ]; then
    TARGET=$(canonicalize "$sibling")
    return 0
  fi

  # System packages already expose `xump` on PATH.
  if command -v xump >/dev/null 2>&1; then
    log "'xump' is already on PATH at $(command -v xump); nothing to do"
    exit 0
  fi

  fail "could not locate the XuMP executable; pass --target <path>"
}

resolve_target

case "$(uname -s)" in
  Darwin) DEST_DIR="/usr/local/bin" ;;
  *)
    DEST_DIR="${XUMP_BIN_DIR:-$HOME/.local/bin}"
    ;;
esac

LINK="$DEST_DIR/xump"

case "$CMD" in
  install)
    if [ -L "$LINK" ] && [ "$(readlink "$LINK")" = "$TARGET" ]; then
      log "already installed: $LINK -> $TARGET"
      exit 0
    fi
    if [ -L "$LINK" ] || [ -e "$LINK" ]; then
      if [ "$FORCE" != "1" ]; then
        if [ -L "$LINK" ]; then
          fail "$LINK already points to $(readlink "$LINK"); use --force to replace it"
        fi
        fail "$LINK already exists and is not a symlink; use --force to replace it"
      fi
    fi
    if [ ! -d "$DEST_DIR" ]; then
      log "creating $DEST_DIR"
      maybe_sudo mkdir -p "$DEST_DIR"
    fi
    maybe_sudo ln -sfn "$TARGET" "$LINK"
    log "installed $LINK -> $TARGET"
    case ":$PATH:" in
      *":$DEST_DIR:"*) ;;
      *) log "note: $DEST_DIR is not on your PATH; add 'export PATH=\"$DEST_DIR:\$PATH\"' to your shell profile" ;;
    esac
    ;;
  uninstall)
    if [ -L "$LINK" ] && { [ "$(readlink "$LINK")" = "$TARGET" ] || [ "$FORCE" = "1" ]; }; then
      maybe_sudo rm -f "$LINK"
      log "removed $LINK"
    else
      log "no $LINK symlink pointing at $TARGET; nothing to do"
    fi
    ;;
esac
