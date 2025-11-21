/**
 * Pre-flight checks before starting the server
 * This ensures all critical configuration is present and valid
 */

const configManager = require('./config/manager');
const fs = require('fs');
const { Client } = require('pg');

console.log('='.repeat(70));
console.log('AI CHIEF OF STAFF - STARTUP CHECKS');
console.log('='.repeat(70));

/**
 * Check if configuration file exists and is valid
 */
function checkConfigFile() {
  console.log('\n[1/3] Checking configuration file...');
  
  if (!fs.existsSync(configManager.CONFIG_FILE)) {
    console.log('  ⚠️  Config file not found, will be created with defaults');
    return false;
  }
  
  try {
    const config = configManager.loadConfig();
    console.log(`  ✓ Config file exists: ${configManager.CONFIG_FILE}`);
    console.log(`  ✓ Database type: ${config.dbType || 'sqlite'}`);
    
    if (config.dbType === 'postgres' || config.dbType === 'postgresql') {
      console.log(`  ℹ️  PostgreSQL configuration:`);
      console.log(`     Host: ${config.postgres?.host || 'NOT SET'}`);
      console.log(`     Port: ${config.postgres?.port || 'NOT SET'}`);
      console.log(`     Database: ${config.postgres?.database || 'NOT SET'}`);
      console.log(`     User: ${config.postgres?.user || 'NOT SET'}`);
      console.log(`     Password: ${config.postgres?.password ? '***SET***' : 'NOT SET'}`);
    } else {
      console.log(`  ℹ️  SQLite path: ${config.sqlite?.path || '/data/ai-chief-of-staff.db'}`);
    }
    
    return config;
  } catch (err) {
    console.error('  ✗ Error loading config:', err.message);
    return false;
  }
}

/**
 * Test PostgreSQL connection
 */
async function testPostgresConnection(config) {
  console.log('\n[2/3] Testing PostgreSQL connection...');
  
  const pgConfig = config.postgres || {};
  
  if (!pgConfig.host) {
    console.log('  ✗ PostgreSQL host not configured');
    return false;
  }
  
  if (!pgConfig.user) {
    console.log('  ✗ PostgreSQL user not configured');
    return false;
  }
  
  const client = new Client({
    host: pgConfig.host,
    port: pgConfig.port || 5432,
    database: 'postgres', // Connect to default database first
    user: pgConfig.user,
    password: pgConfig.password || '',
    connectionTimeoutMillis: 5000,
  });
  
  try {
    console.log(`  → Connecting to ${pgConfig.host}:${pgConfig.port || 5432}...`);
    await client.connect();
    console.log('  ✓ Successfully connected to PostgreSQL server');
    
    // Check if target database exists
    const dbName = pgConfig.database || 'ai_chief_of_staff';
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    
    if (result.rows.length > 0) {
      console.log(`  ✓ Target database '${dbName}' exists`);
    } else {
      console.log(`  ⚠️  Target database '${dbName}' does not exist (will be created)`);
    }
    
    await client.end();
    return true;
  } catch (err) {
    console.error('  ✗ Failed to connect to PostgreSQL:', err.message);
    console.error('  ℹ️  This usually means:');
    console.error('     - PostgreSQL server is not running');
    console.error('     - Wrong host/port configuration');
    console.error('     - Wrong credentials');
    console.error('     - PostgreSQL is not accessible from this container/host');
    console.error('  ℹ️  Will fall back to SQLite');
    return false;
  }
}

/**
 * Check data directory
 */
function checkDataDirectory() {
  console.log('\n[3/3] Checking data directory...');
  
  const dataDir = process.env.CONFIG_DIR || '/data';
  
  if (!fs.existsSync(dataDir)) {
    console.log(`  ⚠️  Data directory ${dataDir} does not exist, creating...`);
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`  ✓ Created data directory: ${dataDir}`);
    } catch (err) {
      console.error(`  ✗ Failed to create data directory:`, err.message);
      return false;
    }
  } else {
    console.log(`  ✓ Data directory exists: ${dataDir}`);
  }
  
  // Check write permissions
  const testFile = `${dataDir}/.write-test`;
  try {
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`  ✓ Data directory is writable`);
    return true;
  } catch (err) {
    console.error(`  ✗ Data directory is not writable:`, err.message);
    return false;
  }
}

/**
 * Run all startup checks
 */
async function runStartupChecks() {
  const config = checkConfigFile();
  
  if (!config) {
    console.log('\n⚠️  No valid configuration found, using defaults');
  }
  
  // Only test PostgreSQL connection if configured
  if (config && (config.dbType === 'postgres' || config.dbType === 'postgresql')) {
    await testPostgresConnection(config);
  } else {
    console.log('\n[2/3] Skipping PostgreSQL connection test (SQLite configured)');
  }
  
  checkDataDirectory();
  
  console.log('\n' + '='.repeat(70));
  console.log('STARTUP CHECKS COMPLETE');
  console.log('='.repeat(70));
  console.log('');
}

// Run checks if executed directly
if (require.main === module) {
  runStartupChecks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Startup checks failed:', err);
      process.exit(1);
    });
}

module.exports = { runStartupChecks };

