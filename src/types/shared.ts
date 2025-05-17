// Task type
export interface Task {
  id: string;
  title: string;
  start_datetime?: string;
  earliest_start_datetime?: string;
  due_datetime?: string;
  due_date?: string;
  due_time?: string;
  start_date?: string;
  start_time?: string;
  scheduling_type: 'fixed' | 'flexible' | 'preferred';
  category?: string;
  duration_minutes: number;
  importance: number;
  difficulty: number;
  tag?: string;
  status?: string;
  [key: string]: any;
}

// BlockedTime type
export interface BlockedTime {
  start: Date;
  end: Date;
  title: string;
  scheduling_type?: string;
  is_blocked?: boolean;
}

// Tooltip type
export interface Tooltip {
  open: boolean;
  text: string;
  x: number;
  y: number;
}

// FullCalendarEvent type (minimal, extend as needed)
export interface FullCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor?: string | undefined;
  borderColor?: string | undefined;
  textColor?: string | undefined;
  display?: string | undefined;
  extendedProps?: Record<string, any>;
} 