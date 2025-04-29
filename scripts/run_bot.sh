#!/bin/bash

# Change to the project root directory
cd "$(dirname "$0")"

# Run tests
python -m pytest tests/

# Check if tests passed
if [ $? -eq 0 ]; then
    echo "All tests passed. Starting the bot..."
    python -m bot.main
else
    echo "Tests failed. Please fix the issues before running the bot."
    exit 1
fi