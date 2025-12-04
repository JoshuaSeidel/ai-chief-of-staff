#!/bin/bash
# ==============================================================================
# Auto-generate self-signed TLS certificate for a microservice
# ==============================================================================
# This script is run inside each container at startup to ensure TLS certs exist
# Usage: ./generate-service-cert.sh <service-name>
# Example: ./generate-service-cert.sh aicos-integrations
# ==============================================================================

set -e

SERVICE_NAME="${1:-aicos-service}"
CERT_DIR="/app/certs"
CA_CERT="$CERT_DIR/ca.crt"
CA_KEY="$CERT_DIR/ca.key"
SERVICE_CERT="$CERT_DIR/${SERVICE_NAME}.crt"
SERVICE_KEY="$CERT_DIR/${SERVICE_NAME}.key"

# Create certs directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Generate CA certificate if it doesn't exist (shared across all services via volume)
if [ ! -f "$CA_CERT" ] || [ ! -f "$CA_KEY" ]; then
    echo "🔐 Generating CA certificate..."
    openssl genrsa -out "$CA_KEY" 4096 2>/dev/null
    openssl req -new -x509 -days 3650 -key "$CA_KEY" -out "$CA_CERT" \
        -subj "/C=US/ST=State/L=City/O=AI Chief of Staff/OU=Development/CN=AICOS CA" \
        2>/dev/null
    chmod 600 "$CA_KEY"
    chmod 644 "$CA_CERT"
    echo "✅ CA certificate created"
else
    echo "✅ CA certificate already exists"
fi

# Generate service certificate if it doesn't exist
if [ ! -f "$SERVICE_CERT" ] || [ ! -f "$SERVICE_KEY" ]; then
    echo "🔐 Generating certificate for $SERVICE_NAME..."
    
    # Generate private key
    openssl genrsa -out "$SERVICE_KEY" 4096 2>/dev/null
    
    # Generate CSR
    openssl req -new -key "$SERVICE_KEY" -out "$CERT_DIR/${SERVICE_NAME}.csr" \
        -subj "/C=US/ST=State/L=City/O=AI Chief of Staff/OU=Microservices/CN=${SERVICE_NAME}" \
        2>/dev/null
    
    # Create SAN config
    cat > "$CERT_DIR/${SERVICE_NAME}.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${SERVICE_NAME}
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF
    
    # Sign with CA
    openssl x509 -req -in "$CERT_DIR/${SERVICE_NAME}.csr" \
        -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
        -out "$SERVICE_CERT" -days 365 -sha256 \
        -extfile "$CERT_DIR/${SERVICE_NAME}.ext" 2>/dev/null
    
    # Cleanup
    rm -f "$CERT_DIR/${SERVICE_NAME}.csr" "$CERT_DIR/${SERVICE_NAME}.ext"
    
    # Set permissions
    chmod 600 "$SERVICE_KEY"
    chmod 644 "$SERVICE_CERT"
    
    echo "✅ Certificate for $SERVICE_NAME created"
else
    echo "✅ Certificate for $SERVICE_NAME already exists"
fi

echo "🔐 TLS certificates ready for $SERVICE_NAME"
