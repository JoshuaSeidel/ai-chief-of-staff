#!/bin/bash
# Create placeholder PNG icons using ImageMagick
# This is a fallback if node canvas doesn't work

# Check if ImageMagick is available
if ! command -v convert &> /dev/null; then
    echo "ImageMagick not found. Creating simple placeholders..."
    
    # Create a simple colored square as placeholder
    cat > icon-192.png << 'EOF'
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
EOF
    base64 -d icon-192.png > icon-192.png.tmp 2>/dev/null || true
    rm -f icon-192.png.tmp
    echo "Placeholder created for 192x192"
    
    echo "Please use the HTML generator (create-icons.html) in a browser to create proper icons."
    exit 0
fi

# Create 192x192 icon
convert -size 192x192 xc:'#3b82f6' \
    -fill white -draw "circle 96,96 96,48" \
    -pointsize 40 -fill white -gravity center -annotate +0+0 'AI' \
    icon-192.png

# Create 512x512 icon
convert -size 512x512 xc:'#3b82f6' \
    -fill white -draw "circle 256,256 256,128" \
    -pointsize 100 -fill white -gravity center -annotate +0+0 'AI' \
    icon-512.png

echo "Icons created successfully!"

