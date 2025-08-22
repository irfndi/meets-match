#!/bin/bash

# Coverage test script for Go bot service
# This script runs all tests and generates coverage reports

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
COVERAGE_THRESHOLD=60
COVERAGE_FILE="coverage.out"
COVERAGE_HTML="coverage.html"
COVERAGE_JSON="coverage.json"

echo -e "${GREEN}Starting test coverage analysis...${NC}"

# Clean previous coverage files
rm -f $COVERAGE_FILE $COVERAGE_HTML $COVERAGE_JSON

# Create test directories if they don't exist
mkdir -p test/reports

# Run tests with coverage for all packages
echo -e "${YELLOW}Running tests with coverage...${NC}"
go test -v -race -coverprofile=$COVERAGE_FILE -covermode=atomic ./...

# Check if coverage file was generated
if [ ! -f $COVERAGE_FILE ]; then
    echo -e "${RED}Error: Coverage file not generated${NC}"
    exit 1
fi

# Generate HTML coverage report
echo -e "${YELLOW}Generating HTML coverage report...${NC}"
go tool cover -html=$COVERAGE_FILE -o $COVERAGE_HTML

# Generate coverage summary
echo -e "${YELLOW}Generating coverage summary...${NC}"
go tool cover -func=$COVERAGE_FILE > test/reports/coverage_summary.txt

# Calculate total coverage percentage
TOTAL_COVERAGE=$(go tool cover -func=$COVERAGE_FILE | grep total | awk '{print $3}' | sed 's/%//')

echo -e "${GREEN}Coverage Summary:${NC}"
echo "=========================================="
cat test/reports/coverage_summary.txt
echo "=========================================="
echo -e "${GREEN}Total Coverage: ${TOTAL_COVERAGE}%${NC}"

# Check if coverage meets threshold
if (( $(echo "$TOTAL_COVERAGE >= $COVERAGE_THRESHOLD" | bc -l) )); then
    echo -e "${GREEN}✅ Coverage threshold met! (${TOTAL_COVERAGE}% >= ${COVERAGE_THRESHOLD}%)${NC}"
    echo -e "${GREEN}HTML report generated: $COVERAGE_HTML${NC}"
    exit 0
else
    echo -e "${RED}❌ Coverage threshold not met! (${TOTAL_COVERAGE}% < ${COVERAGE_THRESHOLD}%)${NC}"
    echo -e "${RED}Please add more tests to improve coverage.${NC}"
    echo -e "${YELLOW}HTML report generated: $COVERAGE_HTML${NC}"
    exit 1
fi