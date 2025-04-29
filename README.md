# Telegram Bot Project

[![CI](https://github.com/irfndi/meetsmatch-py/actions/workflows/ci.yml/badge.svg)](https://github.com/irfndi/meetsmatch-py/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/irfndi/meetsmatch-py/branch/main/graph/badge.svg)](https://codecov.io/gh/irfndi/meetsmatch-py)

This repository contains the documentation for the Telegram bot project. The documentation is split into different files for better organization and clarity.

## Project Structure

This project is designed with a clean and organized folder structure to promote maintainability and scalability:

- `src/bot/` - Contains the Telegram bot handlers and application logic
- `src/models/` - Database models and schemas
- `src/services/` - Business logic and service layer
- `src/utils/` - Helper functions and utilities
- `tests/` - Unit and integration tests

## Documentation Structure

* **[TECH.md](_docs_/TECH.MD):** Technical details about technologies, libraries, and tools
* **[DEVELOPMENT.md](_docs_/DEVELOPMENT.MD):** Development process, coding conventions, and setup instructions
* **[FEATURE.md](_docs_/FEATURE.MD):** Features of the bot including commands and their descriptions

## Getting Started

To understand the technical aspects of the bot, start with [_docs_/TECH.MD](_docs_/TECH.MD). If you are a developer contributing to the project, refer to the [_docs_/DEVELOPMENT.MD](_docs_/DEVELOPMENT.MD) guide.

## Code Coverage

We use Codecov to track our test coverage. We maintain >95% coverage as required by project standards.

## Roadmap & Future Work

This project uses [GitHub Issues](https://github.com/irfndi/meetsmatch-py/issues) to track planned features, enhancements, and bug fixes. Please refer to the issue tracker for a detailed view of ongoing and future work.

Key areas currently under focus include:

- Finalizing Cloudflare Worker deployment configuration (`wrangler.toml`).
- Implementing comprehensive mocking for Cloudflare services in tests.
- Completing the code migration from previous infrastructure (PostgreSQL, Supabase, etc.) to Cloudflare.
- Adding integration tests for Cloudflare services.

Feel free to open a new issue to discuss potential features or report bugs.
