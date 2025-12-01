import React, { useState, useEffect } from 'react';
import { calendarAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';

function Calendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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
    try {
      const response = await calendarAPI.getEvents();
      // Backend returns {source: 'google'|'icloud', events: [...]}
      const data = response.data;
      const eventList = data.events || data || [];
      setEvents(Array.isArray(eventList) ? eventList : []);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>📅 Calendar</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={loadEvents} 
              disabled={loading}
              className="glass-button"
              style={{ 
                minWidth: '44px',
                width: '44px',
                height: '44px',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem'
              }}
            >
              {loading ? '⏳' : '🔄'}
            </button>
            <button 
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="glass-button-primary"
              style={{ 
                minWidth: '44px',
                width: '44px',
                height: '44px',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem'
              }}
            >
              {showCreateForm ? '✕' : '➕'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ 
            backgroundColor: '#ffe5e5', 
            color: '#d70015', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1rem' 
          }}>
            <strong>Error:</strong> {error}
            {error.includes('not configured') && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                Go to Configuration tab to set up your iCloud calendar URL.
              </p>
            )}
          </div>
        )}

        {successMessage && (
          <div style={{ 
            backgroundColor: '#e5ffe5', 
            color: '#00a000', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1rem' 
          }}>
            {successMessage}
          </div>
        )}

        {showCreateForm && (
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '1.5rem', 
            borderRadius: '8px', 
            marginBottom: '1.5rem',
            border: '1px solid #3f3f46'
          }}>
            <h3 style={{ marginTop: 0 }}>Create Time Block</h3>
            <form onSubmit={handleCreateBlock}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Title *
              </label>
              <input
                type="text"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="Focus Time, Deep Work, etc."
                required
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
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
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
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

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Description (Optional)
              </label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                placeholder="Add notes or context..."
                rows="3"
                style={{ resize: 'vertical' }}
              />

              <button type="submit" style={{ marginTop: '0.5rem' }}>
                Create & Download .ics File
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Upcoming Events</h2>
        
        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6e6e73' }}>
            <p>Loading calendar events...</p>
          </div>
        )}

        {!loading && events.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6e6e73' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📅</div>
            <p>No upcoming events found.</p>
            {error && error.includes('not configured') ? (
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Configure your calendar URL in the Configuration tab to see events.
              </p>
            ) : (
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Create a time block or check your calendar configuration.
              </p>
            )}
          </div>
        )}

        {!loading && events.length > 0 && (
          <div>
            {Object.keys(groupedEvents).map((dateKey) => (
              <div key={dateKey} style={{ marginBottom: '2rem' }}>
                <h3 style={{ 
                  fontSize: '1rem', 
                  color: '#60a5fa', 
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #3f3f46'
                }}>
                  {formatDate(new Date(dateKey))}
                </h3>
                
                {groupedEvents[dateKey].map((event) => (
                  <div 
                    key={event.id} 
                    style={{ 
                      backgroundColor: '#18181b',
                      padding: '1rem',
                      borderRadius: '8px',
                      marginBottom: '0.75rem',
                      border: '1px solid #3f3f46'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ 
                          fontSize: '1rem', 
                          marginBottom: '0.25rem',
                          color: '#e4e4e7'
                        }}>
                          {event.summary}
                        </h4>
                        <p style={{ 
                          fontSize: '0.9rem', 
                          color: '#a1a1aa',
                          marginBottom: '0.5rem'
                        }}>
                          ⏰ {formatTime(event.start)} - {formatTime(event.end)}
                        </p>
                        {event.location && (
                          <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
                            📍 {event.location}
                          </p>
                        )}
                        {event.description && (
                          <p style={{ 
                            fontSize: '0.85rem', 
                            color: '#a1a1aa',
                            marginTop: '0.5rem',
                            whiteSpace: 'pre-wrap'
                          }}>
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
        <ul style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: '1.8' }}>
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

