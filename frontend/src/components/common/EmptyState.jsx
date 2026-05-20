import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Link2,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Upload,
  XCircle
} from 'lucide-react';
import { Button } from './Button';

const ILLUSTRATIONS = {
  tasks: ClipboardList,
  transcripts: FileText,
  calendar: CalendarDays,
  insights: BarChart3,
  search: Search,
  error: XCircle,
  success: CheckCircle2,
  welcome: Sparkles,
  rocket: Rocket,
  lightbulb: Sparkles
};

const ACTION_ICONS = {
  plus: <Plus size={16} />,
  upload: <Upload size={16} />,
  link: <Link2 size={16} />,
  refresh: <RefreshCw size={16} />,
  alert: <AlertTriangle size={16} />,
  rocket: <Rocket size={16} />
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
  const Illustration = typeof illustration === 'function' ? illustration : null;

  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state-icon">
        {Illustration ? <Illustration size={30} strokeWidth={1.9} /> : illustration}
      </div>
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
      actionIcon={ACTION_ICONS.plus}
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
      actionIcon={ACTION_ICONS.upload}
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
      actionIcon={ACTION_ICONS.link}
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
      actionIcon={ACTION_ICONS.rocket}
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
      actionIcon={ACTION_ICONS.refresh}
    />
  );
}

export default EmptyState;
