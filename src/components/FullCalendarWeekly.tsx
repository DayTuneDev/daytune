import React, { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { Task, BlockedTime, FullCalendarEvent } from '../types/shared';
import { FaRegCalendarAlt } from 'react-icons/fa';
// import '@fullcalendar/common/main.min.css';
// import '@fullcalendar/timegrid/main.min.css';
// import '@fullcalendar/daygrid/main.min.css';
// import '@fullcalendar/common/index.css';
// import '@fullcalendar/timegrid/index.css';
// import '@fullcalendar/daygrid/index.css';

// Helper to map tasks to FullCalendar events
function mapTasksToEvents(tasks: Task[]): FullCalendarEvent[] {
  return (tasks || [])
    .map((task) => {
      let start = task.start_datetime ? new Date(task.start_datetime) : null;
      let end =
        start && task.duration_minutes
          ? new Date(start.getTime() + task.duration_minutes * 60000)
          : null;
      if (!start || !end) return null;
      return {
        id: task.id,
        title: task.title,
        start,
        end,
        backgroundColor: '#e3eafe',
        borderColor: '#1A237E',
        textColor: '#1A237E',
        display: 'auto',
        extendedProps: { type: 'task' },
      } as FullCalendarEvent;
    })
    .filter((e): e is FullCalendarEvent => e !== null);
}

// Helper to map blocked times to background events
function mapBlockedTimesToEvents(blockedTimes: BlockedTime[]): FullCalendarEvent[] {
  return (blockedTimes || []).map((block) => ({
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
  borderRadius: '0px',
  boxShadow: '0 2px 12px rgba(60,60,60,0.07)',
  padding: '20px 0',
  margin: '2rem auto',
  maxWidth: '900px',
  minWidth: '800px',
  height: '700px',
  overflowX: 'auto' as const,
  overflowY: 'auto' as const,
  position: 'relative',
};

const FullCalendarWeekly = ({ tasks, blockedTimes, onRetune }: { tasks: Task[], blockedTimes: BlockedTime[], onRetune?: () => void }) => {
  // Modal state for event details
  const [modalTask, setModalTask] = useState<Task | null>(null);
  // Track current calendar view
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week');
  // Track selected event for highlight
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Memoize events for performance
  const events = useMemo(
    () => [...mapTasksToEvents(tasks), ...mapBlockedTimesToEvents(blockedTimes)],
    [tasks, blockedTimes]
  );

  // Find task by event id
  const handleEventClick = (info: any) => {
    const task = tasks.find(t => t.id === info.event.id);
    if (task) {
      setModalTask(task);
      setSelectedEventId(task.id);
    }
  };

  // Modal close handler
  const closeModal = () => {
    setModalTask(null);
    setSelectedEventId(null);
  };

  // Calendar view change handler
  const handleViewChange = (view: any) => {
    if (view && view.type) {
      if (view.type === 'timeGridWeek') setCalendarView('week');
      else if (view.type === 'dayGridMonth') setCalendarView('month');
    }
  };

  // Keyboard accessibility for modal
  React.useEffect(() => {
    if (!modalTask) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalTask]);

  // Custom event content for both week and month views
  function customEventContent(eventInfo: any) {
    const isSelected = eventInfo.event.id === selectedEventId;
    const title = eventInfo.event.title;
    return (
      <div
        style={{
          background: isSelected ? '#b3c6f7' : '#e3eafe',
          border: isSelected ? '2px solid #3949ab' : '1px solid #b3c6f7',
          borderRadius: 10,
          color: '#1A237E',
          fontWeight: 600,
          fontSize: '0.95rem',
          padding: '2px 8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          boxShadow: isSelected ? '0 2px 8px rgba(60,60,60,0.12)' : '0 2px 8px rgba(60,60,60,0.07)',
          cursor: 'pointer',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
        title={title}
      >
        {title}
      </div>
    );
  }

  // Helper to format time range for modal
  function formatTimeRange(startIso: string | undefined, duration: number | undefined) {
    if (!startIso || !duration) return 'N/A';
    const start = new Date(startIso);
    const end = new Date(start.getTime() + duration * 60000);
    return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return (
    <div style={{ ...calendarContainerStyle, height: undefined, position: 'relative', overflowX: 'auto' }}>
      {/* Calendar emoji icon for visual polish */}
      <div style={{ position: 'absolute', top: 18, left: 48, zIndex: 10, fontSize: 32, paddingRight: 12, marginLeft: 8 }} aria-label="Calendar">
        <span role="img" aria-label="Calendar">📅</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingLeft: 40 }}>
        <h3 style={{ margin: 0, color: '#1A237E', fontWeight: 700, fontSize: '1.3rem' }}>
          {calendarView === 'week' ? 'Your Week' : 'Your Month'}
        </h3>
        {onRetune && (
          <button
            onClick={onRetune}
            style={{
              background: '#1A237E',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#3949ab'}
            onMouseOut={(e) => e.currentTarget.style.background = '#1A237E'}
            onFocus={(e) => e.currentTarget.style.background = '#3949ab'}
            onBlur={(e) => e.currentTarget.style.background = '#1A237E'}
          >
            Retune Schedule
          </button>
        )}
      </div>
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
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        eventContent={customEventContent}
        eventClick={handleEventClick}
        viewDidMount={({ view }) => handleViewChange(view)}
        datesSet={({ view }) => handleViewChange(view)}
        eventMaxStack={10}
        dayMaxEventRows={10}
      />
      {/* Modal for event details */}
      {modalTask && (
        <div
          aria-modal="true"
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30"
        >
          <div
            role="button"
            tabIndex={0}
            aria-label="Close modal"
            className="absolute inset-0 w-full h-full"
            onClick={closeModal}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') closeModal(); }}
            style={{ zIndex: 1 }}
          >
          </div>
          <div
            className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full relative"
            style={{ minWidth: 320, zIndex: 2 }}
          >
            <button
              onClick={closeModal}
              aria-label="Close"
              className="absolute top-3 right-3 text-gray-400 hover:text-blue-700 text-2xl font-bold focus:outline-none"
            >
              ×
            </button>
            <h4 className="text-xl font-semibold mb-2 text-blue-900">{modalTask.title}</h4>
            <div className="mb-2 text-gray-700">
              <span className="font-medium">Time:</span> {modalTask.start_datetime && modalTask.duration_minutes ? formatTimeRange(modalTask.start_datetime, modalTask.duration_minutes) : 'N/A'}
            </div>
            <div className="mb-2 text-gray-700">
              <span className="font-medium">Difficulty:</span> {modalTask.difficulty}/5
            </div>
            <div className="mb-2 text-gray-700">
              <span className="font-medium">Importance:</span> {modalTask.importance}/5
            </div>
            <div className="mb-2 text-gray-700">
              <span className="font-medium">Type:</span> {modalTask.scheduling_type ? modalTask.scheduling_type.charAt(0).toUpperCase() + modalTask.scheduling_type.slice(1) : 'N/A'}
            </div>
          </div>
        </div>
      )}
      <style>{`
        .fc-event {
          border-radius: 10px !important;
          box-shadow: 0 2px 8px rgba(60,60,60,0.07);
          font-weight: 500;
          font-size: 1rem;
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          display: flex !important;
          align-items: center !important;
        }
        .fc-daygrid-event-harness {
          display: flex !important;
          flex-direction: row !important;
          gap: 2px;
        }
        .fc-daygrid-event {
          flex: 1 1 0 !important;
          min-width: 0 !important;
          max-width: 100% !important;
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
        .fc, .fc-scrollgrid {
          box-sizing: border-box !important;
        }
      `}</style>
    </div>
  );
};

// Custom rendering for events (shows title and time)
function renderEventContent(eventInfo: { event: FullCalendarEvent }) {
  const { event } = eventInfo;
  const start = event.start ? event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const end = event.end ? event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div style={{ padding: '4px 8px' }}>
      <b>{event.title}</b>
      <div style={{ fontSize: '0.85em', color: '#3949ab' }}>{start} - {end}</div>
    </div>
  );
}

export default FullCalendarWeekly;
