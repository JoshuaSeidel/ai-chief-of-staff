FROM golang:1.23-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies with retry and verbose output
RUN go env -w GO111MODULE=on && \
    go env -w GOPROXY=https://proxy.golang.org,direct && \
    go mod download -x

# Copy source code
COPY main.go ./

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o context-service main.go

# Final stage
FROM scratch

WORKDIR /app

# Copy CA certificates from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy binary from builder
COPY --from=builder /build/context-service .

# Expose port
EXPOSE 8005

# Run
CMD ["./context-service"]
