#!/bin/bash
set -e

echo "Running tests for Go and TypeScript services..."

# Run Go tests
echo "Running Go tests..."
go test ./... -v
echo "Go tests completed successfully."

# Run TypeScript API tests
echo "Running TypeScript API tests..."
cd web/api
if [ -f "package.json" ]; then
    bun install
    if grep -q '"test"' package.json; then
        echo "Running TypeScript API test suite..."
        bun run test
        echo "TypeScript API tests completed successfully."
    else
        echo "Warning: No test script found in web/api package.json - skipping API tests"
    fi
else
    echo "Warning: No package.json found in web/api - skipping API tests"
fi
cd ../..

# Run React frontend tests
echo "Running React frontend tests..."
cd web/frontend
if [ -f "package.json" ]; then
    bun install
    if grep -q '"test"' package.json; then
        echo "Running React frontend test suite..."
        bun run test
        echo "React frontend tests completed successfully."
    else
        echo "Warning: No test script found in web/frontend package.json - skipping frontend tests"
    fi
else
    echo "Warning: No package.json found in web/frontend - skipping frontend tests"
fi
cd ../..

echo "All tests complete."
