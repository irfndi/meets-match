# MeetMatch Bot Testing

This directory contains tests for the MeetMatch Telegram bot application.

## Testing Approach

We use a comprehensive mocking strategy to test the application without requiring external dependencies such as Telegram API, Supabase, or Redis.

### Mock Modules

The `tests/mocks/` directory contains mock implementations of various components:

- `config.py`: Mock settings and configuration
- `telegram.py`: Mock Telegram bot objects (Update, Context, Bot, etc.)
- `services.py`: Mock service functions
- `models.py`: Mock data models
- `utils.py`: Mock utility functions
- `application.py`: Mock BotApplication for standalone testing

### Test Configuration

The `conftest.py` file sets up the test environment:

- Configures environment variables
- Sets up module mocking
- Provides fixtures for common test objects

### Test Types

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test interactions between components
3. **Mock Tests**: Test using fully mocked implementations

## Running Tests

Run all tests:

```bash
python -m pytest
```

Run specific test files:

```bash
python -m pytest tests/test_application_mock.py
```

Run with verbose output:

```bash
python -m pytest -v
```

## Test Coverage

To generate test coverage reports:

```bash
python -m pytest --cov=src
```

## CI/CD Pipeline

We use GitHub Actions with:
- Parallel Python version testing (3.10, 3.11)
- Automated coverage reporting
- Codecov integration
- Quality gates (80% coverage minimum)

![Test Coverage Badge](https://codecov.io/gh/yourusername/meetsmatch-py/branch/main/graph/badge.svg)

## Adding New Tests

When adding new tests:

1. Follow the naming convention: `test_*.py` for test files and `test_*` for test functions
2. Use the appropriate fixtures from `conftest.py`
3. Mock external dependencies
4. Use `pytest.mark.asyncio` for async tests
5. Add appropriate assertions

## Troubleshooting

If you encounter issues with imports or module mocking:

1. Ensure `PYTHONPATH` includes the project root
2. Check that the mock modules match the real module structure
3. Verify environment variables are set correctly
