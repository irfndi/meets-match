# MeetMatch Development Guide

## Environment Setup

1. Install Python 3.10:
```bash
pyenv install 3.10.13
pyenv local 3.10.13
```

2. Create UV virtual environment:
```bash
uv venv .venv
source .venv/bin/activate
```

3. Install dependencies:
```bash
uv pip install -r requirements.txt
```

## Development Workflow
- Use `uv pip compile` for dependency updates
- Run `uv pip check` for environment verification
