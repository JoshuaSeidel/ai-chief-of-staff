#!/usr/bin/env node

/**
 * Generate PNG icons from Canvas (Node.js script)
 * Run with: node generate-icons.js
 * Requires: npm install canvas
 */

const fs = require('fs');
const path = require('path');

// Try to load canvas module
let createCanvas, loadImage;
try {
  const Canvas = require('canvas');
  createCanvas = Canvas.createCanvas;
  loadImage = Canvas.loadImage;
} catch (error) {
  console.log('Canvas module not found. Please install it:');
  console.log('npm install canvas');
  console.log('\nAlternatively, use the create-icons.html in your browser.');
  process.exit(1);
}

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(0, 0, size, size);
  
  // AI Neural Network
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = size / 128;
  
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 6;
  const nodeRadius = size / 25;
  
  // Center circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
  
  // Nodes around center
  const nodes = [
    [-radius, -radius], [radius, -radius],
    [-radius, radius], [radius, radius],
    [0, -radius * 1.3], [0, radius * 1.3],
    [-radius * 1.3, 0], [radius * 1.3, 0]
  ];
  
  // Draw connections
  ctx.globalAlpha = 0.6;
  nodes.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.moveTo(centerX + x, centerY + y);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  
  // Draw nodes
  nodes.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(centerX + x, centerY + y, nodeRadius, 0, 2 * Math.PI);
    ctx.fill();
  });
  
  // Document/Clipboard at bottom
  const docWidth = size / 5;
  const docHeight = docWidth * 1.2;
  const docX = centerX - docWidth / 2;
  const docY = centerY + radius * 1.8;
  
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(docX, docY, docWidth, docHeight, size / 64);
  ctx.fill();
  
  // Lines on document
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = size / 85;
  const lineY1 = docY + docHeight * 0.25;
  const lineY2 = docY + docHeight * 0.5;
  const lineY3 = docY + docHeight * 0.75;
  const lineX1 = docX + docWidth * 0.2;
  const lineX2 = docX + docWidth * 0.8;
  
  ctx.beginPath();
  ctx.moveTo(lineX1, lineY1);
  ctx.lineTo(lineX2, lineY1);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(lineX1, lineY2);
  ctx.lineTo(lineX2, lineY2);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(lineX1, lineY3);
  ctx.lineTo(docX + docWidth * 0.6, lineY3);
  ctx.stroke();
  
  // Checkmark
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = size / 64;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  const checkX = docX + docWidth * 0.75;
  const checkY = lineY3;
  
  ctx.beginPath();
  ctx.moveTo(checkX - nodeRadius / 2, checkY);
  ctx.lineTo(checkX, checkY + nodeRadius / 2);
  ctx.lineTo(checkX + nodeRadius, checkY - nodeRadius / 2);
  ctx.stroke();
  
  return canvas;
}

// Generate icons
console.log('Generating icons...');

const icon192 = createIcon(192);
const icon512 = createIcon(512);

const publicDir = __dirname;

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192.toBuffer('image/png'));
console.log('✓ Created icon-192.png');

fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512.toBuffer('image/png'));
console.log('✓ Created icon-512.png');

console.log('\nIcons generated successfully!');
console.log('You can now use these in your PWA.');

