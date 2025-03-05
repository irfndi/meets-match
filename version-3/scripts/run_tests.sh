#!/bin/bash
uv venv .venv --python 3.10
source .venv/bin/activate
uv pip install -r requirements-dev.txt
python -m pytest tests/ --cov=src --cov-report=term-missing
