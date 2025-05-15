import React, { useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
// import '@fullcalendar/common/main.css';
// import '@fullcalendar/timegrid/main.css';
// import '@fullcalendar/daygrid/main.css';
// import '@fullcalendar/common/index.css';
// import '@fullcalendar/timegrid/index.css';
// import '@fullcalendar/daygrid/index.css';

// Helper to map tasks to FullCalendar events
function mapTasksToEvents(tasks) {
  return (tasks || []).map(task => {
    let start = task.start_datetime ? new Date(task.start_datetime) : null;
    let end = start && task.duration_minutes ? new Date(start.getTime() + task.duration_minutes * 60000) : null;
    if (!start || !end) return null;
    return {
      id: task.id,
      title: task.title,
      start,
      end,
      backgroundColor: '#e3eafe',
      borderColor: '#1A237E',
      textColor: '#1A237E',
      extendedProps: { type: 'task' },
    };
  }).filter(Boolean);
}

// Helper to map blocked times to background events
function mapBlockedTimesToEvents(blockedTimes) {
  return (blockedTimes || []).map(block => ({
    id: `blocked-${block.title}-${block.start}`,
    title: block.title,
    start: block.start,
    end: block.end,
    display: 'background',
    backgroundColor: block.title === 'Sleep' ? '#b3c6f7' : '#b3e0f7',
    borderColor: 'transparent',
    textColor: '#1A237E',
    extendedProps: { type: 'blocked' },
  }));
}

const calendarContainerStyle = {
  background: '#f8fafc',
  borderRadius: '18px',
  boxShadow: '0 2px 12px rgba(60,60,60,0.07)',
  padding: '24px',
  margin: '2rem auto',
  maxWidth: '1100px',
  height: '1000px',
  overflow: 'auto',
};

const FullCalendarWeekly = ({ tasks, blockedTimes }) => {
  // Memoize events for performance
  const events = useMemo(() => [
    ...mapTasksToEvents(tasks),
    ...mapBlockedTimesToEvents(blockedTimes),
  ], [tasks, blockedTimes]);

  return (
    <div style={calendarContainerStyle}>
      <h3 style={{ margin: '0 0 1rem 0', color: '#1A237E', fontWeight: 700, fontSize: '1.3rem' }}>
        📅 Weekly Schedule
      </h3>
      <FullCalendar
        plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: 'prev today next',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek',
        }}
        events={events}
        editable={true}
        selectable={false}
        eventResizableFromStart={true}
        nowIndicator={true}
        slotMinTime="06:00:00"
        slotMaxTime="24:00:00"
        height="900px"
        eventContent={renderEventContent}
      />
      <style>{`
        .fc-event {
          border-radius: 10px !important;
          box-shadow: 0 2px 8px rgba(60,60,60,0.07);
          font-weight: 500;
          font-size: 1rem;
        }
        .fc-bg-event {
          opacity: 0.5 !important;
        }
        .fc .fc-toolbar-title {
          color: #1A237E;
          font-weight: 700;
        }
        .fc .fc-button {
          background: #1A237E;
          color: #fff;
          border-radius: 8px;
          border: none;
        }
        .fc .fc-button-primary:not(:disabled).fc-button-active, .fc .fc-button-primary:not(:disabled):active {
          background: #3949ab;
        }
      `}</style>
    </div>
  );
};

// Custom rendering for events (shows title and time)
function renderEventContent(eventInfo) {
  return (
    <div style={{ padding: '4px 8px' }}>
      <b>{eventInfo.event.title}</b>
      <div style={{ fontSize: '0.85em', color: '#3949ab' }}>
        {eventInfo.timeText}
      </div>
    </div>
  );
}

export default FullCalendarWeekly; 