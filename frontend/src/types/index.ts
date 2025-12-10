/**
 * Shared TypeScript Types for AI Chief of Staff
 *
 * This file contains the core domain types used throughout the application.
 * Import types from here rather than defining them inline.
 */

// =============================================================================
// Profile Types
// =============================================================================

export interface Profile {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Task / Commitment Types
// =============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskType = 'commitment' | 'deliverable' | 'question' | 'note';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  id: number;
  profile_id: number;
  description: string;
  source_text?: string;
  type: TaskType;
  status: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  due_time?: string;
  created_at: string;
  updated_at: string;
  confirmed?: boolean;
  source_transcript_id?: number;
  embedding_id?: string;
  cluster_id?: string;
  energy_classification?: string;
  effort_estimate?: number;
  external_sync?: ExternalSync;
}

export interface ExternalSync {
  microsoft_planner?: {
    task_id: string;
    bucket_id?: string;
    synced_at: string;
  };
  jira?: {
    issue_key: string;
    project_key: string;
    synced_at: string;
  };
  trello?: {
    card_id: string;
    list_id?: string;
    synced_at: string;
  };
  monday?: {
    item_id: string;
    board_id: string;
    synced_at: string;
  };
}

export interface TaskCluster {
  cluster_id: string;
  cluster_label: string;
  tasks: Task[];
  centroid?: number[];
}

// =============================================================================
// Transcript Types
// =============================================================================

export interface Transcript {
  id: number;
  profile_id: number;
  filename: string;
  content: string;
  meeting_title?: string;
  meeting_date?: string;
  participants?: string[];
  processed_at: string;
  created_at: string;
  commitments_count?: number;
}

export interface TranscriptProcessingResult {
  transcript_id: number;
  commitments: Task[];
  meeting_notes?: string;
  summary?: string;
}

// =============================================================================
// Calendar Types
// =============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  all_day?: boolean;
  location?: string;
  attendees?: Attendee[];
  source: 'google' | 'microsoft' | 'radicale';
  source_id?: string;
}

export interface Attendee {
  email: string;
  name?: string;
  response_status?: 'accepted' | 'declined' | 'tentative' | 'needs_action';
}

// =============================================================================
// AI Provider Types
// =============================================================================

export type AIProvider = 'anthropic' | 'openai' | 'ollama' | 'bedrock';

export interface AIProviderConfig {
  provider: AIProvider;
  api_key?: string;
  model?: string;
  base_url?: string;
  region?: string; // for Bedrock
}

export interface AIModelInfo {
  id: string;
  name: string;
  provider: AIProvider;
  context_window?: number;
  supports_vision?: boolean;
}

// =============================================================================
// Integration Types
// =============================================================================

export interface IntegrationStatus {
  connected: boolean;
  last_sync?: string;
  error?: string;
}

export interface IntegrationConfig {
  enabled: boolean;
  credentials?: Record<string, string>;
  settings?: Record<string, unknown>;
}

// =============================================================================
// Daily Brief Types
// =============================================================================

export interface DailyBrief {
  id: number;
  profile_id: number;
  date: string;
  content: string;
  tasks_summary?: TasksSummary;
  calendar_summary?: string;
  insights?: string[];
  generated_at: string;
}

export interface TasksSummary {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  by_priority: Record<TaskPriority, number>;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// =============================================================================
// UI Component Types
// =============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

// =============================================================================
// Notification Types
// =============================================================================

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

// =============================================================================
// Pattern Recognition Types
// =============================================================================

export interface BehavioralPattern {
  pattern_type: string;
  description: string;
  confidence: number;
  occurrences: number;
  first_seen: string;
  last_seen: string;
}

export interface InsightSuggestion {
  type: 'optimization' | 'warning' | 'recommendation';
  title: string;
  description: string;
  actionable: boolean;
  action?: {
    label: string;
    handler: string;
  };
}

// =============================================================================
// Voice Processing Types
// =============================================================================

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  words?: TranscriptionWord[];
  duration?: number;
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}
