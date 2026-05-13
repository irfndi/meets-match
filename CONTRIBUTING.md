# MeetMatch Development Guide

## Environment Setup

1. **Install Go 1.25+**:
   ```bash
   # macOS
   brew install go
   # Linux
   wget https://go.dev/dl/go1.25.linux-amd64.tar.gz
   sudo tar -C /usr/local -xzf go1.25.linux-amd64.tar.gz
   ```

2. **Install Bun**:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

3. **Install buf**:
   ```bash
   brew install bufbuild/buf/buf
   ```

4. **Generate protobufs**:
   ```bash
   buf generate
   ```

## Development Workflow

- Go code in `services/api/` and `services/worker/` uses `go mod` for dependencies
- TypeScript code in `services/bot/` uses Bun for runtime and package management
- Protobuf contracts in `packages/contracts/` are shared across services
- Run `make ci` before pushing to verify lint, format, security, tests, and build
- Use `make lint` for linting, `make format` for formatting, `make test` for tests

### Adding dependencies

```bash
# Go
cd services/api && go get <package>

# TypeScript
cd services/bot && bun add <package>
```

### Updating protobuf contracts

1. Edit `.proto` files in `packages/contracts/proto/`
2. Run `buf generate`
3. Regenerated code goes to `packages/contracts/gen/`

## Testing

```bash
# Go API tests
cd services/api && go test ./...

# TypeScript Bot tests
cd services/bot && bun run test

# All tests
make test
```
