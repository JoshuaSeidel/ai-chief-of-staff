#!/usr/bin/env node

/**
 * Quick utility to check current database configuration
 * Usage: node check-db-config.js
 */

const configManager = require('./config/manager');
const fs = require('fs');

console.log('\n' + '='.repeat(70));
console.log('DATABASE CONFIGURATION CHECK');
console.log('='.repeat(70));

// Check if config file exists
console.log(`\nConfig file location: ${configManager.CONFIG_FILE}`);
console.log(`Config file exists: ${fs.existsSync(configManager.CONFIG_FILE) ? '✓ YES' : '✗ NO'}`);

if (!fs.existsSync(configManager.CONFIG_FILE)) {
  console.log('\n⚠️  No configuration file found!');
  console.log('A default configuration will be created on first run.');
  console.log('\nDefault settings:');
  console.log(JSON.stringify(configManager.DEFAULT_CONFIG, null, 2));
  process.exit(0);
}

// Load and display config
try {
  const rawConfig = fs.readFileSync(configManager.CONFIG_FILE, 'utf8');
  console.log('\n' + '-'.repeat(70));
  console.log('RAW CONFIG FILE CONTENT:');
  console.log('-'.repeat(70));
  console.log(rawConfig);
  console.log('-'.repeat(70));
  
  const config = JSON.parse(rawConfig);
  
  console.log('\n' + '='.repeat(70));
  console.log('PARSED CONFIGURATION:');
  console.log('='.repeat(70));
  
  console.log(`\nDatabase Type: ${config.dbType || 'NOT SET (will default to sqlite)'}`);
  
  if (config.dbType === 'postgres' || config.dbType === 'postgresql') {
    console.log('\n📊 PostgreSQL Configuration:');
    console.log(`  ├─ Host:     ${config.postgres?.host || '❌ NOT SET'}`);
    console.log(`  ├─ Port:     ${config.postgres?.port || '❌ NOT SET'}`);
    console.log(`  ├─ Database: ${config.postgres?.database || '❌ NOT SET'}`);
    console.log(`  ├─ User:     ${config.postgres?.user || '❌ NOT SET'}`);
    console.log(`  └─ Password: ${config.postgres?.password ? '✓ SET (***hidden***)' : '❌ NOT SET'}`);
    
    // Validation
    console.log('\n🔍 Validation:');
    const errors = [];
    if (!config.postgres?.host) errors.push('  ✗ Missing host');
    if (!config.postgres?.user) errors.push('  ✗ Missing user');
    if (!config.postgres?.password) errors.push('  ⚠️  Missing password (might work if no password required)');
    
    if (errors.length === 0) {
      console.log('  ✓ All required fields are configured');
    } else {
      console.log(errors.join('\n'));
    }
    
  } else {
    console.log('\n📁 SQLite Configuration:');
    console.log(`  └─ Path: ${config.sqlite?.path || '/app/data/ai-chief-of-staff.db'}`);
    
    const dbPath = config.sqlite?.path || '/app/data/ai-chief-of-staff.db';
    console.log(`\n🔍 SQLite Database File:`);
    console.log(`  ├─ Location: ${dbPath}`);
    console.log(`  └─ Exists:   ${fs.existsSync(dbPath) ? '✓ YES' : '✗ NO (will be created on first run)'}`);
  }
  
  // API Keys check (if stored in config)
  console.log('\n🔑 API Keys:');
  if (config.anthropicApiKey) {
    const keyPreview = config.anthropicApiKey.substring(0, 8) + '...' + config.anthropicApiKey.substring(config.anthropicApiKey.length - 4);
    console.log(`  ├─ Anthropic: ✓ SET (${keyPreview})`);
  } else {
    console.log(`  ├─ Anthropic: ❌ NOT SET`);
  }
  
  if (config.plaudApiKey) {
    const keyPreview = config.plaudApiKey.substring(0, 8) + '...' + config.plaudApiKey.substring(config.plaudApiKey.length - 4);
    console.log(`  └─ Plaud:     ✓ SET (${keyPreview})`);
  } else {
    console.log(`  └─ Plaud:     ❌ NOT SET`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('');
  
} catch (err) {
  console.error('\n❌ Error reading/parsing config file:', err.message);
  process.exit(1);
}

