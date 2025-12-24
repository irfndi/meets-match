# syntax=docker/dockerfile:1

FROM golang:1.25.5-alpine AS builder

WORKDIR /app

# Install build dependencies including buf for protobuf generation
RUN apk add --no-cache git make curl && \
    curl -sSL "https://github.com/bufbuild/buf/releases/download/v1.47.2/buf-Linux-x86_64" -o /usr/local/bin/buf && \
    chmod +x /usr/local/bin/buf

# Copy the entire project to handle local replacements
COPY . .

# Generate protobuf files
RUN buf generate

# Build the API
WORKDIR /app/services/api
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/api ./cmd/api

# Final Stage
FROM alpine:3.19

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

COPY --from=builder /app/bin/api /app/api

EXPOSE 8080 50051

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD curl -f http://127.0.0.1:8080/health || exit 1

CMD ["/app/api"]
