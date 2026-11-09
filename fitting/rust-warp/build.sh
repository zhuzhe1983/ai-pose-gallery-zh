#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
rustc --target wasm32-unknown-unknown --crate-type cdylib \
  -C opt-level=z -C lto=fat -C panic=abort -C strip=symbols \
  src/lib.rs -o ../fit_warp.wasm
ls -lh ../fit_warp.wasm
