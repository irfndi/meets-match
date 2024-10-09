import pytest
import os
import sys
import shutil

# Clear cache before running tests
cache_dir = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'cache')  # Adjust the cache directory path as needed
if os.path.exists(cache_dir):
    shutil.rmtree(cache_dir)
    print(f"Cleared cache directory: {cache_dir}")
else:
    print(f"No cache directory found at: {cache_dir}, skipping cleanup.")

# Add the project root directory to the Python path
project_root = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, project_root)

if __name__ == "__main__":
    # Run tests with coverage
    pytest.main(["-v", "tests", "--cov=bot", "--cov-report=term-missing"])