#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXIT_CODE=0

print_ok() {
  printf '[ok] %s\n' "$1"
}

print_warn() {
  printf '[warn] %s\n' "$1"
}

print_fail() {
  printf '[fail] %s\n' "$1"
  EXIT_CODE=1
}

print_step() {
  printf '\n== %s ==\n' "$1"
}

print_step "macOS compatibility check"

if [[ "$(uname -s)" != "Darwin" ]]; then
  print_warn "This script is mainly for macOS. Current OS: $(uname -s)"
else
  print_ok "Running on macOS"
fi

cd "$ROOT_DIR"

print_step "system tools"

if command -v node >/dev/null 2>&1; then
  print_ok "Node.js found: $(node -v)"
else
  print_fail "Node.js is not installed. Install Node.js, then run npm install."
fi

if command -v npm >/dev/null 2>&1; then
  print_ok "npm found: $(npm -v)"
else
  print_fail "npm is not installed. Install Node.js, then run npm install."
fi

if command -v xcodebuild >/dev/null 2>&1; then
  if xcodebuild -license check >/dev/null 2>&1; then
    print_ok "Xcode license already accepted"
  else
    print_warn "Xcode license is not accepted yet. WASM builds and some git tooling may fail until you run: sudo xcodebuild -license"
  fi
else
  print_warn "xcodebuild not found. This only matters if you plan to build native/WASM tooling locally."
fi

print_step "repo files"

while IFS= read -r build_script; do
  if [[ -x "$build_script" ]]; then
    print_ok "Executable: ${build_script#$ROOT_DIR/}"
  else
    chmod +x "$build_script"
    print_warn "Added execute permission: ${build_script#$ROOT_DIR/}"
  fi
done < <(find "$ROOT_DIR/wasm" -mindepth 2 -maxdepth 2 -name build.sh | sort)

print_step "node_modules"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  print_warn "node_modules is missing. Run npm install."
else
  if find "$ROOT_DIR/node_modules/.bin" -maxdepth 1 -type f >/dev/null 2>&1; then
    while IFS= read -r bin_file; do
      if [[ ! -x "$bin_file" ]]; then
        chmod +x "$bin_file"
        print_warn "Added execute permission: ${bin_file#$ROOT_DIR/}"
      fi
    done < <(find "$ROOT_DIR/node_modules/.bin" -maxdepth 1 -type f | sort)
  fi

  if find "$ROOT_DIR/node_modules/@esbuild" -maxdepth 1 -type d -name 'win32-*' | grep -q .; then
    print_fail "Windows esbuild package detected in node_modules. Delete node_modules and reinstall on this Mac."
  fi

  if find "$ROOT_DIR/node_modules/@rollup" -maxdepth 1 -type d -name 'rollup-win32-*' | grep -q .; then
    print_fail "Windows Rollup package detected in node_modules. Delete node_modules and reinstall on this Mac."
  fi

  if find "$ROOT_DIR/node_modules/@esbuild" -maxdepth 1 -type d -name 'darwin-*' | grep -q .; then
    print_ok "macOS esbuild package present"
  fi

  if find "$ROOT_DIR/node_modules/@rollup" -maxdepth 1 -type d -name 'rollup-darwin-*' | grep -q .; then
    print_ok "macOS Rollup package present"
  fi
fi

print_step "next steps"

if [[ $EXIT_CODE -ne 0 ]]; then
  cat <<'EOF'
This repo still needs a Mac-local JS dependency install.

Recommended fix:
  1. Install Node.js if it is missing.
  2. Remove the copied Windows node_modules folder.
  3. Run: npm install
  4. Run: npm run build
EOF
else
  cat <<'EOF'
Basic macOS checks passed.

Recommended verification:
  1. Run: npm install
  2. Run: npm run build
EOF
fi

exit "$EXIT_CODE"
