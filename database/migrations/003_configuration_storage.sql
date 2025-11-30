-- AI Chief of Staff - Configuration Storage Migration
-- Stores system configuration in database instead of relying on environment variables

-- ============================================================================
-- Configuration Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS configurations (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(255) UNIQUE NOT NULL,
    config_value TEXT,
    config_type VARCHAR(50) DEFAULT 'string', -- string, integer, boolean, json
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE, -- For API keys, passwords
    category VARCHAR(100) DEFAULT 'general', -- ai_providers, storage, integrations, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) DEFAULT 'system'
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_config_key ON configurations(config_key);
CREATE INDEX IF NOT EXISTS idx_config_category ON configurations(category);

-- ============================================================================
-- AI Provider Configurations
-- ============================================================================

-- Anthropic (Claude)
INSERT INTO configurations (config_key, config_value, config_type, description, is_sensitive, category) VALUES
('anthropic.api_key', NULL, 'string', 'Anthropic API key for Claude models', TRUE, 'ai_providers'),
('anthropic.default_model', 'claude-sonnet-4-5-20250929', 'string', 'Default Claude model for AI services', FALSE, 'ai_providers'),
('anthropic.enabled', 'true', 'boolean', 'Enable Anthropic Claude provider', FALSE, 'ai_providers'),
('anthropic.max_tokens', '4096', 'integer', 'Maximum tokens for Claude requests', FALSE, 'ai_providers'),
('anthropic.temperature', '0.3', 'string', 'Default temperature for Claude', FALSE, 'ai_providers')
ON CONFLICT (config_key) DO NOTHING;

-- OpenAI
INSERT INTO configurations (config_key, config_value, config_type, description, is_sensitive, category) VALUES
('openai.api_key', NULL, 'string', 'OpenAI API key for GPT and Whisper', TRUE, 'ai_providers'),
('openai.whisper_model', 'whisper-1', 'string', 'Whisper model for audio transcription', FALSE, 'ai_providers'),
('openai.enabled', 'true', 'boolean', 'Enable OpenAI provider', FALSE, 'ai_providers'),
('openai.gpt_model', 'gpt-4', 'string', 'GPT model (if used as fallback)', FALSE, 'ai_providers')
ON CONFLICT (config_key) DO NOTHING;

-- Ollama (Local AI)
INSERT INTO configurations (config_key, config_value, config_type, description, is_sensitive, category) VALUES
('ollama.enabled', 'false', 'boolean', 'Enable Ollama local AI provider', FALSE, 'ai_providers'),
('ollama.base_url', 'http://ollama:11434', 'string', 'Ollama server URL', FALSE, 'ai_providers'),
('ollama.llm_model', 'mistral:latest', 'string', 'Ollama LLM model for text generation', FALSE, 'ai_providers'),
('ollama.whisper_model', 'whisper:medium', 'string', 'Ollama Whisper model for transcription', FALSE, 'ai_providers')
ON CONFLICT (config_key) DO NOTHING;

-- AWS Bedrock
INSERT INTO configurations (config_key, config_value, config_type, description, is_sensitive, category) VALUES
('bedrock.enabled', 'false', 'boolean', 'Enable AWS Bedrock provider', FALSE, 'ai_providers'),
('bedrock.region', 'us-east-1', 'string', 'AWS region for Bedrock', FALSE, 'ai_providers'),
('bedrock.access_key_id', NULL, 'string', 'AWS Access Key ID', TRUE, 'ai_providers'),
('bedrock.secret_access_key', NULL, 'string', 'AWS Secret Access Key', TRUE, 'ai_providers'),
('bedrock.claude_model_id', 'anthropic.claude-sonnet-4-5-20250929-v1:0', 'string', 'Bedrock Claude model ID', FALSE, 'ai_providers')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- Service-Specific Model Selections
-- ============================================================================

INSERT INTO configurations (config_key, config_value, config_type, description, is_sensitive, category) VALUES
('ai_intelligence.provider', 'anthropic', 'string', 'AI provider for intelligence service (anthropic/openai/ollama/bedrock)', FALSE, 'services'),
('ai_intelligence.model', 'claude-sonnet-4-5-20250929', 'string', 'Model for intelligence service', FALSE, 'services'),
('pattern_recognition.provider', 'anthropic', 'string', 'AI provider for pattern recognition', FALSE, 'services'),
('pattern_recognition.model', 'claude-sonnet-4-5-20250929', 'string', 'Model for pattern recognition', FALSE, 'services'),
('nl_parser.provider', 'anthropic', 'string', 'AI provider for NL parser', FALSE, 'services'),
('nl_parser.model', 'claude-sonnet-4-5-20250929', 'string', 'Model for NL parser', FALSE, 'services'),
('voice_processor.provider', 'openai', 'string', 'AI provider for voice processor (openai/ollama)', FALSE, 'services'),
('voice_processor.model', 'whisper-1', 'string', 'Model for voice transcription', FALSE, 'services')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- Storage Configuration
-- ============================================================================

INSERT INTO configurations (config_key, config_value, config_type, description, is_sensitive, category) VALUES
('storage.voice_recordings.type', 'local', 'string', 'Storage type for voice recordings (local/s3)', FALSE, 'storage'),
('storage.voice_recordings.local_path', '/app/data/voice-recordings', 'string', 'Local path for voice recordings', FALSE, 'storage'),
('storage.voice_recordings.retention_days', '90', 'integer', 'Days to retain voice recordings', FALSE, 'storage'),
('storage.s3.enabled', 'false', 'boolean', 'Enable S3 storage', FALSE, 'storage'),
('storage.s3.bucket', NULL, 'string', 'S3 bucket name', FALSE, 'storage'),
('storage.s3.region', 'us-east-1', 'string', 'S3 region', FALSE, 'storage'),
('storage.s3.access_key_id', NULL, 'string', 'S3 Access Key ID', TRUE, 'storage'),
('storage.s3.secret_access_key', NULL, 'string', 'S3 Secret Access Key', TRUE, 'storage'),
('storage.s3.endpoint', NULL, 'string', 'Custom S3 endpoint (for MinIO, etc.)', FALSE, 'storage')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- System Configuration
-- ============================================================================

INSERT INTO configurations (config_key, config_value, config_type, description, is_sensitive, category) VALUES
('system.allow_env_override', 'true', 'boolean', 'Allow environment variables to override database config', FALSE, 'system'),
('system.log_level', 'info', 'string', 'Global log level (debug/info/warn/error)', FALSE, 'system'),
('system.maintenance_mode', 'false', 'boolean', 'System maintenance mode', FALSE, 'system')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- Update Trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_configurations_updated_at BEFORE UPDATE ON configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Configuration History (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS configuration_history (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(255) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(255) DEFAULT 'system',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_history_key ON configuration_history(config_key);
CREATE INDEX IF NOT EXISTS idx_config_history_time ON configuration_history(changed_at DESC);

-- ============================================================================
-- Audit Trigger for Configuration Changes
-- ============================================================================

CREATE OR REPLACE FUNCTION log_configuration_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.config_value != NEW.config_value) OR 
       (TG_OP = 'UPDATE' AND OLD.is_sensitive != NEW.is_sensitive) THEN
        INSERT INTO configuration_history (config_key, old_value, new_value, changed_by)
        VALUES (
            NEW.config_key,
            CASE WHEN OLD.is_sensitive THEN '***REDACTED***' ELSE OLD.config_value END,
            CASE WHEN NEW.is_sensitive THEN '***REDACTED***' ELSE NEW.config_value END,
            NEW.updated_by
        );
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER audit_configuration_changes AFTER UPDATE ON configurations
    FOR EACH ROW EXECUTE FUNCTION log_configuration_change();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get configuration value (returns NULL if not found)
CREATE OR REPLACE FUNCTION get_config(p_key VARCHAR)
RETURNS TEXT AS $$
    SELECT config_value FROM configurations WHERE config_key = p_key;
$$ LANGUAGE SQL STABLE;

-- Set configuration value
CREATE OR REPLACE FUNCTION set_config(
    p_key VARCHAR,
    p_value TEXT,
    p_updated_by VARCHAR DEFAULT 'system'
)
RETURNS VOID AS $$
    UPDATE configurations 
    SET config_value = p_value, updated_by = p_updated_by
    WHERE config_key = p_key;
$$ LANGUAGE SQL;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE configurations IS 'System configuration stored in database for dynamic updates without container restarts';
COMMENT ON COLUMN configurations.is_sensitive IS 'Marks sensitive data (API keys) - should be encrypted in production';
COMMENT ON TABLE configuration_history IS 'Audit log of all configuration changes';
