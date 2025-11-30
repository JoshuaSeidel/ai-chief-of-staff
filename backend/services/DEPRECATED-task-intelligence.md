# DEPRECATED

This file has been replaced by the microservices architecture.

Old functionality is now distributed across:
- `services/ai-intelligence/` - Effort estimation, energy classification, task clustering (Python/FastAPI)
- `services/pattern-recognition/` - Behavioral insights, pattern analysis (Python/ML)
- `services/nl-parser/` - Natural language task parsing (Python/spaCy)

The backend now acts as an API gateway, proxying requests to specialized microservices.

See `/backend/routes/intelligence.js` for the new proxy routes.
See `MICROSERVICES.md` for complete microservices documentation.
