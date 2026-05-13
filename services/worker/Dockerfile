# Build stage
FROM golang:1.25-alpine@sha256:8d22e29d960bc50cd025d93d5b7c7d220b1ee9aa7a239b3c8f55a57e987e8d45 AS builder

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
FROM alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d

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
