# AI Chief of Staff Application

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

### CSS Architecture
- **USE CSS CLASSES ONLY** - No inline styles in JSX components (except for truly dynamic values like transform calculations, animation delays, or conditional colors based on runtime data)
- All styling belongs in `frontend/src/index.css`
- Build reusable utility classes for common patterns before writing new styles
- Check existing CSS classes before creating new ones - we have 100+ utility classes available

### Allowed Inline Styles (Exceptions Only)
- Dynamic transforms: `style={{ transform: 'translateY(...)' }}`
- Animation delays: `style={{ animationDelay: '0.5s' }}`
- Progress percentages: `style={{ width: '${progress}%' }}`
- Conditional colors from API data: `style={{ backgroundColor: statusColor }}`
- **DO NOT** use inline styles for static layouts, spacing, typography, or anything that can be a CSS class

### CSS Class Naming
- Semantic names: `.task-card`, `.brief-content`, `.insights-widget`
- Component-specific: `.transcript-table-row`, `.deliverables-table`
- Utility classes: `.flex`, `.gap-md`, `.mt-lg`, `.text-center`
- State variants: `.btn-primary`, `.btn-secondary`, `.message-error`, `.message-success`
- Markdown elements: `.md-h1`, `.md-h2`, `.md-p`, `.md-strong`, `.md-table`

### Mobile-First Responsive Design
- Base styles for mobile (min 320px width)
- Desktop styles in `@media (min-width: 769px)` queries
- Touch targets minimum 44px for iOS (Apple HIG)
- Font-size minimum 16px on inputs to prevent iOS zoom
- Test on both mobile and desktop viewports

### CSS Quality Rules
- **NEVER** use `!important` - fix specificity instead
- **NEVER** use attribute selectors like `input[type="text"]` - use classes
- Prefer flexbox and grid for layouts
- Use CSS custom properties for theme colors (when implemented)
- Keep specificity low - avoid deep nesting
- Group related styles together in index.css with comments

### Before Writing New Styles
1. Check if a utility class already exists (`.flex`, `.gap-*`, `.mt-*`, `.mb-*`, `.text-*`)
2. Check if a component class exists (`.task-card`, `.form-box`, `.stat-box`)
3. If creating new classes, make them reusable across components
4. Add clear section comments in index.css for discoverability
