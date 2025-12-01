# VS Code Development Instructions

## AI Chief of Staff Application

This is a React-based web application with Node.js/Express backend that automates personal productivity by:
- Ingesting meeting transcripts and emails
- Using Claude AI to generate actionable daily briefs
- Tracking commitments and priorities
- Maintaining rolling 2-week context window
- Creating calendar blocks for iCloud calendar

## Tech Stack
- Frontend: React with modern hooks
- Backend: Node.js with Express
- Database: SQLite for storing context
- AI: Anthropic Claude API
- Calendar: iCloud calendar integration
- Deployment: Docker container

## Project Structure
- `/backend` - Express API server
- `/frontend` - React dashboard application
- `/docker` - Docker configuration files

## Development Guidelines
- Keep components focused and reusable
- Use environment variables for sensitive data (API keys)
- Maintain clean separation between frontend and backend
- Follow REST API conventions for endpoints

## Styling Convention
- **USE CSS CLASSES ONLY** - No inline styles in JSX components
- All styling belongs in `frontend/src/index.css`
- Mobile-first approach: base styles for mobile, `@media (min-width: 769px)` for desktop
- Semantic class names (`.model-selector`, `.task-card`, `.refresh-button`)
- NO `!important` declarations - fix specificity instead
- Touch targets minimum 44px for iOS (Apple HIG)
- Font-size minimum 16px on inputs to prevent iOS zoom
