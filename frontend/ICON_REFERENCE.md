# AI Chief of Staff - Icon System Reference

## Complete Icon Library (38 Icons)

### Main Navigation Icons (6)
```jsx
<Icon name="dashboard" />    // 📊 Dashboard - Chart/analytics
<Icon name="transcripts" />  // 📝 Transcripts - Document with text
<Icon name="tasks" />         // 📋 Tasks - Checklist
<Icon name="calendar" />      // 📅 Calendar - Calendar grid
<Icon name="ai" />            // 🤖 AI Tools - Robot (same as robot)
<Icon name="robot" />         // 🤖 Robot - Robot/AI icon
```

### Settings Icons (7)
```jsx
<Icon name="settings" />      // ⚙️ Settings - Gear
<Icon name="user" />          // 👤 User - User profile
<Icon name="bell" />          // 🔔 Notifications - Bell
<Icon name="link" />          // 🔗 Integrations - Chain link
<Icon name="prompts" />       // 📝 Prompts - Pencil/document
<Icon name="edit" />          // ✏️ Edit - Pencil/document
<Icon name="pencil" />        // ✏️ Pencil - Pencil only
```

### Action Icons (10)
```jsx
<Icon name="check" />         // ✅ Check - Checkmark
<Icon name="checkCircle" />   // ✅ Check Circle - Checkmark in circle
<Icon name="close" />         // ❌ Close - X mark (same as x)
<Icon name="x" />             // ❌ X - X mark
<Icon name="trash" />         // 🗑️ Trash - Trash can
<Icon name="plus" />          // ➕ Plus - Plus sign
<Icon name="refresh" />       // 🔄 Refresh - Circular arrows
<Icon name="undo" />          // ↩️ Undo - Undo arrow
<Icon name="download" />      // ⬇️ Download - Download arrow
<Icon name="upload" />        // ⬆️ Upload - Upload arrow
```

### Status & Info Icons (5)
```jsx
<Icon name="info" />          // ℹ️ Info - Information circle
<Icon name="warning" />       // ⚠️ Warning - Warning triangle
<Icon name="error" />         // ❌ Error - Error circle with X
<Icon name="clock" />         // ⏱️ Clock - Clock/time
<Icon name="dot" />           // • Dot - Status indicator (filled circle)
```

### Navigation Chevrons (4)
```jsx
<Icon name="chevronUp" />     // ▲ Chevron Up
<Icon name="chevronDown" />   // ▼ Chevron Down
<Icon name="chevronLeft" />   // ◀ Chevron Left
<Icon name="chevronRight" />  // ▶ Chevron Right
```

### Files & Documents (3)
```jsx
<Icon name="file" />          // 📄 File - Generic file
<Icon name="folder" />        // 📁 Folder - Folder
<Icon name="search" />        // 🔍 Search - Magnifying glass
```

### Special Icons (3)
```jsx
<Icon name="loading" />       // ⏳ Loading - Animated spinner
<Icon name="brain" />         // 🧠 Brain - Intelligence/AI
```

---

## Size Options

```jsx
<Icon name="tasks" size="xs" />  // 12px
<Icon name="tasks" size="sm" />  // 16px
<Icon name="tasks" size="md" />  // 20px (default)
<Icon name="tasks" size="lg" />  // 24px
<Icon name="tasks" size="xl" />  // 32px
```

---

## Common Usage Patterns

### Button Icons
```jsx
import { Button, Icon } from './components/common';

// Primary action
<Button icon={<Icon name="plus" size="sm" />} variant="primary">
  Add Task
</Button>

// Delete action
<Button icon={<Icon name="trash" size="sm" />} variant="error">
  Delete
</Button>

// Confirm action
<Button icon={<Icon name="check" size="sm" />} variant="success">
  Confirm
</Button>

// Reject action
<Button icon={<Icon name="close" size="sm" />} variant="error">
  Reject
</Button>
```

### Navigation Items
```jsx
const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <Icon name="dashboard" /> },
  { id: 'transcripts', label: 'Transcripts', icon: <Icon name="transcripts" /> },
  { id: 'tasks', label: 'Tasks', icon: <Icon name="tasks" /> },
  { id: 'calendar', label: 'Calendar', icon: <Icon name="calendar" /> },
  { id: 'intelligence', label: 'AI Tools', icon: <Icon name="ai" /> },
  { id: 'config', label: 'Settings', icon: <Icon name="settings" /> }
];

// Render
{navItems.map(item => (
  <button key={item.id}>
    <span className="nav-icon" aria-hidden="true">
      {item.icon}
    </span>
    <span className="nav-label">{item.label}</span>
  </button>
))}
```

### Settings Tabs
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

### Status Indicators
```jsx
// Overdue warning
<div className="text-error">
  <Icon name="warning" size="sm" /> Overdue
</div>

// Completed status
<div className="text-success">
  <Icon name="checkCircle" size="sm" /> Completed
</div>

// Info message
<div className="text-info">
  <Icon name="info" size="sm" /> Information
</div>
```

### Loading States
```jsx
// Loading button
<Button disabled icon={<Icon name="loading" size="sm" />}>
  Processing...
</Button>

// Loading card
<div className="loading-state">
  <Icon name="loading" size="xl" />
  <p>Loading data...</p>
</div>
```

---

## Emoji to Icon Migration Map

| Emoji | Icon Name | Usage |
|-------|-----------|-------|
| 📊 | `dashboard` | Dashboard/analytics |
| 📝 | `transcripts` or `prompts` | Documents/notes |
| 📋 | `tasks` | Tasks/checklists |
| 📅 | `calendar` | Calendar/dates |
| 🤖 | `ai` or `robot` | AI/automation |
| ⚙️ | `settings` | Settings/config |
| ✅ | `check` or `checkCircle` | Confirm/success |
| ❌ | `close` or `error` | Reject/error |
| 🗑️ | `trash` | Delete |
| ➕ | `plus` | Add/create |
| 🔗 | `link` | Integrations/links |
| 🔔 | `bell` | Notifications |
| 👤 | `user` | User/profile |
| ✏️ | `edit` or `pencil` | Edit |
| ⚠️ | `warning` | Warning/alert |
| ℹ️ | `info` | Information |
| ⏱️ | `clock` | Time/duration |
| 📁 | `folder` | Folder/directory |
| 📄 | `file` | File/document |
| 🔍 | `search` | Search |
| 🧠 | `brain` | Intelligence/AI |
| ↩️ | `undo` | Undo/revert |
| 🔄 | `refresh` | Refresh/reload |

---

## Styling

Icons inherit `currentColor`, so they automatically match the text color:

```jsx
// Red error icon
<span className="text-error">
  <Icon name="error" />
</span>

// Green success icon
<span className="text-success">
  <Icon name="check" />
</span>

// Custom color
<span style={{ color: '#f59e0b' }}>
  <Icon name="warning" />
</span>
```

---

## Implementation Details

**Location**: `/frontend/src/components/common/Icon.jsx`

**Features**:
- ✅ 38 professionally designed SVG icons
- ✅ 5 size options (xs, sm, md, lg, xl)
- ✅ currentColor support for easy theming
- ✅ Optimized for dark glassmorphism theme
- ✅ Stroke-width: 2px for visibility
- ✅ Smooth rounded corners (strokeLinecap/strokeLinejoin: round)
- ✅ Consistent 24x24 viewBox
- ✅ TypeScript-friendly with ICON_NAMES export
- ✅ Warning console message for invalid icon names
- ✅ Loading icon with automatic spin animation

**CSS Location**: `/frontend/src/styles/components.css` (lines 1495-1551)

**Export**: Available via `import { Icon } from './components/common'`
