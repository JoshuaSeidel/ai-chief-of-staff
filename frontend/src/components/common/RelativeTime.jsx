import React, { useState, useEffect } from 'react';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(date) {
  if (!date) return 'No date';

  const now = new Date();
  const target = new Date(date);
  const diff = target - now;
  const absDiff = Math.abs(diff);
  const isPast = diff < 0;

  // Today check
  const isToday = target.toDateString() === now.toDateString();
  if (isToday) {
    return 'Today';
  }

  // Yesterday/Tomorrow
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (target.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  if (target.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }

  // Relative times
  if (absDiff < HOUR) {
    const minutes = Math.round(absDiff / MINUTE);
    if (minutes < 1) return 'Just now';
    return isPast ? `${minutes}m ago` : `in ${minutes}m`;
  }

  if (absDiff < DAY) {
    const hours = Math.round(absDiff / HOUR);
    return isPast ? `${hours}h ago` : `in ${hours}h`;
  }

  if (absDiff < WEEK) {
    const days = Math.round(absDiff / DAY);
    return isPast ? `${days}d ago` : `in ${days}d`;
  }

  if (absDiff < MONTH) {
    const weeks = Math.round(absDiff / WEEK);
    return isPast ? `${weeks}w ago` : `in ${weeks}w`;
  }

  if (absDiff < YEAR) {
    const months = Math.round(absDiff / MONTH);
    return isPast ? `${months}mo ago` : `in ${months}mo`;
  }

  // Fall back to formatted date
  return target.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: target.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

export function formatDate(dateString) {
  if (!dateString) return 'No deadline';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RelativeTime({
  date,
  showTooltip = true,
  prefix = '',
  suffix = '',
  className = ''
}) {
  const [, setTick] = useState(0);

  // Update every minute for live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!date) return null;

  const relative = formatRelativeTime(date);
  const absolute = formatDate(date);

  return (
    <span
      className={`relative-time ${className}`}
      title={showTooltip ? absolute : undefined}
    >
      {prefix}{relative}{suffix}
    </span>
  );
}

export function DeadlineTime({ date, className = '' }) {
  if (!date) return <span className="deadline-none">No deadline</span>;

  const now = new Date();
  const target = new Date(date);
  const isPast = target < now;
  const isToday = target.toDateString() === now.toDateString();

  let statusClass = '';
  if (isPast) statusClass = 'deadline-overdue';
  else if (isToday) statusClass = 'deadline-today';

  return (
    <RelativeTime
      date={date}
      prefix="📅 "
      className={`deadline-time ${statusClass} ${className}`}
    />
  );
}

export default RelativeTime;
