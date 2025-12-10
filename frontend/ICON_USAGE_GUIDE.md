# Icon Component Usage Guide

The Icon component provides a comprehensive SVG icon system for the AI Chief of Staff application.

## Import

```jsx
import { Icon } from './components/common';
// or
import { Icon, ICON_NAMES } from './components/common/Icon';
```

## Basic Usage

```jsx
<Icon name="dashboard" />
<Icon name="tasks" size="lg" />
<Icon name="settings" size="sm" className="custom-class" />
```

## Props

- **name** (required): The icon name (see Available Icons below)
- **size** (optional): Icon size - `xs` (12px), `sm` (16px), `md` (20px - default), `lg` (24px), `xl` (32px)
- **className** (optional): Additional CSS classes
- **...props**: Any additional props are passed to the span wrapper

## Available Icons

### Navigation & Main Sections
- `dashboard` - Chart/analytics icon for Dashboard
- `transcripts` - Document with text for Transcripts
- `tasks` - Checklist icon for Tasks
- `calendar` - Calendar icon
- `ai` / `robot` - Robot/AI icon for AI Tools
- `settings` - Gear icon for Settings

### Actions
- `check` - Checkmark
- `close` / `x` - X/close icon
- `trash` - Trash can for delete
- `plus` - Plus sign for add/create
- `edit` / `pencil` - Edit/pencil icon
- `prompts` - Edit icon for prompts
- `undo` - Undo arrow
- `refresh` - Refresh/reload

### Files & Documents
- `file` - Generic file
- `folder` - Folder
- `download` - Download arrow
- `upload` - Upload arrow

### User & Profile
- `user` - User profile icon
- `bell` - Notifications bell

### Status & Info
- `info` - Information circle
- `warning` - Warning triangle
- `error` - Error circle with X
- `checkCircle` - Success checkmark in circle
- `dot` - Status dot (filled circle)

### Navigation Arrows
- `chevronUp` - Up arrow
- `chevronDown` - Down arrow
- `chevronLeft` - Left arrow
- `chevronRight` - Right arrow

### Utilities
- `link` - Chain link for integrations
- `search` - Magnifying glass
- `clock` - Clock/time
- `loading` - Animated spinner (has spin animation)
- `brain` - Brain/intelligence icon

## Usage Examples

### In Buttons
```jsx
import { Button } from './components/common';
import { Icon } from './components/common';

<Button icon={<Icon name="plus" size="sm" />}>
  Add Task
</Button>

<Button icon={<Icon name="trash" size="sm" />} variant="error">
  Delete
</Button>
```

### In Navigation
```jsx
const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <Icon name="dashboard" /> },
  { id: 'transcripts', label: 'Transcripts', icon: <Icon name="transcripts" /> },
  { id: 'tasks', label: 'Tasks', icon: <Icon name="tasks" /> },
  { id: 'calendar', label: 'Calendar', icon: <Icon name="calendar" /> },
  { id: 'intelligence', label: 'AI Tools', icon: <Icon name="ai" /> },
  { id: 'config', label: 'Settings', icon: <Icon name="settings" /> }
];
```

### In Settings Tabs
```jsx
const SETTINGS_TABS = [
  { id: 'ai', label: 'AI Provider', icon: <Icon name="robot" /> },
  { id: 'integrations', label: 'Integrations', icon: <Icon name="link" /> },
  { id: 'prompts', label: 'Prompts', icon: <Icon name="prompts" /> },
  { id: 'profiles', label: 'Profiles', icon: <Icon name="user" /> },
  { id: 'notifications', label: 'Notifications', icon: <Icon name="bell" /> },
  { id: 'system', label: 'System', icon: <Icon name="settings" /> }
];
```

### Loading State
```jsx
<Icon name="loading" size="lg" />
// The loading icon automatically spins via CSS animation
```

### Custom Styling
```jsx
// Icons inherit currentColor, so you can style them via color:
<span style={{ color: '#ef4444' }}>
  <Icon name="warning" />
</span>

// Or with CSS classes:
<Icon name="check" className="text-success" />
```

## Style Features

- **currentColor**: Icons use `currentColor` for stroke/fill, so they inherit the text color of their parent
- **Default stroke-width**: 2px for optimal visibility on dark backgrounds
- **Viewbox**: All icons use 24x24 viewBox for consistency
- **Dark theme optimized**: Icons are designed to work well on the dark glassmorphism theme

## Migration from Emojis

When replacing emoji icons, use these mappings:

| Emoji | Icon Name |
|-------|-----------|
| 📊 | `dashboard` |
| 📝 | `transcripts` or `prompts` |
| 📋 | `tasks` |
| 📅 | `calendar` |
| 🤖 | `ai` or `robot` |
| ⚙️ | `settings` |
| ✅ | `check` or `checkCircle` |
| ❌ | `close` or `error` |
| 🗑️ | `trash` |
| ➕ | `plus` |
| 🔗 | `link` |
| 🔔 | `bell` |
| 👤 | `user` |
| ✏️ | `edit` or `pencil` |
| ⚠️ | `warning` |
| ℹ️ | `info` |
| ⏱️ | `clock` |
| 🗄️ | `folder` |

## Adding New Icons

To add a new icon, edit `src/components/common/Icon.jsx` and add a new entry to the `ICONS` object:

```jsx
const ICONS = {
  // ... existing icons ...

  newIcon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* SVG paths here */}
    </svg>
  ),
};
```

**Icon Design Guidelines:**
- Use 24x24 viewBox
- Use `stroke="currentColor"` for line icons
- Use `fill="currentColor"` for solid icons
- strokeWidth should be 1.5-2 for consistency
- Use strokeLinecap="round" and strokeLinejoin="round" for smoother appearance
