# Implementation Plan: Refactor from Bun to pnpm and Vitest

## Background and Motivation
The user wants to migrate the project from Bun to pnpm for package management and Vitest for testing. This change aims to improve compatibility with Cloudflare Workers and leverage Vitest's features. Additionally, all documentation needs to be updated to reflect these changes, and a test coverage threshold of >95% must be enforced.

## Branch Name
`feat/refactor-pnpm-vitest`

## Key Challenges and Analysis
- Ensuring all Bun-specific configurations and scripts are correctly replaced with pnpm and Vitest equivalents.
- Updating dependencies in `package.json` and potentially `wrangler.toml`.
- Modifying CI/CD workflows (GitHub Actions) to use pnpm and Vitest.
- Ensuring tests run correctly with Vitest and achieve >95% coverage.
- Thoroughly updating all documentation to remove Bun references and add pnpm/Vitest information.
- Correcting inconsistencies in documentation:
    - `docs/DEVELOPMENT.MD`: `config.py` in project structure, `.dev.vars` vs `.env.sample`/`.env.test` consistency.
    - `docs/FEATURE.MD`: Python code snippet to be TypeScript, 'Bolean' typo.
    - `docs/TECH.MD`: General updates for pnpm/Vitest.

## High-level Task Breakdown
1.  **Setup pnpm and Vitest:**
    *   Success Criteria: `pnpm` is installed globally or available in the environment. `Vitest` and necessary plugins (e.g., for coverage) are added as dev dependencies using `pnpm`. Basic Vitest configuration is in place.
2.  **Migrate Dependencies and Scripts:**
    *   Remove Bun-specific files (e.g., `bun.lockb`, `bunfig.toml` if present).
    *   Update `package.json` scripts from `bun ...` to `pnpm ...` (e.g., `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm dev`, `pnpm deploy`).
    *   Run `pnpm install` to generate `pnpm-lock.yaml` and install dependencies.
    *   Success Criteria: Project dependencies are managed by `pnpm`, `pnpm-lock.yaml` is generated, and scripts in `package.json` are updated and executable with `pnpm`.
3.  **Migrate Tests to Vitest:**
    *   Update test files if necessary for Vitest compatibility (e.g., import paths, global assertions if any were Bun-specific).
    *   Configure Vitest (`vitest.config.ts` or in `package.json`) for coverage reporting (e.g., using `@vitest/coverage-v8`) and set the threshold to >95%.
    *   Ensure tests can be run via `pnpm test` (or `pnpm test:cov`).
    *   Success Criteria: All existing tests pass when run with Vitest. Test coverage report shows >95%.
4.  **Update Documentation:**
    *   **`docs/DEVELOPMENT.MD`:**
        *   Replace Bun references with pnpm/Vitest for prerequisites, installation, running locally, development tools, testing, and CI/CD.
        *   Verify and correct the `Project Structure` section, particularly the `config.py` entry (likely remove or clarify if it's a placeholder for a future TS config).
        *   Ensure consistency regarding `.dev.vars` and any `.env.sample`/`.env.test` files.
    *   **`docs/FEATURE.MD`:**
        *   Convert the Python `validate_profile` code snippet to TypeScript.
        *   Correct 'Bolean' to 'boolean'.
    *   **`docs/TECH.MD`:**
        *   Update Core Technologies, Key Libraries, Development Environment, CI/CD, Testing Framework, and Code Quality tools sections to reflect pnpm and Vitest.
    *   **`README.md` (if it exists and contains relevant setup/build/test instructions):**
        *   Update any Bun-related commands to pnpm/Vitest.
    *   Success Criteria: All documentation accurately reflects the new pnpm/Vitest project setup and addresses the identified inconsistencies.
5.  **Update CI/CD Workflow:**
    *   Modify GitHub Actions workflow files (e.g., in `.github/workflows/`) to use pnpm for installing dependencies and running tests with Vitest.
    *   Ensure the CI pipeline enforces the >95% test coverage.
    *   Success Criteria: CI pipeline runs successfully with the new setup and enforces coverage.
6.  **Final Review and Cleanup:**
    *   Review all changes for consistency and correctness.
    *   Remove any unused Bun-related files or configurations.
    *   Success Criteria: Project is fully migrated, clean, and all requirements are met.

## Project Status Board
- [ ] Setup pnpm and Vitest
- [ ] Migrate Dependencies and Scripts
- [ ] Migrate Tests to Vitest
- [ ] Update Documentation
    - [ ] `docs/DEVELOPMENT.MD`
    - [ ] `docs/FEATURE.MD` (Review for any indirect impacts)
    - [ ] `docs/TECH.MD`
    - [ ] `README.md` (If it exists and has relevant info)
- [ ] Update CI/CD Workflow
- [ ] Final Review and Cleanup

## Executor's Feedback or Assistance Requests
- Awaiting specific instructions to start execution.

## Lessons Learned
- (To be filled as the task progresses) 