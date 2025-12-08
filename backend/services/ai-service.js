const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { getDb, getDbType } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('AI-SERVICE');

/**
 * Supported AI providers
 */
const PROVIDERS = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  OLLAMA: 'ollama'
};

/**
 * Get configured AI provider from profile preferences or fallback to global config
 * @param {number} profileId - Profile ID to get preferences from
 */
async function getAIProvider(profileId = 2) {
  const db = getDb();
  
  // Try to get from profile preferences first
  if (profileId) {
    const profileRow = await db.get('SELECT preferences FROM profiles WHERE id = ?', [profileId]);
    if (profileRow && profileRow.preferences) {
      try {
        const prefs = JSON.parse(profileRow.preferences);
        if (prefs.aiProvider) {
          return prefs.aiProvider.trim();
        }
      } catch (e) {
        // Invalid JSON, fall through to global config
      }
    }
  }
  
  // Fallback to global config
  const row = await db.get('SELECT value FROM config WHERE key = ?', ['aiProvider']);
  return row?.value?.trim() || PROVIDERS.ANTHROPIC; // Default to Anthropic
}

/**
 * Get Anthropic client
 */
async function getAnthropicClient() {
  try {
    const db = getDb();
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['anthropicApiKey']);
    
    if (!row || !row.value || row.value.trim() === '') {
      throw new Error('Anthropic API key not configured');
    }
    
    const apiKey = row.value.trim();
    const client = new Anthropic({ apiKey });
    
    if (!client || !client.messages || !client.messages.create) {
      throw new Error('Failed to create valid Anthropic client');
    }
    
    return client;
  } catch (error) {
    logger.error('Error creating Anthropic client:', error);
    throw error;
  }
}

/**
 * Get OpenAI client
 */
async function getOpenAIClient() {
  try {
    const db = getDb();
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['openaiApiKey']);
    
    if (!row || !row.value || row.value.trim() === '') {
      throw new Error('OpenAI API key not configured');
    }
    
    const apiKey = row.value.trim();
    const client = new OpenAI({ apiKey });
    
    if (!client || !client.chat || !client.chat.completions) {
      throw new Error('Failed to create valid OpenAI client');
    }
    
    return client;
  } catch (error) {
    logger.error('Error creating OpenAI client:', error);
    throw error;
  }
}

/**
 * Get Ollama base URL from config
 */
async function getOllamaBaseUrl() {
  const db = getDb();
  const row = await db.get('SELECT value FROM config WHERE key = ?', ['ollamaBaseUrl']);
  return row?.value?.trim() || 'http://localhost:11434'; // Default Ollama URL
}

/**
 * Get configured model for the current provider from profile preferences or global config
 * @param {string} provider - AI provider name
 * @param {number} profileId - Profile ID to get preferences from
 */
async function getModel(provider, profileId = 2) {
  const db = getDb();
  
  let modelKey;
  switch (provider) {
    case PROVIDERS.ANTHROPIC:
      modelKey = 'claudeModel';
      break;
    case PROVIDERS.OPENAI:
      modelKey = 'openaiModel';
      break;
    case PROVIDERS.OLLAMA:
      modelKey = 'ollamaModel';
      break;
    default:
      modelKey = 'claudeModel';
  }
  
  // Try to get from profile preferences first
  if (profileId) {
    const profileRow = await db.get('SELECT preferences FROM profiles WHERE id = ?', [profileId]);
    if (profileRow && profileRow.preferences) {
      try {
        const prefs = JSON.parse(profileRow.preferences);
        if (prefs[modelKey]) {
          return prefs[modelKey].trim();
        }
      } catch (e) {
        // Invalid JSON, fall through to global config
      }
    }
  }
  
  // Fallback to global config
  const row = await db.get('SELECT value FROM config WHERE key = ?', [modelKey]);
  
  // Default models for each provider
  if (!row || !row.value) {
    switch (provider) {
      case PROVIDERS.ANTHROPIC:
        return 'claude-sonnet-4-5-20250929';
      case PROVIDERS.OPENAI:
        return 'gpt-4o';
      case PROVIDERS.OLLAMA:
        return 'llama3.1';
      default:
        return 'claude-sonnet-4-5-20250929';
    }
  }
  
  return row.value.trim();
}

/**
 * Get configured max tokens from profile preferences or default
 * @param {number} profileId - Profile ID to get preferences from
 */
async function getMaxTokens(profileId = 2) {
  const db = getDb();
  
  // Try to get from profile preferences first
  if (profileId) {
    const profileRow = await db.get('SELECT preferences FROM profiles WHERE id = ?', [profileId]);
    if (profileRow && profileRow.preferences) {
      try {
        const prefs = JSON.parse(profileRow.preferences);
        if (prefs.aiMaxTokens) {
          const maxTokens = parseInt(prefs.aiMaxTokens);
          if (!isNaN(maxTokens)) {
            return Math.min(Math.max(maxTokens, 1000), 8192);
          }
        }
      } catch (e) {
        // Invalid JSON, fall through to global config
      }
    }
  }
  
  // Fallback to global config
  const row = await db.get('SELECT value FROM config WHERE key = ?', ['aiMaxTokens']);
  const maxTokens = row?.value ? parseInt(row.value) : 4096;
  return isNaN(maxTokens) ? 4096 : Math.min(Math.max(maxTokens, 1000), 8192);
}

/**
 * Get configured temperature from profile preferences or default
 * @param {number} profileId - Profile ID to get preferences from
 */
async function getTemperature(profileId = 2) {
  const db = getDb();
  
  // Try to get from profile preferences first
  if (profileId) {
    const profileRow = await db.get('SELECT preferences FROM profiles WHERE id = ?', [profileId]);
    if (profileRow && profileRow.preferences) {
      try {
        const prefs = JSON.parse(profileRow.preferences);
        if (prefs.aiTemperature !== undefined) {
          const temperature = parseFloat(prefs.aiTemperature);
          if (!isNaN(temperature)) {
            return Math.min(Math.max(temperature, 0), 2);
          }
        }
      } catch (e) {
        // Invalid JSON, fall through to global config
      }
    }
  }
  
  // Fallback to global config
  const row = await db.get('SELECT value FROM config WHERE key = ?', ['aiTemperature']);
  const temperature = row?.value ? parseFloat(row.value) : 0.7;
  return isNaN(temperature) ? 0.7 : Math.min(Math.max(temperature, 0), 2);
}

/**
 * Call Anthropic API
 */
async function callAnthropic(messages, systemPrompt = null, maxTokens = null, profileId = 2) {
  const client = await getAnthropicClient();
  const model = await getModel(PROVIDERS.ANTHROPIC, profileId);
  const tokens = maxTokens || await getMaxTokens(profileId);
  
  const params = {
    model,
    max_tokens: tokens,
    messages: messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }))
  };
  
  if (systemPrompt) {
    params.system = systemPrompt;
  }
  
  logger.info(`Calling Anthropic API with model: ${model}, max_tokens: ${tokens}`);
  const response = await client.messages.create(params);
  
  return {
    text: response.content[0].text,
    usage: response.usage,
    model: response.model
  };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(messages, systemPrompt = null, maxTokens = null, profileId = 2) {
  const client = await getOpenAIClient();
  const model = await getModel(PROVIDERS.OPENAI, profileId);
  const tokens = maxTokens || await getMaxTokens(profileId);
  const temperature = await getTemperature(profileId);
  
  const messageArray = [];
  
  if (systemPrompt) {
    messageArray.push({ role: 'system', content: systemPrompt });
  }
  
  messageArray.push(...messages.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content
  })));
  
  logger.info(`Calling OpenAI API with model: ${model}, max_tokens: ${tokens}, temperature: ${temperature}`);
  const response = await client.chat.completions.create({
    model,
    messages: messageArray,
    max_tokens: tokens,
    temperature
  });
  
  return {
    text: response.choices[0].message.content,
    usage: {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens
    },
    model: response.model
  };
}

/**
 * Call Ollama API
 */
async function callOllama(messages, systemPrompt = null, maxTokens = null, profileId = 2) {
  const baseUrl = await getOllamaBaseUrl();
  const model = await getModel(PROVIDERS.OLLAMA, profileId);
  const tokens = maxTokens || await getMaxTokens(profileId);
  const temperature = await getTemperature(profileId);
  
  // Combine system prompt with messages
  const messageArray = [];
  
  if (systemPrompt) {
    messageArray.push({ role: 'system', content: systemPrompt });
  }
  
  messageArray.push(...messages.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content
  })));
  
  logger.info(`Calling Ollama API at ${baseUrl} with model: ${model}, max_tokens: ${tokens}, temperature: ${temperature}`);
  
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: messageArray,
      options: {
        num_predict: tokens,
        temperature
      },
      stream: false
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    text: data.message.content,
    usage: {
      prompt_tokens: data.prompt_eval_count || 0,
      completion_tokens: data.eval_count || 0,
      total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
    },
    model: data.model || model
  };
}

/**
 * Unified AI call function - automatically uses the configured provider
 * @param {Array} messages - Array of message objects
 * @param {string} systemPrompt - Optional system prompt
 * @param {number} maxTokens - Optional max tokens override
 * @param {number} profileId - Profile ID for preferences (default: 2)
 */
async function callAI(messages, systemPrompt = null, maxTokens = null, profileId = 2) {
  const provider = await getAIProvider(profileId);
  
  logger.info(`Using AI provider: ${provider} for profile ${profileId}`);
  
  switch (provider) {
    case PROVIDERS.ANTHROPIC:
      return await callAnthropic(messages, systemPrompt, maxTokens, profileId);
    case PROVIDERS.OPENAI:
      return await callOpenAI(messages, systemPrompt, maxTokens, profileId);
    case PROVIDERS.OLLAMA:
      return await callOllama(messages, systemPrompt, maxTokens, profileId);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/**
 * Generate a response from a single prompt (convenience function)
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - Optional system prompt
 * @param {number} maxTokens - Optional max tokens override
 * @param {number} profileId - Profile ID for preferences (default: 2)
 */
async function generateResponse(prompt, systemPrompt = null, maxTokens = null, profileId = 2) {
  const messages = [{ role: 'user', content: prompt }];
  const result = await callAI(messages, systemPrompt, maxTokens, profileId);
  return result.text;
}

/**
 * Generate meeting notes/recap from transcript content
 * @param {string} transcriptContent - Transcript content
 * @param {number} profileId - Profile ID for AI preferences
 */
async function generateMeetingNotes(transcriptContent, profileId = 2) {
  const systemPrompt = `You are an expert meeting analyst. Generate a comprehensive yet concise meeting recap that captures the key information from the transcript.

Your recap should include:
1. **Meeting Summary** - 2-3 sentence overview of the meeting's purpose and outcome
2. **Key Discussion Points** - Main topics discussed with brief details
3. **Decisions Made** - Any decisions or conclusions reached
4. **Important Context** - Relevant background information, concerns raised, or constraints mentioned
5. **Next Steps** - Actions to be taken (without listing every task - focus on strategic next steps)

Format your response in clean markdown. Be concise but comprehensive. Focus on information someone would want to review later to remember what happened in the meeting.`;

  const userPrompt = `Generate a meeting recap from this transcript:

${transcriptContent}

Provide a well-structured recap following the format requested.`;

  logger.info('Generating meeting notes from transcript');
  
  try {
    const notes = await generateResponse(userPrompt, systemPrompt, 2000, profileId);
    logger.info('Successfully generated meeting notes');
    return notes;
  } catch (error) {
    logger.error('Error generating meeting notes:', error);
    throw error;
  }
}

module.exports = {
  PROVIDERS,
  getAIProvider,
  getModel,
  getMaxTokens,
  callAI,
  generateResponse,
  generateMeetingNotes,
  // Provider-specific functions (for backwards compatibility)
  getAnthropicClient,
  getOpenAIClient,
  getOllamaBaseUrl
};

