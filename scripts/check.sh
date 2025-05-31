#!/bin/bash
set -e

echo "Running format check (rustfmt)..."
cargo fmt -- --check

echo "Running linter (clippy)..."
cargo clippy -- -D warnings # Fail on warnings

echo "Checks complete."
