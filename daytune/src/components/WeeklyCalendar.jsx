import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Eventcalendar, setOptions, Toast } from '@mobiscroll/react';
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
  height: '800px',
  overflow: 'auto'
};

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

const WeeklyCalendar = ({ tasks }) => {
  const [events, setEvents] = useState([]);
  const [isToastOpen, setToastOpen] = useState(false);
  const [toastText, setToastText] = useState('');

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

  useEffect(() => {
    // Only include tasks with a valid start time
    const formatted = (tasks || [])
      .filter(task => task.start_datetime || (task.start_date && task.start_time))
      .map((task) => {
        let start;
        if (task.start_date && task.start_time) {
          start = new Date(`${task.start_date}T${task.start_time}`);
        } else if (task.start_datetime) {
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
    setEvents(formatted);
  }, [tasks]);

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
          <div style={{
            borderRadius: '10px',
            background: data.cssClass === 'daytune-dummy-event' ? '#f8fafc' : '#e3eafe',
            color: data.cssClass === 'daytune-dummy-event' ? '#f8fafc' : '#1A237E',
            padding: '4px 8px',
            fontWeight: 500,
            fontSize: '1rem'
          }}>
            {data.title}
          </div>
        )}
      />
      <Toast message={toastText} isOpen={isToastOpen} onClose={handleCloseToast} />
      <style>
        {`
          .mbsc-schedule-event-daytune-event {
            border-radius: 10px !important;
            background: #e3eafe !important;
            color: #1A237E !important;
            box-shadow: 0 2px 8px rgba(60,60,60,0.07);
          }
          .mbsc-schedule-event-daytune-dummy-event {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            pointer-events: none !important;
            height: 0 !important;
            min-height: 0 !important;
            max-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .mbsc-schedule-grid {
            border-radius: 12px;
          }
        `}
      </style>
    </div>
  );
};

export default WeeklyCalendar; 