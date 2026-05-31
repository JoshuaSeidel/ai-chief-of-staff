import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  DownloadCloud,
  ExternalLink,
  Filter,
  Inbox,
  Loader2,
  Mail,
  Radio,
  RefreshCw,
  Search,
  Users
} from 'lucide-react';
import { intakeAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { Badge } from './common/Badge';

const LIMIT_OPTIONS = [10, 25, 50];

function formatDateTime(value) {
  if (!value) return 'Unknown';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatPerson(person) {
  return person?.name || person?.address || 'Unknown';
}

function getDefaultRange() {
  const now = new Date();
  const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function EmptyPanel({ icon: Icon, title }) {
  return (
    <div className="intake-empty">
      <Icon size={24} aria-hidden="true" />
      <span>{title}</span>
    </div>
  );
}

function EmailRow({ message, processing, disabled, onProcess }) {
  return (
    <article className="intake-row">
      <span className="intake-select intake-select-placeholder" aria-hidden="true" />
      <div className="intake-row-icon" aria-hidden="true">
        <Mail size={18} />
      </div>
      <div className="intake-row-main">
        <div className="intake-row-heading">
          <h3>{message.subject}</h3>
          <span>{formatDateTime(message.receivedDateTime)}</span>
        </div>
        <div className="intake-meta">
          <span>{formatPerson(message.from)}</span>
          {message.importance && message.importance !== 'normal' && (
            <Badge variant="warning" size="sm">{message.importance}</Badge>
          )}
          {!message.isRead && <Badge variant="info" size="sm">Unread</Badge>}
        </div>
        {message.bodyPreview && <p>{message.bodyPreview}</p>}
      </div>
      <div className="intake-row-actions">
        {message.webLink && (
          <a className="icon-button" href={message.webLink} target="_blank" rel="noreferrer" title="Open in Microsoft 365">
            <ExternalLink size={16} />
          </a>
        )}
        <button className="btn-primary btn-sm" onClick={() => onProcess(message.id)} disabled={processing || disabled}>
          {processing ? <Loader2 className="spin" size={15} /> : <DownloadCloud size={15} />}
          Process
        </button>
      </div>
    </article>
  );
}

function MeetingRow({ meeting, selected, processing, disabled, onToggle, onProcess }) {
  const start = meeting.start?.dateTime || meeting.start;

  return (
    <article className="intake-row">
      <label className="intake-select" title="Select meeting">
        <input type="checkbox" checked={selected} onChange={() => onToggle(meeting.id)} />
        <span />
      </label>
      <div className="intake-row-icon" aria-hidden="true">
        <CalendarCheck size={18} />
      </div>
      <div className="intake-row-main">
        <div className="intake-row-heading">
          <h3>{meeting.subject}</h3>
          <span>{formatDateTime(start)}</span>
        </div>
        <div className="intake-meta">
          <span>{formatPerson(meeting.organizer)}</span>
          <span><Users size={13} /> {meeting.attendeeCount || 0}</span>
          {meeting.isOnlineMeeting && <Badge variant="success" size="sm" icon={Radio}>Online</Badge>}
          {meeting.hasTeamsJoinUrl && <Badge variant="info" size="sm">Teams</Badge>}
        </div>
        {meeting.bodyPreview && <p>{meeting.bodyPreview}</p>}
      </div>
      <div className="intake-row-actions">
        {meeting.webLink && (
          <a className="icon-button" href={meeting.webLink} target="_blank" rel="noreferrer" title="Open in Microsoft 365">
            <ExternalLink size={16} />
          </a>
        )}
        <button className="btn-primary btn-sm" onClick={() => onProcess(meeting.id)} disabled={processing || disabled}>
          {processing ? <Loader2 className="spin" size={15} /> : <DownloadCloud size={15} />}
          Process
        </button>
      </div>
    </article>
  );
}

function EmailIntake() {
  const toast = useToast();
  const defaultRange = useMemo(getDefaultRange, []);
  const [activeSource, setActiveSource] = useState('email');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(25);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [range, setRange] = useState(defaultRange);
  const [messages, setMessages] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [selectedMeetings, setSelectedMeetings] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState(null);
  const [connectionWarning, setConnectionWarning] = useState(null);

  const applyConnectionState = (data, collectionKey) => {
    if (data.connected === false) {
      setConnectionWarning(data.message || 'Microsoft 365 is not connected.');
      return [];
    }

    setConnectionWarning(null);
    return data[collectionKey] || [];
  };

  const loadEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await intakeAPI.getEmailMessages({ limit, unreadOnly, query });
      setMessages(applyConnectionState(response.data, 'messages'));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load email');
    } finally {
      setLoading(false);
    }
  };

  const loadMeetings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await intakeAPI.getMeetings({
        limit,
        query,
        start: range.start,
        end: range.end
      });
      setMeetings(applyConnectionState(response.data, 'meetings'));
      setSelectedMeetings(new Set());
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load meetings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSource === 'email') {
      loadEmail();
    } else {
      loadMeetings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]);

  const refresh = () => {
    if (activeSource === 'email') loadEmail();
    else loadMeetings();
  };

  const processEmail = async (id) => {
    setProcessingId(id);
    try {
      const response = await intakeAPI.processEmailMessage(id);
      toast.success(response.data.message || 'Email queued for processing');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Unable to process email');
    } finally {
      setProcessingId(null);
    }
  };

  const processMeeting = async (id) => {
    setProcessingId(id);
    try {
      const response = await intakeAPI.processMeeting(id);
      toast.success(response.data.message || 'Meeting queued for processing');
      if (response.data.capture?.warnings?.length && !response.data.capture?.usedTeamsTranscript) {
        toast.warning('Meeting imported from calendar. Teams capture is not available for this meeting.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Unable to process meeting');
    } finally {
      setProcessingId(null);
    }
  };

  const syncEmail = async () => {
    setProcessingId('email-sync');
    try {
      const response = await intakeAPI.syncEmailMessages({ limit: 10, unreadOnly: true, query });
      toast.success(`Queued ${response.data.imported || 0} emails`);
      await loadEmail();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Unable to sync email');
    } finally {
      setProcessingId(null);
    }
  };

  const importSelectedMeetings = async () => {
    const ids = [...selectedMeetings];
    if (ids.length === 0) return;

    setProcessingId('meeting-import');
    try {
      const response = await intakeAPI.importMeetings(ids);
      const teamsCount = (response.data.results || []).filter(result => result.capture?.usedTeamsTranscript).length;
      toast.success(`Queued ${response.data.imported || 0} meetings${teamsCount ? `, including ${teamsCount} Teams transcripts` : ''}`);
      if (response.data.failed > 0) {
        const firstFailure = (response.data.results || []).find(result => result.failed);
        toast.warning(firstFailure?.message || `${response.data.failed} meetings could not be imported`);
      }
      setSelectedMeetings(new Set());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Unable to import meetings');
    } finally {
      setProcessingId(null);
    }
  };

  const toggleMeeting = (id) => {
    setSelectedMeetings(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeCount = activeSource === 'email' ? messages.length : meetings.length;
  const intakeDisabled = Boolean(connectionWarning);

  return (
    <div className="email-intake">
      <div className="intake-command card">
        <div className="intake-command-head">
          <div>
            <span className="page-eyebrow"><Inbox size={15} /> Intake</span>
            <h2>Email & Meeting Intake</h2>
          </div>
          <div className="segmented-control">
            <button className={activeSource === 'email' ? 'active' : ''} onClick={() => setActiveSource('email')}>
              <Mail size={15} />
              Email
            </button>
            <button className={activeSource === 'meetings' ? 'active' : ''} onClick={() => setActiveSource('meetings')}>
              <CalendarCheck size={15} />
              Meetings
            </button>
          </div>
        </div>

        <div className="intake-toolbar">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              onKeyDown={(e) => {
                if (e.key === 'Enter') refresh();
              }}
            />
          </label>

          <label className="select-field">
            <Filter size={15} aria-hidden="true" />
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {LIMIT_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          {activeSource === 'email' ? (
            <label className="toggle-field">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              <span>Unread</span>
            </label>
          ) : (
            <div className="date-range-fields">
              <label>
                <Clock3 size={14} />
                <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
              </label>
              <label>
                <Clock3 size={14} />
                <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
              </label>
            </div>
          )}

          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>

        <div className="intake-stats">
          <Badge variant="info" icon={activeSource === 'email' ? Mail : CalendarCheck}>
            {activeCount} visible
          </Badge>
          {activeSource === 'email' ? (
            <button className="btn-primary btn-sm" onClick={syncEmail} disabled={intakeDisabled || processingId === 'email-sync'}>
              {processingId === 'email-sync' ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />}
              Process unread
            </button>
          ) : (
            <button
              className="btn-primary btn-sm"
              onClick={importSelectedMeetings}
              disabled={intakeDisabled || selectedMeetings.size === 0 || processingId === 'meeting-import'}
            >
              {processingId === 'meeting-import' ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />}
              Process selected
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="message-error">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss error">Dismiss</button>
        </div>
      )}

      {connectionWarning && (
        <div className="message-error message-warning">
          <span><AlertCircle size={16} /> {connectionWarning}</span>
          <button onClick={() => { window.location.hash = '#config'; }} aria-label="Open settings">Settings</button>
        </div>
      )}

      <div className="intake-list card">
        {loading ? (
          <EmptyPanel icon={Loader2} title="Loading" />
        ) : activeSource === 'email' ? (
          messages.length > 0 ? messages.map(message => (
            <EmailRow
              key={message.id}
              message={message}
              processing={processingId === message.id}
              disabled={intakeDisabled}
              onProcess={processEmail}
            />
          )) : <EmptyPanel icon={Mail} title="No email found" />
        ) : (
          meetings.length > 0 ? meetings.map(meeting => (
            <MeetingRow
              key={meeting.id}
              meeting={meeting}
              selected={selectedMeetings.has(meeting.id)}
              processing={processingId === meeting.id}
              disabled={intakeDisabled}
              onToggle={toggleMeeting}
              onProcess={processMeeting}
            />
          )) : <EmptyPanel icon={CalendarCheck} title="No meetings found" />
        )}
      </div>
    </div>
  );
}

export default EmailIntake;
