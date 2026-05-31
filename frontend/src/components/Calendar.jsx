import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  Video,
  X
} from 'lucide-react';
import { calendarAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getEventTitle(event) {
  return event.summary || event.subject || event.title || '(No title)';
}

function getEventStart(event) {
  return event.start || event.startTime || event.startDateTime;
}

function getEventEnd(event) {
  return event.end || event.endTime || event.endDateTime;
}

function isAllDayEvent(event) {
  const start = getEventStart(event);
  return typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start);
}

function parseEventDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateKey(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date) {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
}

function formatDayLabel(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function formatTimeOnly(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatTimeRange(event) {
  if (isAllDayEvent(event)) return 'All day';

  const start = parseEventDate(getEventStart(event));
  const end = parseEventDate(getEventEnd(event));
  if (!start || !end) return 'Time unavailable';
  return `${formatTimeOnly(start)} - ${formatTimeOnly(end)}`;
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getEventDescription(event) {
  return stripHtml(event.description || event.body || event.bodyPreview || '');
}

function buildMonthDays(visibleMonth) {
  const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function Calendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() => getDateKey(new Date()));
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [eventToast, setEventToast] = useState(null);
  
  // Form state
  const [newEvent, setNewEvent] = useState({
    title: '',
    startTime: '',
    endTime: '',
    description: ''
  });

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const response = await calendarAPI.getEvents();
      // Backend returns {source: 'google'|'microsoft'|'none', events: [...], message?: string}
      const data = response.data;
      const eventList = data.events || data || [];
      setEvents(Array.isArray(eventList) ? eventList : []);
      
      // If no calendar is connected, show informational message (not an error)
      if (data.source === 'none' && data.message) {
        setInfoMessage(data.message);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load calendar events';
      setError(errorMessage);
      console.error('Calendar load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadEvents();
  };

  const selectCalendarDay = (day) => {
    setSelectedDateKey(getDateKey(day));

    if (day.getMonth() !== visibleMonth.getMonth() || day.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  };

  const openEventDetails = (event) => {
    const start = parseEventDate(getEventStart(event));
    if (start) setSelectedDateKey(getDateKey(start));
    setSelectedEventId(prev => (prev === event.id ? null : event.id));
    setEventToast(event);
  };

  const handleCreateBlock = async (e) => {
    e.preventDefault();
    
    if (!newEvent.title || !newEvent.startTime || !newEvent.endTime) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      const response = await calendarAPI.createBlock(newEvent);

      if (response.data.icsContent) {
        const icsBlob = new Blob([response.data.icsContent], { type: 'text/calendar' });
        const url = window.URL.createObjectURL(icsBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${newEvent.title.replace(/[^a-z0-9]/gi, '-')}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setSuccessMessage('Calendar block created. The .ics file has been downloaded.');
      } else {
        setSuccessMessage(response.data.message || 'Calendar block created.');
      }

      setShowCreateForm(false);
      setNewEvent({ title: '', startTime: '', endTime: '', description: '' });
      await loadEvents();
      
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create calendar block');
    }
  };

  const getDefaultStartTime = () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);
  };

  const getDefaultEndTime = () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 2);
    return now.toISOString().slice(0, 16);
  };

  const sortedEvents = useMemo(() => {
    if (!Array.isArray(events)) return [];

    return [...events].sort((a, b) => {
      const startA = parseEventDate(getEventStart(a))?.getTime() || 0;
      const startB = parseEventDate(getEventStart(b))?.getTime() || 0;
      return startA - startB;
    });
  }, [events]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    sortedEvents.forEach(event => {
      const start = parseEventDate(getEventStart(event));
      if (!start) return;
      const key = getDateKey(start);
      const dayEvents = grouped.get(key) || [];
      dayEvents.push(event);
      grouped.set(key, dayEvents);
    });
    return grouped;
  }, [sortedEvents]);

  const monthDays = useMemo(() => buildMonthDays(visibleMonth), [visibleMonth]);

  const groupEventsByDate = () => {
    const grouped = {};
    sortedEvents.forEach(event => {
      const start = parseEventDate(getEventStart(event));
      if (!start) return;
      const dateKey = getDateKey(start);
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });
    return grouped;
  };

  const groupedEvents = groupEventsByDate();
  const todayKey = getDateKey(new Date());
  const selectedDay = parseEventDate(selectedDateKey) || new Date();
  const selectedDayEvents = eventsByDate.get(selectedDateKey) || [];
  const eventToastDescription = eventToast ? getEventDescription(eventToast) : '';
  const eventToastLink = eventToast?.webLink || eventToast?.htmlLink;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="calendar calendar-page">
        <div className="card calendar-board-card">
          <div className="calendar-board-header">
            <div>
              <span className="page-eyebrow"><CalendarDays size={15} /> Calendar</span>
              <h2 className="mt-0 mb-0">{formatMonthLabel(visibleMonth)}</h2>
            </div>

            <div className="calendar-toolbar">
              <button
                onClick={() => setVisibleMonth(new Date())}
                className="glass-button calendar-today-button"
              >
                Today
              </button>
              <div className="calendar-month-nav" aria-label="Month navigation">
                <button
                  onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
                  className="glass-button btn-icon-square"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
                  className="glass-button btn-icon-square"
                  aria-label="Next month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <button
                onClick={loadEvents}
                disabled={loading}
                className="glass-button btn-icon-square"
                aria-label="Refresh events"
              >
                <RefreshCw size={16} className={loading ? 'icon-spin' : ''} />
              </button>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="glass-button-primary btn-icon-square"
                aria-label={showCreateForm ? 'Close create form' : 'Create time block'}
              >
                {showCreateForm ? <X size={16} /> : <Plus size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="calendar-error-box">
              <strong>Error:</strong> {error}
              {error.includes('not configured') && (
                <p className="text-md-mt-sm">
                  Go to Configuration tab to set up your iCloud calendar URL.
                </p>
              )}
            </div>
          )}

          {infoMessage && (
            <div className="calendar-info-box">
              <strong>{infoMessage}</strong>
            </div>
          )}

          {successMessage && (
            <div className="calendar-success-box">
              {successMessage}
            </div>
          )}

          {showCreateForm && (
            <div className="calendar-form-box">
              <h3 className="mt-0">Create Time Block</h3>
              <form onSubmit={handleCreateBlock}>
                <label className="form-label-block">
                  Title *
                </label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="Focus Time, Deep Work, etc."
                  required
                />

                <div className="grid-2col">
                  <div>
                    <label className="form-label-block">
                      Start Time *
                    </label>
                    <input
                      type="datetime-local"
                      value={newEvent.startTime || getDefaultStartTime()}
                      onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label-block">
                      End Time *
                    </label>
                    <input
                      type="datetime-local"
                      value={newEvent.endTime || getDefaultEndTime()}
                      onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <label className="form-label-block">
                  Description (Optional)
                </label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Add notes or context..."
                  rows="3"
                  className="resize-vertical"
                />

                <button type="submit" className="mt-sm">
                  Create & Download .ics File
                </button>
              </form>
            </div>
          )}

          <div className="calendar-month-grid" role="grid" aria-label={`${formatMonthLabel(visibleMonth)} calendar`}>
            {WEEKDAYS.map(day => (
              <div key={day} className="calendar-weekday" role="columnheader">
                {day}
              </div>
            ))}

            {monthDays.map(day => {
              const dateKey = getDateKey(day);
              const dayEvents = eventsByDate.get(dateKey) || [];
              const inMonth = day.getMonth() === visibleMonth.getMonth();
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDateKey;
              const visibleEvents = dayEvents.slice(0, 2);

              return (
                <div
                  key={dateKey}
                  className={`calendar-day-cell ${inMonth ? '' : 'outside-month'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                  role="gridcell"
                  tabIndex={0}
                  aria-selected={isSelected}
                  aria-label={`${formatDayLabel(day)}${dayEvents.length ? `, ${dayEvents.length} events` : ''}`}
                  onClick={() => selectCalendarDay(day)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectCalendarDay(day);
                    }
                  }}
                >
                  <div className="calendar-day-number">{day.getDate()}</div>
                  <div className="calendar-day-events">
                    {visibleEvents.map(event => (
                      <button
                        key={`${event.id}-${getEventStart(event)}`}
                        type="button"
                        className="calendar-event-chip"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          openEventDetails(event);
                        }}
                        title={`${getEventTitle(event)} ${formatTimeRange(event)}`}
                      >
                        <span className="calendar-event-chip-time">{formatTimeRange(event).split(' - ')[0]}</span>
                        <span className="calendar-event-chip-title">{getEventTitle(event)}</span>
                      </button>
                    ))}
                    {dayEvents.length > visibleEvents.length && (
                      <span className="calendar-more-events">+{dayEvents.length - visibleEvents.length}</span>
                    )}
                  </div>
                  {dayEvents.length > 0 && (
                    <div className="calendar-event-markers" aria-hidden="true">
                      {dayEvents.slice(0, 3).map(event => (
                        <span key={`${event.id}-${getEventStart(event)}-dot`} />
                      ))}
                      {dayEvents.length > 3 && <strong>{dayEvents.length}</strong>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="calendar-mobile-day-panel" aria-live="polite">
            <div className="calendar-mobile-day-heading">
              <span>{formatDayLabel(selectedDay)}</span>
              <strong>{selectedDayEvents.length ? `${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? '' : 's'}` : 'No events'}</strong>
            </div>

            {selectedDayEvents.length > 0 ? (
              <div className="calendar-mobile-event-list">
                {selectedDayEvents.map(event => (
                  <button
                    key={`${event.id}-${getEventStart(event)}-mobile`}
                    type="button"
                    className="calendar-mobile-event"
                    onClick={() => openEventDetails(event)}
                  >
                    <span className="calendar-mobile-event-time">{formatTimeRange(event).split(' - ')[0]}</span>
                    <span className="calendar-mobile-event-title">{getEventTitle(event)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="calendar-mobile-empty">Tap another date to check its schedule.</p>
            )}
          </div>
        </div>

        <div className="card calendar-agenda-card">
          <div className="calendar-section-header">
            <div>
              <span className="page-eyebrow"><Clock3 size={15} /> Agenda</span>
              <h2>Upcoming Events</h2>
            </div>
            <span className="calendar-event-count">{sortedEvents.length} visible</span>
          </div>

          {loading && (
            <div className="text-center p-xl text-gray">
              <p>Loading calendar events...</p>
            </div>
          )}

          {!loading && sortedEvents.length === 0 && !error && (
            <div className="empty-state">
              <div className="empty-icon"><CalendarDays size={28} /></div>
              <p>No upcoming events found.</p>
              {error && error.includes('not configured') ? (
                <p className="text-sm-gray-mt-sm">
                  Configure your calendar URL in the Configuration tab to see events.
                </p>
              ) : (
                <p className="text-sm-gray-mt-sm">
                  Create a time block or check your calendar configuration.
                </p>
              )}
            </div>
          )}

          {!loading && sortedEvents.length > 0 && (
            <div className="calendar-agenda-list">
              {Object.keys(groupedEvents).map((dateKey) => (
                <section key={dateKey} className="calendar-agenda-day">
                  <h3 className="calendar-date-header">
                    {formatDayLabel(parseEventDate(dateKey))}
                  </h3>

                  {groupedEvents[dateKey].map((event) => {
                    const expanded = selectedEventId === event.id;
                    const description = getEventDescription(event);

                    return (
                      <button
                        key={`${event.id}-${getEventStart(event)}`}
                        type="button"
                        className={`calendar-agenda-event ${expanded ? 'expanded' : ''}`}
                        onClick={() => openEventDetails(event)}
                        aria-expanded={expanded}
                      >
                        <span className="calendar-agenda-time">{formatTimeRange(event)}</span>
                        <span className="calendar-agenda-main">
                          <span className="calendar-agenda-title">{getEventTitle(event)}</span>
                          <span className="calendar-agenda-meta">
                            {event.location && (
                              <span><MapPin size={13} /> {event.location}</span>
                            )}
                            {event.isOnlineMeeting && (
                              <span><Video size={13} /> Online</span>
                            )}
                          </span>
                          {expanded && (
                            <span className="calendar-agenda-details">
                              {description && <span>{description}</span>}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </div>

        {eventToast && createPortal((
          <div className="calendar-event-toast" role="dialog" aria-live="polite" aria-label="Calendar event details">
            <div className="calendar-event-toast-header">
              <div>
                <span className="page-eyebrow"><CalendarDays size={14} /> Event</span>
                <h3>{getEventTitle(eventToast)}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEventToast(null)}
                className="calendar-event-toast-close"
                aria-label="Close event details"
              >
                <X size={16} />
              </button>
            </div>
            <div className="calendar-event-toast-body">
              <p><Clock3 size={15} /> {formatDayLabel(parseEventDate(getEventStart(eventToast)))} · {formatTimeRange(eventToast)}</p>
              {eventToast.location && <p><MapPin size={15} /> {eventToast.location}</p>}
              {eventToast.isOnlineMeeting && <p><Video size={15} /> Online meeting</p>}
              {eventToastDescription && <p className="calendar-event-toast-description">{eventToastDescription}</p>}
              {eventToastLink && (
                <button
                  type="button"
                  className="calendar-event-toast-link"
                  onClick={() => window.open(eventToastLink, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink size={14} />
                  Open in calendar
                </button>
              )}
            </div>
          </div>
        ), document.body)}
      </div>
    </PullToRefresh>
  );
}

export default Calendar;
