import React, { useState, useEffect } from 'react';
import { configAPI, profilesAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useProfile } from '../../contexts/ProfileContext';
import { ScopeBadge } from '../common/Badge';
import { Button } from '../common/Button';
import { FormSkeleton } from '../common/LoadingSkeleton';

export function AISettings() {
  const { currentProfile } = useProfile();
  const toast = useToast();

  const [config, setConfig] = useState({
    // Main AI Provider
    aiProvider: 'anthropic',
    anthropicApiKey: '',
    claudeModel: 'claude-sonnet-4-5-20250929',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1',
    aiMaxTokens: '4096',
    aiTemperature: '0.7',
    // Microservice AI configurations
    aiIntelligenceProvider: '',
    aiIntelligenceModel: '',
    voiceProcessorProvider: '',
    voiceProcessorModel: '',
    voiceProcessorWhisperModel: 'base',
    patternRecognitionProvider: '',
    patternRecognitionModel: '',
    nlParserProvider: '',
    nlParserModel: '',
    // Storage configuration
    storageType: 'local',
    storagePath: '/app/data/voice-recordings',
    s3Bucket: '',
    s3Region: 'us-east-1',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3Endpoint: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [microservicesExpanded, setMicroservicesExpanded] = useState(false);
  const [availableModels, setAvailableModels] = useState({
    anthropic: [],
    openai: [],
    ollama: []
  });
  const [loadingModels, setLoadingModels] = useState({});

  useEffect(() => {
    loadConfig();
    loadModelsForProvider('anthropic');
    loadModelsForProvider('openai');
    loadModelsForProvider('ollama');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile?.id]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await configAPI.getAll();
      const data = response.data;

      // Load profile preferences
      let profilePrefs = {};
      if (currentProfile?.id) {
        try {
          const profileResponse = await profilesAPI.getById(currentProfile.id);
          if (profileResponse.data?.profile?.preferences) {
            profilePrefs = typeof profileResponse.data.profile.preferences === 'string'
              ? JSON.parse(profileResponse.data.profile.preferences)
              : profileResponse.data.profile.preferences;
          }
        } catch (err) {
          console.warn('Failed to load profile preferences:', err);
        }
      }

      // Load system config for storage settings
      let sysData = {};
      try {
        const sysResponse = await fetch('/api/config/system');
        sysData = await sysResponse.json();
      } catch (err) {
        console.warn('Failed to load system config:', err);
      }

      setConfig({
        // Main AI Provider settings
        aiProvider: profilePrefs.aiProvider || profilePrefs.ai_provider || data.aiProvider || data.ai_provider || 'anthropic',
        anthropicApiKey: data.anthropicApiKey || data.anthropic_api_key ? '••••••••' : '',
        claudeModel: profilePrefs.claudeModel || profilePrefs.claude_model || data.claudeModel || data.claude_model || 'claude-sonnet-4-5-20250929',
        openaiApiKey: data.openaiApiKey || data.openai_api_key ? '••••••••' : '',
        openaiModel: profilePrefs.openaiModel || profilePrefs.openai_model || data.openaiModel || data.openai_model || 'gpt-4o',
        ollamaBaseUrl: data.ollamaBaseUrl || data.ollama_base_url || 'http://localhost:11434',
        ollamaModel: profilePrefs.ollamaModel || profilePrefs.ollama_model || data.ollamaModel || data.ollama_model || 'llama3.1',
        aiMaxTokens: data.aiMaxTokens || data.ai_max_tokens || '4096',
        aiTemperature: data.aiTemperature || data.ai_temperature || '0.7',
        // Microservice AI configurations (profile-specific)
        aiIntelligenceProvider: profilePrefs.aiIntelligenceProvider || data.aiIntelligenceProvider || '',
        aiIntelligenceModel: profilePrefs.aiIntelligenceModel || data.aiIntelligenceModel || '',
        voiceProcessorProvider: profilePrefs.voiceProcessorProvider || data.voiceProcessorProvider || '',
        voiceProcessorModel: profilePrefs.voiceProcessorModel || data.voiceProcessorModel || '',
        voiceProcessorWhisperModel: data.voiceProcessorWhisperModel || 'base',
        patternRecognitionProvider: profilePrefs.patternRecognitionProvider || data.patternRecognitionProvider || '',
        patternRecognitionModel: profilePrefs.patternRecognitionModel || data.patternRecognitionModel || '',
        nlParserProvider: profilePrefs.nlParserProvider || data.nlParserProvider || '',
        nlParserModel: profilePrefs.nlParserModel || data.nlParserModel || '',
        // Storage configuration
        storageType: sysData.storage?.type || data.storageType || 'local',
        storagePath: sysData.storage?.path || data.storagePath || '/app/data/voice-recordings',
        s3Bucket: sysData.storage?.s3?.bucket || data.s3Bucket || '',
        s3Region: sysData.storage?.s3?.region || data.s3Region || 'us-east-1',
        s3AccessKeyId: sysData.storage?.s3?.accessKeyId ? '••••••••' : '',
        s3SecretAccessKey: sysData.storage?.s3?.secretAccessKey ? '••••••••' : '',
        s3Endpoint: sysData.storage?.s3?.endpoint || data.s3Endpoint || ''
      });
    } catch (err) {
      toast.error('Failed to load AI settings');
      console.error('Failed to load AI settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadModelsForProvider = async (provider) => {
    setLoadingModels(prev => ({ ...prev, [provider]: true }));
    try {
      const response = await configAPI.getModels(provider);
      if (response.data?.models) {
        setAvailableModels(prev => ({ ...prev, [provider]: response.data.models }));
      }
    } catch (err) {
      console.warn(`Failed to load models for ${provider}:`, err);
    } finally {
      setLoadingModels(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save global settings (API keys, storage) - only if not masked
      const globalSettings = {};

      if (config.anthropicApiKey && !config.anthropicApiKey.includes('•')) {
        globalSettings.anthropicApiKey = config.anthropicApiKey;
      }
      if (config.openaiApiKey && !config.openaiApiKey.includes('•')) {
        globalSettings.openaiApiKey = config.openaiApiKey;
      }

      globalSettings.ollamaBaseUrl = config.ollamaBaseUrl;
      globalSettings.aiMaxTokens = config.aiMaxTokens;
      globalSettings.aiTemperature = config.aiTemperature;
      // Voice processor settings (global, shared across profiles)
      globalSettings.voiceProcessorProvider = config.voiceProcessorProvider;
      globalSettings.voiceProcessorWhisperModel = config.voiceProcessorWhisperModel;
      globalSettings.storageType = config.storageType;
      globalSettings.storagePath = config.storagePath;
      globalSettings.s3Bucket = config.s3Bucket;
      globalSettings.s3Region = config.s3Region;
      globalSettings.s3Endpoint = config.s3Endpoint;

      if (config.s3AccessKeyId && !config.s3AccessKeyId.includes('•')) {
        globalSettings.s3AccessKeyId = config.s3AccessKeyId;
      }
      if (config.s3SecretAccessKey && !config.s3SecretAccessKey.includes('•')) {
        globalSettings.s3SecretAccessKey = config.s3SecretAccessKey;
      }

      await configAPI.bulkUpdate(globalSettings);

      // Save profile-specific settings
      if (currentProfile?.id) {
        const profileResponse = await profilesAPI.getById(currentProfile.id);
        const currentPrefs = profileResponse.data?.profile?.preferences || {};
        const parsedPrefs = typeof currentPrefs === 'string' ? JSON.parse(currentPrefs) : currentPrefs;

        const updatedPrefs = {
          ...parsedPrefs,
          aiProvider: config.aiProvider,
          claudeModel: config.claudeModel,
          openaiModel: config.openaiModel,
          ollamaModel: config.ollamaModel,
          // Microservice settings
          aiIntelligenceProvider: config.aiIntelligenceProvider,
          aiIntelligenceModel: config.aiIntelligenceModel,
          voiceProcessorProvider: config.voiceProcessorProvider,
          voiceProcessorModel: config.voiceProcessorModel,
          patternRecognitionProvider: config.patternRecognitionProvider,
          patternRecognitionModel: config.patternRecognitionModel,
          nlParserProvider: config.nlParserProvider,
          nlParserModel: config.nlParserModel
        };

        await profilesAPI.update(currentProfile.id, { preferences: updatedPrefs });
      }

      toast.success('AI settings saved successfully');
    } catch (err) {
      toast.error('Failed to save AI settings');
      console.error('Failed to save AI settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <FormSkeleton fields={6} />;
  }

  const renderModelSelect = (provider, value, onChange, defaultValue) => {
    const models = availableModels[provider] || [];
    const isLoading = loadingModels[provider];
    const effectiveProvider = provider || 'anthropic';

    // Default models for each provider
    const defaultModels = {
      anthropic: [
        { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (Latest)' },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
      ],
      openai: [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        { id: 'whisper-1', name: 'Whisper-1' }
      ],
      ollama: [
        { id: 'mistral:latest', name: 'Mistral Latest' },
        { id: 'llama3.1:latest', name: 'Llama 3.1 Latest' },
        { id: 'llama2:latest', name: 'Llama 2 Latest' },
        { id: 'codellama:latest', name: 'Code Llama Latest' },
        { id: 'whisper:latest', name: 'Whisper Latest' }
      ],
      bedrock: [
        { id: 'anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude Sonnet 4.5' },
        { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet' }
      ]
    };

    const displayModels = models.length > 0 ? models : (defaultModels[effectiveProvider] || []);

    return (
      <div className="form-group">
        <div className="flex items-center gap-sm">
          <select
            value={value || defaultValue || ''}
            onChange={onChange}
            className="form-select"
            disabled={isLoading}
          >
            <option value="">Use default</option>
            {displayModels.map(model => (
              <option key={model.id || model} value={model.id || model}>
                {model.name || model.id || model}
              </option>
            ))}
          </select>
          {['anthropic', 'openai', 'ollama'].includes(effectiveProvider) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadModelsForProvider(effectiveProvider)}
              disabled={isLoading}
              icon="🔄"
              title="Refresh models"
            />
          )}
        </div>
        {isLoading && <span className="form-hint">Loading models...</span>}
      </div>
    );
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>AI Provider Configuration</h3>
        <ScopeBadge scope="profile" />
      </div>

      <div className="form-group">
        <label className="form-label">Default AI Provider</label>
        <select
          value={config.aiProvider}
          onChange={(e) => handleChange('aiProvider', e.target.value)}
          className="form-select"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
        <span className="form-hint">Select which AI provider to use by default for this profile</span>
      </div>

      {config.aiProvider === 'anthropic' && (
        <>
          <div className="form-group">
            <label className="form-label">
              Anthropic API Key <ScopeBadge scope="global" />
            </label>
            <input
              type="password"
              value={config.anthropicApiKey}
              onChange={(e) => handleChange('anthropicApiKey', e.target.value)}
              placeholder="sk-ant-..."
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Claude Model</label>
            {renderModelSelect(
              'anthropic',
              config.claudeModel,
              (e) => handleChange('claudeModel', e.target.value),
              'claude-sonnet-4-5-20250929'
            )}
          </div>
        </>
      )}

      {config.aiProvider === 'openai' && (
        <>
          <div className="form-group">
            <label className="form-label">
              OpenAI API Key <ScopeBadge scope="global" />
            </label>
            <input
              type="password"
              value={config.openaiApiKey}
              onChange={(e) => handleChange('openaiApiKey', e.target.value)}
              placeholder="sk-..."
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">OpenAI Model</label>
            {renderModelSelect(
              'openai',
              config.openaiModel,
              (e) => handleChange('openaiModel', e.target.value),
              'gpt-4o'
            )}
          </div>
        </>
      )}

      {config.aiProvider === 'ollama' && (
        <>
          <div className="form-group">
            <label className="form-label">
              Ollama Base URL <ScopeBadge scope="global" />
            </label>
            <input
              type="text"
              value={config.ollamaBaseUrl}
              onChange={(e) => handleChange('ollamaBaseUrl', e.target.value)}
              placeholder="http://localhost:11434"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Ollama Model</label>
            {renderModelSelect(
              'ollama',
              config.ollamaModel,
              (e) => handleChange('ollamaModel', e.target.value),
              'llama3.1'
            )}
          </div>
        </>
      )}

      <div className="settings-divider" />

      <div className="settings-section-header">
        <h4>Advanced Settings</h4>
        <ScopeBadge scope="global" />
      </div>

      <div className="grid-2-col">
        <div className="form-group">
          <label className="form-label">Max Tokens</label>
          <input
            type="number"
            value={config.aiMaxTokens}
            onChange={(e) => handleChange('aiMaxTokens', e.target.value)}
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Temperature</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={config.aiTemperature}
            onChange={(e) => handleChange('aiTemperature', e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      <div className="settings-divider" />

      {/* Microservices Configuration Section */}
      <div className="settings-section-header">
        <h4
          onClick={() => setMicroservicesExpanded(!microservicesExpanded)}
          className="header-interactive flex items-center gap-sm"
          style={{ cursor: 'pointer' }}
        >
          <span className={`rotate-icon ${microservicesExpanded ? 'rotate-icon-open' : ''}`}>
            ▶
          </span>
          Microservices Configuration (Optional)
        </h4>
        <ScopeBadge scope="profile" />
      </div>
      <p className="form-hint">
        Override AI provider selection for individual microservices. Leave empty to use the default provider above.
      </p>

      {microservicesExpanded && (
        <>
          {/* AI Intelligence Service */}
          <div className="glass-panel">
            <h5 className="config-subsection-title">🧠 AI Intelligence Service</h5>
            <p className="form-hint">Task effort estimation, energy classification, and task clustering</p>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Provider</label>
                <select
                  value={config.aiIntelligenceProvider || ''}
                  onChange={(e) => handleChange('aiIntelligenceProvider', e.target.value)}
                  className="form-select"
                >
                  <option value="">Use default ({config.aiProvider})</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Model</label>
                {renderModelSelect(
                  config.aiIntelligenceProvider || config.aiProvider,
                  config.aiIntelligenceModel,
                  (e) => handleChange('aiIntelligenceModel', e.target.value),
                  'claude-sonnet-4-5-20250929'
                )}
              </div>
            </div>
          </div>

          {/* Voice Processor Service */}
          <div className="glass-panel">
            <h5 className="config-subsection-title">🎤 Voice Processor Service</h5>
            <p className="form-hint">Audio transcription and voice-to-text</p>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Provider</label>
                <select
                  value={config.voiceProcessorProvider || ''}
                  onChange={(e) => handleChange('voiceProcessorProvider', e.target.value)}
                  className="form-select"
                >
                  <option value="">Use default (OpenAI Whisper)</option>
                  <option value="openai">OpenAI Whisper</option>
                  <option value="ollama">Ollama Whisper</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Model</label>
                {renderModelSelect(
                  config.voiceProcessorProvider || 'openai',
                  config.voiceProcessorModel,
                  (e) => handleChange('voiceProcessorModel', e.target.value),
                  'whisper-1'
                )}
              </div>
            </div>

            {/* Show OpenAI API key field when using OpenAI Whisper and main provider is not OpenAI */}
            {(config.voiceProcessorProvider === 'openai' || config.voiceProcessorProvider === '') && config.aiProvider !== 'openai' && (
              <div className="form-group">
                <label className="form-label">
                  OpenAI API Key for Whisper <ScopeBadge scope="global" />
                </label>
                <input
                  type="password"
                  value={config.openaiApiKey}
                  onChange={(e) => handleChange('openaiApiKey', e.target.value)}
                  placeholder="sk-..."
                  className="form-input"
                />
                <p className="form-hint">Required for OpenAI Whisper transcription when using a different main AI provider</p>
              </div>
            )}

            {/* Show Ollama configuration when using Ollama Whisper */}
            {config.voiceProcessorProvider === 'ollama' && (
              <>
                <div className="form-group">
                  <label className="form-label">
                    Ollama Base URL <ScopeBadge scope="global" />
                  </label>
                  <input
                    type="text"
                    value={config.ollamaBaseUrl}
                    onChange={(e) => handleChange('ollamaBaseUrl', e.target.value)}
                    placeholder="http://localhost:11434"
                    className="form-input"
                  />
                  <p className="form-hint">URL of your Ollama server for local Whisper transcription</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Local Whisper Model Size</label>
                  <select
                    value={config.voiceProcessorWhisperModel || 'base'}
                    onChange={(e) => handleChange('voiceProcessorWhisperModel', e.target.value)}
                    className="form-select"
                  >
                    <option value="tiny">Tiny (~75MB, fastest, lower accuracy)</option>
                    <option value="base">Base (~140MB, good balance)</option>
                    <option value="small">Small (~460MB, better accuracy)</option>
                    <option value="medium">Medium (~1.5GB, high accuracy)</option>
                    <option value="large-v3">Large V3 (~3GB, best accuracy)</option>
                  </select>
                  <p className="form-hint">Larger models are more accurate but slower and require more memory</p>
                </div>

                <div className="form-group">
                  <p className="form-hint" style={{ color: '#f59e0b' }}>
                    ⚠️ Note: After saving, restart the voice-processor service. The model will be downloaded automatically on first use.
                  </p>
                </div>
              </>
            )}

            {/* Storage Configuration */}
            <div className="section-divider">
              <h6 className="config-subsection-subtitle">💾 Storage Configuration</h6>
              <p className="form-hint">Configure where transcribed audio files are stored</p>

              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Storage Type</label>
                  <select
                    value={config.storageType}
                    onChange={(e) => handleChange('storageType', e.target.value)}
                    className="form-select"
                  >
                    <option value="local">Local Filesystem</option>
                    <option value="s3">AWS S3</option>
                  </select>
                </div>

                {config.storageType === 'local' && (
                  <div className="form-group">
                    <label className="form-label">Storage Path</label>
                    <input
                      type="text"
                      value={config.storagePath}
                      onChange={(e) => handleChange('storagePath', e.target.value)}
                      placeholder="/app/data/voice-recordings"
                      className="form-input"
                    />
                  </div>
                )}
              </div>

              {config.storageType === 's3' && (
                <div className="grid-2-col">
                  <div className="form-group">
                    <label className="form-label">S3 Bucket</label>
                    <input
                      type="text"
                      value={config.s3Bucket}
                      onChange={(e) => handleChange('s3Bucket', e.target.value)}
                      placeholder="my-bucket"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">S3 Region</label>
                    <input
                      type="text"
                      value={config.s3Region}
                      onChange={(e) => handleChange('s3Region', e.target.value)}
                      placeholder="us-east-1"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">S3 Access Key ID</label>
                    <input
                      type="password"
                      value={config.s3AccessKeyId}
                      onChange={(e) => handleChange('s3AccessKeyId', e.target.value)}
                      placeholder="AKIA..."
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">S3 Secret Access Key</label>
                    <input
                      type="password"
                      value={config.s3SecretAccessKey}
                      onChange={(e) => handleChange('s3SecretAccessKey', e.target.value)}
                      placeholder="••••••••"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">S3 Endpoint (Optional)</label>
                    <input
                      type="text"
                      value={config.s3Endpoint}
                      onChange={(e) => handleChange('s3Endpoint', e.target.value)}
                      placeholder="https://s3.amazonaws.com (leave empty for AWS default)"
                      className="form-input"
                    />
                    <span className="form-hint">For S3-compatible services like MinIO, DigitalOcean Spaces, etc.</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pattern Recognition Service */}
          <div className="glass-panel">
            <h5 className="config-subsection-title">🔍 Pattern Recognition Service</h5>
            <p className="form-hint">Behavioral pattern detection and task clustering</p>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Provider</label>
                <select
                  value={config.patternRecognitionProvider || ''}
                  onChange={(e) => handleChange('patternRecognitionProvider', e.target.value)}
                  className="form-select"
                >
                  <option value="">Use default ({config.aiProvider})</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Model</label>
                {renderModelSelect(
                  config.patternRecognitionProvider || config.aiProvider,
                  config.patternRecognitionModel,
                  (e) => handleChange('patternRecognitionModel', e.target.value),
                  'claude-sonnet-4-5-20250929'
                )}
              </div>
            </div>
          </div>

          {/* NL Parser Service */}
          <div className="glass-panel">
            <h5 className="config-subsection-title">📝 NL Parser Service</h5>
            <p className="form-hint">Natural language task parsing and date extraction</p>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Provider</label>
                <select
                  value={config.nlParserProvider || ''}
                  onChange={(e) => handleChange('nlParserProvider', e.target.value)}
                  className="form-select"
                >
                  <option value="">Use default ({config.aiProvider})</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Model</label>
                {renderModelSelect(
                  config.nlParserProvider || config.aiProvider,
                  config.nlParserModel,
                  (e) => handleChange('nlParserModel', e.target.value),
                  'claude-sonnet-4-5-20250929'
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="settings-actions">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Save AI Settings
        </Button>
      </div>
    </div>
  );
}

export default AISettings;
