# Voice Processor Service

Audio transcription service using OpenAI Whisper API.

## Features

- **Audio Transcription**: Convert speech to text with high accuracy
- **Multi-language Support**: Automatic language detection or specify language
- **Timestamp Support**: Word-level timestamps for video sync
- **Translation**: Translate any language audio to English
- **Caching**: Redis caching to reduce API costs (1hr TTL)
- **Format Support**: mp3, mp4, mpeg, mpga, m4a, wav, webm

## API Endpoints

### POST /transcribe

Transcribe audio file to text.

**Request:**
```bash
curl -X POST http://localhost:8004/transcribe \
  -F "file=@meeting.mp3" \
  -F "language=en" \
  -F "temperature=0.0"
```

**Response:**
```json
{
  "text": "This is the transcribed text...",
  "language": "en",
  "duration": 125.5,
  "cached": false
}
```

**Parameters:**
- `file` (required): Audio file (max 25MB)
- `language` (optional): ISO language code (e.g., "en", "es", "fr")
- `prompt` (optional): Context to improve accuracy
- `temperature` (optional): 0.0-1.0, controls randomness (default: 0.0)

### POST /transcribe-with-timestamps

Get transcription with word-level timestamps.

**Request:**
```bash
curl -X POST http://localhost:8004/transcribe-with-timestamps \
  -F "file=@meeting.mp3" \
  -F "language=en"
```

**Response:**
```json
{
  "text": "This is the transcribed text...",
  "language": "en",
  "duration": 125.5,
  "words": [
    {"word": "This", "start": 0.0, "end": 0.5},
    {"word": "is", "start": 0.5, "end": 0.8}
  ]
}
```

### POST /translate

Translate audio from any language to English.

**Request:**
```bash
curl -X POST http://localhost:8004/translate \
  -F "file=@spanish_meeting.mp3"
```

**Response:**
```json
{
  "text": "Translated text in English...",
  "target_language": "en"
}
```

### GET /supported-formats

Get list of supported audio formats and capabilities.

**Response:**
```json
{
  "formats": ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"],
  "max_file_size_mb": 25,
  "models": ["whisper-1"],
  "languages": "all (automatic detection)",
  "features": [
    "transcription",
    "translation",
    "timestamps",
    "language_detection"
  ]
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "voice-processor",
  "openai_configured": true,
  "redis_connected": true
}
```

## Environment Variables

- `OPENAI_API_KEY` (required): OpenAI API key
- `REDIS_URL` (optional): Redis connection URL (default: redis://redis:6379)

## Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export OPENAI_API_KEY=sk-your-key-here
export REDIS_URL=redis://localhost:6379

# Run service
uvicorn main:app --reload --port 8004
```

## Docker

```bash
# Build
docker build -t voice-processor .

# Run
docker run -p 8004:8004 \
  -e OPENAI_API_KEY=sk-your-key \
  -e REDIS_URL=redis://redis:6379 \
  voice-processor
```

## Integration Example

```javascript
// Node.js backend integration
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function transcribeAudio(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('language', 'en');
  
  const response = await axios.post(
    'http://voice-processor:8004/transcribe',
    form,
    { headers: form.getHeaders() }
  );
  
  return response.data.text;
}
```

## Performance

- **Transcription Speed**: ~1/10 of audio duration (10min audio = ~1min processing)
- **Accuracy**: 95%+ for clear audio in supported languages
- **Caching**: Identical files return instantly from cache
- **Cost**: ~$0.006 per minute of audio

## Supported Languages

Whisper supports 99+ languages including:
- English, Spanish, French, German, Italian, Portuguese
- Chinese, Japanese, Korean, Arabic, Hindi, Russian
- And many more...

Full list: https://platform.openai.com/docs/guides/speech-to-text

## Error Handling

- **413**: File too large (>25MB)
- **503**: OpenAI API key not configured
- **502**: OpenAI API error
- **400**: Invalid file format or corrupted audio

## Tips for Best Results

1. **Clear Audio**: Reduce background noise
2. **Proper Format**: Use mp3 or m4a for best compatibility
3. **Language Hint**: Specify language when known
4. **Context Prompt**: Provide context for technical terms
5. **File Size**: Split large files if >25MB

## Limitations

- Max file size: 25MB
- Supported formats only (no .wma, .flac, etc.)
- Audio only (no video processing)
- English translation only (no other target languages)

## License

Part of AI Chief of Staff project
