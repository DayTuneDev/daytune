import React, { useState, useEffect } from 'react';
import { Task, BlockedTime, Tooltip } from '../types/shared';

interface CalendarEvent {
  id: string;
  start: Date;
  end: Date;
  title: string;
  color?: string;
  cssClass?: string;
  isBackground?: boolean;
}

interface WeeklyCalendarProps {
  tasks: Task[];
  blockedTimes?: BlockedTime[];
}

const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({ tasks, blockedTimes = [] }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tooltip, setTooltip] = useState<Tooltip>({ open: false, text: '', x: 0, y: 0 });

  const handleEventMouseEnter = (data: CalendarEvent, ev: React.MouseEvent<HTMLDivElement>) => {
    if (data.isBackground) {
      const start = data.start instanceof Date ? data.start : new Date(data.start);
      const end = data.end instanceof Date ? data.end : new Date(data.end);
      const format = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setTooltip({
        open: true,
        text: `${data.title}: ${format(start)} – ${format(end)}`,
        x: ev.clientX,
        y: ev.clientY,
      });
    }
  };

  const handleEventMouseLeave = () => setTooltip({ open: false, text: '', x: 0, y: 0 });

  useEffect(() => {
    // Only include tasks with a valid start time
    const formatted: CalendarEvent[] = (tasks || [])
      .filter((task: Task) => task.start_datetime || (task.start_date && task.start_time))
      .map((task: Task) => {
        let start;
        if (task.start_datetime) {
          start = new Date(task.start_datetime);
        } else {
          return null;
        }
        const end = new Date(start.getTime() + (task.duration_minutes || 60) * 60000);
        return {
          id: task.id,
          start,
          end,
          title: task.title,
          color: '#1A237E',
          cssClass: 'daytune-event',
        } as CalendarEvent;
      })
      .filter((e): e is CalendarEvent => e !== null);
    // Add blocked times as background events
    const blockedEvents: CalendarEvent[] = (blockedTimes || []).map((block: BlockedTime) => ({
      id: `blocked-${block.title}-${block.start}`,
      start: block.start,
      end: block.end,
      title: block.title,
      color: block.title === 'Sleep' ? '#b3c6f7' : '#b3e0f7',
      cssClass: block.title === 'Sleep' ? 'daytune-blocked-sleep' : 'daytune-blocked-work',
      isBackground: true,
    } as CalendarEvent));
    setEvents([...formatted, ...blockedEvents]);
  }, [tasks, blockedTimes]);

  return (
    <div style={{
      background: '#f8fafc',
      borderRadius: '18px',
      boxShadow: '0 2px 12px rgba(60,60,60,0.07)',
      padding: '24px',
      margin: '2rem auto',
      maxWidth: '1100px',
      height: '1000px',
      overflow: 'auto',
    }}>
      <h3 style={{ margin: '0 0 1rem 0', color: '#1A237E', fontWeight: 700, fontSize: '1.3rem' }}>
        📅 Weekly Schedule
      </h3>
      <div
        style={{
          borderRadius: '10px',
          background: '#e3eafe',
          color: '#1A237E',
          padding: '4px 8px',
          fontWeight: 500,
          fontSize: '1rem',
          pointerEvents: 'auto',
          position: 'relative',
        }}
        onMouseEnter={(ev) => handleEventMouseEnter({
          id: 'event',
          title: 'Event',
          start: new Date(),
          end: new Date(),
          isBackground: true,
        }, ev)}
        onMouseLeave={handleEventMouseLeave}
      >
        {events.map((e) => e.title).join(', ')}
      </div>
      {tooltip.open && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            background: '#fff',
            color: '#1A237E',
            border: '1px solid #b3c6f7',
            borderRadius: '8px',
            padding: '8px 14px',
            zIndex: 9999,
            boxShadow: '0 2px 8px rgba(60,60,60,0.12)',
            pointerEvents: 'none',
            fontWeight: 500,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};

export default WeeklyCalendar;
