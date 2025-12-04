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
FROM alpine:3.19

WORKDIR /app

# Install OpenSSL, bash, and curl for certificate generation and health checks
RUN apk add --no-cache openssl bash curl ca-certificates

# Copy CA certificates from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy binary from builder
COPY --from=builder /build/context-service .

# Copy certificate generation script
COPY generate-service-cert.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/generate-service-cert.sh

# Expose port
EXPOSE 8005

# Generate certificates and run service
CMD ["/bin/bash", "-c", "generate-service-cert.sh aicos-context-service && ./context-service --tls-cert /app/certs/aicos-context-service.crt --tls-key /app/certs/aicos-context-service.key"]
