#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "Building Rust Wasm worker..."
wasm-pack build --target bundler -d worker

echo "Build complete. Output in /worker directory."
