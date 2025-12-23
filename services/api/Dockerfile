# syntax=docker/dockerfile:1

FROM golang:1.25.5-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git make

# Copy the entire project to handle local replacements
COPY . .

# Build the API
WORKDIR /app/services/api
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/api ./cmd/api

# Final Stage
FROM alpine:3.19

WORKDIR /app

COPY --from=builder /app/bin/api /app/api
# Copy .env if needed, but usually passed via docker-compose

EXPOSE 8080 50051

CMD ["/app/api"]
