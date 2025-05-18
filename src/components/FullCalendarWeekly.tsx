import React, { useMemo, useState, useRef } from 'react';
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
  const calendarRef = useRef<any>(null);
  // Track selected event for highlight
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Memoize events for performance
  const events = useMemo(
    () => [...mapTasksToEvents(tasks), ...mapBlockedTimesToEvents(blockedTimes)],
    [tasks, blockedTimes]
  );

  // Find task by event id
  const handleEventClick = (info: any) => {
    info.jsEvent.preventDefault();
    info.jsEvent.stopPropagation();
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
    const title = eventInfo.event.title;
    return (
      <div
        style={{
          background: 'transparent',
          color: '#1A237E',
          fontWeight: 600,
          fontSize: '0.95rem',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: 0,
          margin: 0,
          border: 'none',
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

  // Helper to check if a day is overloaded (more than 3 events)
  function isDayOverloaded(dateStr: string) {
    const dayEvents = tasks.filter(t => t.start_datetime && new Date(t.start_datetime).toDateString() === new Date(dateStr).toDateString());
    return dayEvents.length > 3;
  }

  // Helper to check if a day is empty
  function isDayEmpty(dateStr: string) {
    const dayEvents = tasks.filter(t => t.start_datetime && new Date(t.start_datetime).toDateString() === new Date(dateStr).toDateString());
    return dayEvents.length === 0;
  }

  return (
    <div style={{ ...calendarContainerStyle, height: undefined, position: 'relative', overflowX: 'auto', background: '#f6f8fa', borderRadius: 18, boxShadow: '0 4px 24px rgba(60,60,60,0.10)' }}>
      {/* Supportive description for calendar views */}
      <div style={{ margin: '0 0 18px 0', color: '#3949ab', fontSize: '1.05rem', fontWeight: 500, textAlign: 'center' }}>
        {calendarView === 'month' ? (
          <>Month view: See your month at a glance. Each day shows what&apos;s on your plate—no need to worry about exact times. Perfect for spotting busy days, gentle stretches, and making sure you&apos;re not overbooked.</>
        ) : (
          <>Week view: Zoom in to see your real rhythm. Here, you&apos;ll see exactly when each task happens, how your energy flows, and where you might want to re-tune.</>
        )}
      </div>
      {/* Calendar header with emoji and heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingLeft: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span role="img" aria-label="Calendar" style={{ fontSize: 32 }}>📅</span>
          <h3 style={{ margin: 0, color: '#1A237E', fontWeight: 700, fontSize: '1.3rem' }}>
            {calendarView === 'week' ? 'Your Week' : 'Your Month'}
          </h3>
        </div>
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
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            title="Re‑Tune My Day: Instantly adapt your schedule to how you're feeling."
            aria-label="Re‑Tune My Day: Instantly adapt your schedule to how you're feeling."
            onMouseOver={(e) => e.currentTarget.style.background = '#3949ab'}
            onMouseOut={(e) => e.currentTarget.style.background = '#1A237E'}
            onFocus={(e) => e.currentTarget.style.background = '#3949ab'}
            onBlur={(e) => e.currentTarget.style.background = '#1A237E'}
          >
            <span role="img" aria-label="Tuning Fork" style={{ fontSize: 22, marginRight: 4 }}>🪕</span>
            Re‑Tune My Day
          </button>
        )}
      </div>
      {/* Empty state microcopy */}
      {tasks.length === 0 && (
        <div style={{ textAlign: 'center', color: '#2c7d50', fontWeight: 500, fontSize: '1.1rem', margin: '32px 0' }}>
          Your calendar is clear—space to breathe, reflect, or add something gentle. 🌱
        </div>
      )}
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin, dayGridPlugin]}
        initialView={calendarView === 'week' ? 'timeGridWeek' : 'dayGridMonth'}
        headerToolbar={{
          left: 'prev today next',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek',
        }}
        customButtons={{
          today: {
            text: 'today',
            click: (arg: any) => arg.view.calendar.today(),
            hint: 'Jump to today and re-center your rhythm',
          },
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
        eventClassNames={(arg) => arg.event.id === selectedEventId ? ['daytune-selected'] : []}
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
            <div className="mt-4 text-green-700 text-sm font-medium">
              Need to adjust? Try a gentle re-tune. 🌱
            </div>
          </div>
        </div>
      )}
      <style>{`
        .fc-event {
          border-radius: 18px !important;
          box-shadow: 0 2px 8px rgba(60,60,60,0.07);
          font-weight: 500;
          font-size: 1rem;
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          height: 100% !important;
          min-height: 100% !important;
          padding: 0 !important;
          margin-bottom: 4px !important;
          background: #e3eafe !important;
          border: 1.5px solid #b3c6f7 !important;
          transition: border 0.2s, background 0.2s;
          pointer-events: auto !important;
          z-index: 2 !important;
        }
        .fc-event.daytune-selected {
          background: #b3c6f7 !important;
          border: 2.5px solid #3949ab !important;
          box-shadow: 0 4px 16px rgba(60,60,60,0.13);
        }
        .fc-timegrid-event-harness {
          margin-right: 6px !important;
          margin-left: 6px !important;
        }
        .fc-timegrid-event {
          border-radius: 18px !important;
          background: #e3eafe !important;
          border: 1.5px solid #b3c6f7 !important;
          box-shadow: 0 2px 8px rgba(60,60,60,0.07);
          pointer-events: auto !important;
          z-index: 2 !important;
        }
        .fc-timegrid-event.daytune-selected {
          background: #b3c6f7 !important;
          border: 2.5px solid #3949ab !important;
        }
        .fc-timegrid-event.fc-event-start, .fc-timegrid-event.fc-event-end {
          margin-top: 2px !important;
          margin-bottom: 2px !important;
        }
        .fc-timegrid-event.fc-event:not(:last-child) {
          margin-bottom: 8px !important;
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
        /* Tooltip on hover for event blocks */
        .fc-event:hover .daytune-event-tooltip {
          display: block !important;
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
