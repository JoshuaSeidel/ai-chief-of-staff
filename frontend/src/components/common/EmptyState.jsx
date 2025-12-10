import React from 'react';
import { Button } from './Button';

const ILLUSTRATIONS = {
  tasks: '📋',
  transcripts: '📝',
  calendar: '📅',
  insights: '📊',
  search: '🔍',
  error: '❌',
  success: '✅',
  welcome: '👋',
  rocket: '🚀',
  lightbulb: '💡'
};

export function EmptyState({
  icon = 'tasks',
  title,
  description,
  action,
  actionText,
  actionIcon,
  secondaryAction,
  secondaryActionText,
  className = ''
}) {
  const illustration = ILLUSTRATIONS[icon] || icon;

  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state-icon">{illustration}</div>
      {title && <h3 className="empty-state-title">{title}</h3>}
      {description && <p className="empty-state-description">{description}</p>}
      {(action || secondaryAction) && (
        <div className="empty-state-actions">
          {action && (
            <Button onClick={action} icon={actionIcon}>
              {actionText}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="secondary" onClick={secondaryAction}>
              {secondaryActionText}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function NoTasksEmpty({ onCreateTask }) {
  return (
    <EmptyState
      icon="tasks"
      title="No tasks found"
      description="Upload transcripts to automatically extract commitments, or create a task manually."
      action={onCreateTask}
      actionText="Create Task"
      actionIcon="➕"
    />
  );
}

export function NoTranscriptsEmpty({ onUpload }) {
  return (
    <EmptyState
      icon="transcripts"
      title="No transcripts yet"
      description="Upload meeting recordings or paste transcript text to get started."
      action={onUpload}
      actionText="Upload Transcript"
      actionIcon="📤"
    />
  );
}

export function NoCalendarEventsEmpty({ onConnect }) {
  return (
    <EmptyState
      icon="calendar"
      title="No calendar events"
      description="Connect your calendar to see upcoming events and schedule tasks."
      action={onConnect}
      actionText="Connect Calendar"
      actionIcon="🔗"
    />
  );
}

export function NoInsightsEmpty() {
  return (
    <EmptyState
      icon="insights"
      title="Not enough data yet"
      description="Complete some tasks to see your productivity patterns and insights."
    />
  );
}

export function WelcomeEmpty({ onGetStarted }) {
  return (
    <EmptyState
      icon="welcome"
      title="Welcome to AI Chief of Staff!"
      description="Your AI-powered productivity assistant. Let's get you set up."
      action={onGetStarted}
      actionText="Get Started"
      actionIcon="🚀"
    />
  );
}

export function SearchEmpty({ query }) {
  return (
    <EmptyState
      icon="search"
      title="No results found"
      description={query ? `No matches for "${query}". Try a different search term.` : 'Enter a search term to find tasks, transcripts, or events.'}
    />
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <EmptyState
      icon="error"
      title="Something went wrong"
      description={message || "We couldn't load this content. Please try again."}
      action={onRetry}
      actionText="Try Again"
      actionIcon="🔄"
    />
  );
}

export default EmptyState;
