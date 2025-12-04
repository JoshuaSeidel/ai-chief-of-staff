#!/bin/bash

# TLS Certificate Generation Script for AI Chief of Staff
# Generates self-signed certificates for secure inter-container communication
# 
# Usage: ./scripts/generate-certs.sh
# Run this before starting Docker containers for the first time

set -e  # Exit on error

echo "================================================"
echo "AI Chief of Staff - TLS Certificate Generator"
echo "================================================"
echo ""

# Create certs directory if it doesn't exist
CERTS_DIR="./certs"
if [ -d "$CERTS_DIR" ]; then
  echo "⚠️  Certificate directory already exists"
  read -p "Do you want to regenerate certificates? This will overwrite existing certs (y/N): " -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Certificate generation cancelled"
    exit 0
  fi
  echo "🗑️  Removing existing certificates..."
  rm -rf "$CERTS_DIR"
fi

mkdir -p "$CERTS_DIR"
echo "✓ Created certificate directory: $CERTS_DIR"
echo ""

# Generate CA (Certificate Authority) certificate
echo "📜 Generating Certificate Authority (CA)..."
openssl req -x509 -new -nodes -days 3650 \
  -keyout "$CERTS_DIR/ca-key.pem" \
  -out "$CERTS_DIR/ca-cert.pem" \
  -subj "/CN=AI-Chief-of-Staff-CA/O=AI-Chief-of-Staff/C=US" \
  -newkey rsa:4096 \
  -sha256

echo "✓ CA certificate generated (valid for 10 years)"
echo ""

# List of services that need certificates
SERVICES=(
  "backend"
  "integrations"
  "ai-intelligence"
  "pattern-recognition"
  "nl-parser"
  "voice-processor"
  "context-service"
)

echo "🔐 Generating service certificates..."
echo ""

for service in "${SERVICES[@]}"; do
  SERVICE_CN="aicos-${service}"
  
  echo "  → Generating certificate for ${SERVICE_CN}..."
  
  # Generate private key
  openssl genrsa -out "$CERTS_DIR/${service}-key.pem" 4096 2>/dev/null
  
  # Create certificate signing request (CSR)
  openssl req -new \
    -key "$CERTS_DIR/${service}-key.pem" \
    -out "$CERTS_DIR/${service}.csr" \
    -subj "/CN=${SERVICE_CN}/O=AI-Chief-of-Staff/C=US" \
    2>/dev/null
  
  # Create extension file for Subject Alternative Names (SAN)
  cat > "$CERTS_DIR/${service}-ext.cnf" <<EOF
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${SERVICE_CN}
DNS.2 = localhost
DNS.3 = ${service}
IP.1 = 127.0.0.1
EOF
  
  # Sign certificate with CA
  openssl x509 -req \
    -in "$CERTS_DIR/${service}.csr" \
    -CA "$CERTS_DIR/ca-cert.pem" \
    -CAkey "$CERTS_DIR/ca-key.pem" \
    -CAcreateserial \
    -out "$CERTS_DIR/${service}-cert.pem" \
    -days 3650 \
    -sha256 \
    -extfile "$CERTS_DIR/${service}-ext.cnf" \
    2>/dev/null
  
  # Clean up temporary files
  rm "$CERTS_DIR/${service}.csr" "$CERTS_DIR/${service}-ext.cnf"
  
  echo "    ✓ ${service}-cert.pem (valid for 10 years)"
done

echo ""
echo "✓ All service certificates generated"
echo ""

# Set proper permissions
echo "🔒 Setting certificate permissions..."
chmod 600 "$CERTS_DIR"/*-key.pem
chmod 644 "$CERTS_DIR"/*-cert.pem "$CERTS_DIR"/ca-cert.pem
echo "✓ Permissions set (keys: 600, certs: 644)"
echo ""

# Display certificate information
echo "================================================"
echo "Certificate Summary"
echo "================================================"
echo ""
echo "CA Certificate:"
openssl x509 -in "$CERTS_DIR/ca-cert.pem" -noout -subject -dates
echo ""
echo "Service Certificates:"
for service in "${SERVICES[@]}"; do
  echo "  • ${service}:"
  openssl x509 -in "$CERTS_DIR/${service}-cert.pem" -noout -subject -dates | sed 's/^/    /'
  echo ""
done

echo "================================================"
echo "✅ Certificate generation complete!"
echo "================================================"
echo ""
echo "Generated files in $CERTS_DIR:"
echo "  • ca-cert.pem       - Certificate Authority certificate"
echo "  • ca-key.pem        - Certificate Authority private key"
echo "  • <service>-cert.pem - Service certificate"
echo "  • <service>-key.pem  - Service private key"
echo ""
echo "Next steps:"
echo "  1. Start Docker containers: docker-compose up -d"
echo "  2. Certificates will be mounted at /app/certs in each container"
echo "  3. Services will automatically use TLS for inter-container communication"
echo ""
echo "⚠️  Important:"
echo "  • Keep ca-key.pem and *-key.pem files secure"
echo "  • These certificates are valid for 10 years"
echo "  • Regenerate certificates before expiration"
echo "  • Do not commit certificates to version control"
echo ""
