import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Eventcalendar, setOptions, Toast, Popup } from '@mobiscroll/react';
import '@mobiscroll/react/dist/css/mobiscroll.min.css';

setOptions({
  theme: 'material',
  themeVariant: 'light'
});

const calendarContainerStyle = {
  background: '#f8fafc',
  borderRadius: '18px',
  boxShadow: '0 2px 12px rgba(60,60,60,0.07)',
  padding: '24px',
  margin: '2rem auto',
  maxWidth: '1100px',
  height: '1000px',
  overflow: 'auto'
};

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

const WeeklyCalendar = ({ tasks, blockedTimes = [] }) => {
  const [events, setEvents] = useState([]);
  const [isToastOpen, setToastOpen] = useState(false);
  const [toastText, setToastText] = useState('');
  const [tooltip, setTooltip] = useState({ open: false, text: '', x: 0, y: 0 });

  const view = useMemo(() => ({
    schedule: {
      type: 'week',
      startDay: 0,
      endDay: 6,
      startTime: '00:00',
      endTime: '24:00',
      allDay: false,
      scrollable: 'vertical',
      scrollToTime: '06:00',
    }
  }), []);

  const handleEventClick = useCallback((args) => {
    setToastText(args.event.title);
    setToastOpen(true);
  }, []);

  const handleCloseToast = useCallback(() => {
    setToastOpen(false);
  }, []);

  const handleEventMouseEnter = (data, ev) => {
    if (data.isBackground) {
      const start = data.start instanceof Date ? data.start : new Date(data.start);
      const end = data.end instanceof Date ? data.end : new Date(data.end);
      const format = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setTooltip({
        open: true,
        text: `${data.title}: ${format(start)} – ${format(end)}`,
        x: ev.clientX,
        y: ev.clientY
      });
    }
  };
  const handleEventMouseLeave = () => setTooltip({ open: false, text: '', x: 0, y: 0 });

  useEffect(() => {
    // Only include tasks with a valid start time
    const formatted = (tasks || [])
      .filter(task => task.start_datetime || (task.start_date && task.start_time))
      .map((task) => {
        let start;
        if (task.start_datetime) {
          start = new Date(task.start_datetime);
        } else {
          return null;
        }
        const end = new Date(start.getTime() + (task.duration_minutes || 60) * 60000);
        return {
          start,
          end,
          title: task.title,
          color: '#1A237E',
          cssClass: 'daytune-event'
        };
      })
      .filter(Boolean);
    // Add blocked times as background events
    const blockedEvents = (blockedTimes || []).map((block) => ({
      start: block.start,
      end: block.end,
      title: block.title,
      color: block.title === 'Sleep' ? '#b3c6f7' : '#b3e0f7',
      cssClass: block.title === 'Sleep' ? 'daytune-blocked-sleep' : 'daytune-blocked-work',
      isBackground: true
    }));
    setEvents([...formatted, ...blockedEvents]);
  }, [tasks, blockedTimes]);

  return (
    <div style={calendarContainerStyle}>
      <h3 style={{ margin: '0 0 1rem 0', color: '#1A237E', fontWeight: 700, fontSize: '1.3rem' }}>
        📅 Weekly Schedule
      </h3>
      <Eventcalendar
        data={events}
        view={view}
        clickToCreate={false}
        dragToCreate={false}
        dragToMove={true}
        dragToResize={true}
        onEventClick={handleEventClick}
        height='100%'
        renderScheduleEventContent={(data) => (
          <div
            style={{
              borderRadius: '10px',
              background: data.isBackground ? (data.cssClass === 'daytune-blocked-sleep' ? '#b3c6f7' : '#b3e0f7') : '#e3eafe',
              color: data.isBackground ? '#1A237E' : '#1A237E',
              opacity: data.isBackground ? 0.5 : 1,
              padding: '4px 8px',
              fontWeight: 500,
              fontSize: '1rem',
              pointerEvents: data.isBackground ? 'auto' : 'auto',
              position: 'relative',
            }}
            onMouseEnter={data.isBackground ? (ev) => handleEventMouseEnter(data, ev) : undefined}
            onMouseLeave={data.isBackground ? handleEventMouseLeave : undefined}
          >
            {data.title}
          </div>
        )}
      />
      {tooltip.open && (
        <div style={{
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
        }}>
          {tooltip.text}
        </div>
      )}
      <Toast message={toastText} isOpen={isToastOpen} onClose={handleCloseToast} />
      <style>
        {`
          .mbsc-schedule-event-daytune-event {
            border-radius: 10px !important;
            background: #e3eafe !important;
            color: #1A237E !important;
            box-shadow: 0 2px 8px rgba(60,60,60,0.07);
          }
          .mbsc-schedule-event-daytune-blocked-sleep {
            background: #b3c6f7 !important;
            color: #1A237E !important;
            opacity: 0.5 !important;
            pointer-events: auto !important;
          }
          .mbsc-schedule-event-daytune-blocked-work {
            background: #b3e0f7 !important;
            color: #1A237E !important;
            opacity: 0.5 !important;
            pointer-events: auto !important;
          }
          .mbsc-schedule-grid {
            border-radius: 12px;
          }
          /* Custom: Make time slots more square by increasing their height */
          .mbsc-schedule-time-wrapper,
          .mbsc-schedule-item {
            height: 80px !important;
            min-height: 80px !important;
            max-height: 80px !important;
          }
        `}
      </style>
    </div>
  );
};

export default WeeklyCalendar; 