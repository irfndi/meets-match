#!/bin/bash
set -e

echo "Running format and lint checks for Go and TypeScript..."

# Check Go formatting and linting
echo "Running Go format check..."
if ! gofmt -l . | grep -q .; then
    echo "Go formatting check passed."
else
    echo "Go formatting issues found:"
    gofmt -l .
    exit 1
fi

echo "Running Go linting (go vet)..."
go vet ./...
echo "Go linting passed."

# Check TypeScript API formatting and linting
echo "Checking TypeScript API..."
cd web/api
if [ -f "package.json" ]; then
    bun install
    if [ -f "oxlint.json" ]; then
        echo "Running TypeScript API linting..."
        bun run lint
    fi
    if [ -f "tsconfig.json" ]; then
        echo "Running TypeScript API type checking..."
        bun run typecheck
    fi
else
    echo "Warning: No package.json found in web/api - skipping API checks"
fi
cd ../..

# Check React frontend formatting and linting
echo "Checking React frontend..."
cd web/frontend
if [ -f "package.json" ]; then
    bun install
    if [ -f "oxlint.json" ]; then
        echo "Running React frontend linting..."
        bun run lint
    fi
    if [ -f "tsconfig.json" ]; then
        echo "Running React frontend type checking..."
        bun run type-check
    fi
else
    echo "Warning: No package.json found in web/frontend - skipping frontend checks"
fi
cd ../..

echo "All checks complete."
