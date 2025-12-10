import React, { useState, useEffect } from 'react';
import { calendarAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';

function Calendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  
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

  const handleCreateBlock = async (e) => {
    e.preventDefault();
    
    if (!newEvent.title || !newEvent.startTime || !newEvent.endTime) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      const response = await calendarAPI.createBlock(newEvent);
      
      // Trigger download of ICS file
      const icsBlob = new Blob([response.data.icsContent], { type: 'text/calendar' });
      const url = window.URL.createObjectURL(icsBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${newEvent.title.replace(/[^a-z0-9]/gi, '-')}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setSuccessMessage('Calendar block created! The .ics file has been downloaded. Import it into your calendar app.');
      setShowCreateForm(false);
      setNewEvent({ title: '', startTime: '', endTime: '', description: '' });
      
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create calendar block');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
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

  const groupEventsByDate = () => {
    const grouped = {};
    if (!Array.isArray(events)) {
      return grouped;
    }
    events.forEach(event => {
      const dateKey = new Date(event.start).toDateString();
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });
    return grouped;
  };

  const groupedEvents = groupEventsByDate();

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="calendar">
      <div className="card">
        <div className="flex justify-between items-center mb-md gap-md flex-wrap">
          <h2 className="mt-0 mb-0">📅 Calendar</h2>
          <div className="flex gap-sm items-center">
            <button 
              onClick={loadEvents} 
              disabled={loading}
              className="glass-button btn-icon-square"
            >
              {loading ? '⏳' : '🔄'}
            </button>
            <button 
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="glass-button-primary btn-icon-square"
            >
              {showCreateForm ? '✕' : '➕'}
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
            <strong>ℹ️ {infoMessage}</strong>
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
      </div>

      <div className="card">
        <h2>Upcoming Events</h2>
        
        {loading && (
          <div className="text-center p-xl text-gray">
            <p>Loading calendar events...</p>
          </div>
        )}

        {!loading && events.length === 0 && !error && (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
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

        {!loading && events.length > 0 && (
          <div>
            {Object.keys(groupedEvents).map((dateKey) => (
              <div key={dateKey} className="mb-xl">
                <h3 className="calendar-date-header">
                  {formatDate(new Date(dateKey))}
                </h3>

                {groupedEvents[dateKey].map((event) => (
                  <div key={event.id} className="calendar-event-card">
                    <div className="task-layout">
                      <div className="flex-1">
                        <h4 className="calendar-event-title">
                          {event.summary}
                        </h4>
                        <p className="calendar-event-time">
                          ⏰ {formatTime(event.start)} - {formatTime(event.end)}
                        </p>
                        {event.location && (
                          <p className="text-sm text-muted">
                            📍 {event.location}
                          </p>
                        )}
                        {event.description && (
                          <p className="calendar-event-description">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>💡 Tips</h2>
        <ul className="text-sm text-muted" style={{ lineHeight: '1.8' }}>
          <li>Create time blocks for focus time, meetings, and deep work</li>
          <li>Download the .ics file and import it into any calendar app</li>
          <li>Configure your iCloud calendar URL to see upcoming events</li>
          <li>Events are automatically filtered to show next 2 months</li>
        </ul>
      </div>
      </div>
    </PullToRefresh>
  );
}

export default Calendar;

