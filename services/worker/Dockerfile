# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files for dependency caching
COPY services/worker/go.mod services/worker/go.sum* ./services/worker/
COPY packages/contracts/go.mod packages/contracts/go.sum* ./packages/contracts/

# Copy the contracts package (needed for proto imports)
COPY packages/contracts/ ./packages/contracts/

# Download dependencies
WORKDIR /app/services/worker
RUN go mod download

# Copy source code
COPY services/worker/ .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /worker ./cmd/worker

# Runtime stage
FROM alpine:3.21

WORKDIR /app

# Add CA certificates for HTTPS
RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /worker /app/worker

# Create non-root user
RUN adduser -D -g '' appuser
USER appuser

# Run the worker
CMD ["/app/worker"]
