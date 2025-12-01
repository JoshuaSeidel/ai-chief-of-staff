# UI/UX Styling Guide

## Quick Rules

### ✅ DO
```jsx
// Use CSS classes
<div className="flex gap-md items-center">
  <h2 className="md-h2">Title</h2>
  <button className="btn-primary">Action</button>
</div>

// Dynamic values only
<div style={{ width: `${progress}%` }}>
<div style={{ transform: `translateY(${distance}px)` }}>
<div style={{ backgroundColor: statusColor }}>
```

### ❌ DON'T
```jsx
// NO static inline styles
<div style={{ display: 'flex', gap: '1rem' }}>  ❌
<h2 style={{ color: '#60a5fa' }}>  ❌
<button style={{ padding: '0.5rem 1rem' }}>  ❌
```

## Available Utility Classes

### Layout
```css
.flex                    /* display: flex */
.grid                    /* display: grid */
.grid-2col              /* 2-column grid */
.items-center           /* align-items: center */
.justify-between        /* justify-content: space-between */
.gap-sm, .gap-md, .gap-lg  /* flex/grid gap */
```

### Spacing
```css
.mt-sm, .mt-md, .mt-lg, .mt-xl     /* margin-top */
.mb-sm, .mb-md, .mb-lg, .mb-xl     /* margin-bottom */
.mt-neg-sm                          /* negative margin-top */
.mr-sm                              /* margin-right */
.p-lg, .p-xl                        /* padding */
```

### Typography
```css
.text-sm, .text-md, .text-lg       /* font sizes */
.text-center                        /* text-align: center */
.text-muted                         /* muted gray color */
.text-success, .text-warning, .text-error
.text-success-bold, .text-primary-sm
```

### Buttons
```css
.btn                     /* base button */
.btn-primary            /* primary action */
.btn-secondary          /* secondary action */
.btn-danger             /* destructive action */
.btn-filter             /* filter button */
```

### Forms
```css
.form-box                  /* form container */
.form-label-block         /* block label */
.input-full               /* full-width input */
.textarea-mono            /* monospace textarea */
```

### Cards & Containers
```css
.card                      /* card container */
.task-card                 /* task card */
.task-card-dark           /* dark task variant */
.task-card-overdue        /* overdue task */
.stat-box                 /* statistics box */
.info-box-success         /* success message */
.info-box-primary         /* info message */
.message-error            /* error message */
```

### Tables
```css
.table-full                /* full-width table */
.table-scroll              /* scrollable table wrapper */
.table-cell-left          /* left-aligned cell */
.table-cell-right         /* right-aligned cell */
.transcript-table-row     /* transcript row */
.transcript-table-cell    /* transcript cell */
```

### Markdown Elements
```css
.md-h1, .md-h2, .md-h3    /* markdown headings */
.md-strong                 /* bold text */
.md-em                     /* italic text */
.md-list                   /* ul/ol */
.md-li                     /* list item */
.md-p                      /* paragraph */
.md-table                  /* table */
.md-thead, .md-tr, .md-th, .md-td
```

### Special
```css
.empty-state               /* empty state message */
.loading                   /* loading indicator */
.error                     /* error container */
.resize-vertical          /* vertical resize */
.brief-content            /* brief content area */
.insights-widget          /* insights display */
```

## When to Use Inline Styles

### Allowed Cases
1. **Progress/Percentage**: `style={{ width: `${progress}%` }}`
2. **Transform calculations**: `style={{ transform: `translateY(${dist}px)` }}`
3. **Animation delays**: `style={{ animationDelay: '0.5s' }}`
4. **Conditional colors from API**: `style={{ backgroundColor: apiColor }}`

### Forbidden Cases
- Static layouts (flex, grid, etc.)
- Static spacing (margin, padding)
- Static typography (color, size, weight)
- Static borders, backgrounds, shadows
- **Everything else** - create a CSS class

## Creating New CSS Classes

### 1. Check Existing Classes First
Search `frontend/src/index.css` for similar patterns:
```bash
grep -i "flex" frontend/src/index.css
grep -i "button" frontend/src/index.css
```

### 2. Name Semantically
- Component-specific: `.task-card-header`, `.brief-section`
- Utility: `.flex-center`, `.mt-lg`
- State: `.btn-disabled`, `.message-success`

### 3. Add to Appropriate Section
```css
/* === MY COMPONENT === */
.my-component {
  /* base styles */
}

.my-component-title {
  /* specific element */
}

/* Responsive */
@media (min-width: 769px) {
  .my-component {
    /* desktop overrides */
  }
}
```

## Mobile-First Approach

```css
/* Base (mobile) */
.flex {
  display: flex;
  flex-direction: column;  /* Stack on mobile */
  gap: 0.5rem;
}

/* Desktop */
@media (min-width: 769px) {
  .flex {
    flex-direction: row;   /* Side-by-side on desktop */
    gap: 1rem;
  }
}
```

## Common Patterns

### Button Row
```jsx
<div className="flex gap-sm items-center">
  <button className="btn-primary">Save</button>
  <button className="btn-secondary">Cancel</button>
</div>
```

### Form Field
```jsx
<div className="form-box">
  <label className="form-label-block">Field Name</label>
  <input type="text" className="input-full" />
</div>
```

### Card with Header
```jsx
<div className="card">
  <h2 className="mt-0 mb-md">Title</h2>
  <div className="flex gap-md">
    {/* content */}
  </div>
</div>
```

### Table
```jsx
<table className="table-full">
  <thead>
    <tr>
      <th className="table-cell-left">Name</th>
      <th className="table-cell-right">Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr className="transcript-table-row">
      <td className="transcript-table-cell">Data</td>
      <td className="transcript-table-cell-right">
        <button className="btn-secondary">Edit</button>
      </td>
    </tr>
  </tbody>
</table>
```

### Markdown Content
```jsx
<ReactMarkdown
  components={{
    h1: ({node, ...props}) => <h1 className="md-h1" {...props} />,
    h2: ({node, ...props}) => <h2 className="md-h2" {...props} />,
    p: ({node, ...props}) => <p className="md-p" {...props} />,
    strong: ({node, ...props}) => <strong className="md-strong" {...props} />,
  }}
>
  {content}
</ReactMarkdown>
```

## Quality Checklist

Before committing:
- [ ] No inline styles (except allowed exceptions)
- [ ] Used existing CSS classes where possible
- [ ] Created reusable classes if new patterns needed
- [ ] Mobile-first responsive design
- [ ] No `!important` declarations
- [ ] No attribute selectors
- [ ] Touch targets ≥ 44px
- [ ] Input font-size ≥ 16px (prevents iOS zoom)
- [ ] Build succeeds: `npm run build`

## Reference

- Full utility class list: `frontend/src/index.css`
- Component examples: `frontend/src/components/`
- Mobile breakpoint: `769px`
- Dark theme: `#1a1a1a` background, `#27272a` cards
