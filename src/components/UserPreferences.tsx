import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { UserPreferences } from '../services/userPreferences';

interface UserPreferencesFormData {
  sleep_start: string;
  sleep_end: string;
  sleep_duration: number;
  work_start: string;
  work_end: string;
  work_days: number[];
}

interface UserPreferencesProps {
  initialPreferences?: Partial<UserPreferences>;
  onSave: (prefs: Partial<UserPreferences>) => Promise<void>;
  loading?: boolean;
}

const defaultPrefs: UserPreferencesFormData = {
  sleep_start: '00:00',
  sleep_end: '08:00',
  sleep_duration: 480,
  work_start: '09:00',
  work_end: '17:00',
  work_days: [1, 2, 3, 4, 5],
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function mergePrefs(prefs?: Partial<UserPreferences>): UserPreferencesFormData {
  return {
    ...defaultPrefs,
    sleep_start: prefs?.sleep_start || defaultPrefs.sleep_start,
    sleep_end: prefs?.sleep_end || defaultPrefs.sleep_end,
    work_start: prefs?.sleep_start || defaultPrefs.work_start,
    work_end: prefs?.sleep_end || defaultPrefs.work_end,
  };
}

export default function UserPreferencesForm({ 
  initialPreferences, 
  onSave, 
  loading = false 
}: UserPreferencesProps): React.ReactElement {
  const [prefs, setPrefs] = useState<UserPreferencesFormData>(mergePrefs(initialPreferences));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sync local state with prop changes
  useEffect(() => {
    setPrefs(mergePrefs(initialPreferences));
  }, [initialPreferences]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setPrefs((prev) => ({ ...prev, [name]: value }));
  };

  const handleDaysChange = (dayIdx: number): void => {
    setPrefs((prev) => {
      const days = prev.work_days.includes(dayIdx)
        ? prev.work_days.filter((d) => d !== dayIdx)
        : [...prev.work_days, dayIdx].sort((a, b) => a - b);
      return { ...prev, work_days: days };
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Convert form data to service preferences format
      const servicePrefs: Partial<UserPreferences> = {
        sleep_start: prefs.sleep_start,
        sleep_end: prefs.sleep_end,
      };
      await onSave(servicePrefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card w-full max-w-md mx-auto flex flex-col gap-6 mt-12">
      <h2 className="text-2xl font-bold mb-1 text-center">Daily Preferences</h2>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <label className="font-semibold" htmlFor="sleep_start">Sleep Window:</label>
          <div className="flex gap-2 items-center mt-1">
            <input
              id="sleep_start"
              type="time"
              name="sleep_start"
              value={prefs.sleep_start}
              onChange={handleChange}
              disabled={saving || loading}
              className="border rounded px-2 py-1"
              aria-label="Sleep start time"
              title="Sleep start time"
            />
            <span>to</span>
            <input
              id="sleep_end"
              type="time"
              name="sleep_end"
              value={prefs.sleep_end}
              onChange={handleChange}
              disabled={saving || loading}
              className="border rounded px-2 py-1"
              aria-label="Sleep end time"
              title="Sleep end time"
            />
          </div>
        </div>
        <div>
          <label className="font-semibold" htmlFor="work_start">Work Hours:</label>
          <div className="flex gap-2 items-center mt-1">
            <input
              id="work_start"
              type="time"
              name="work_start"
              value={prefs.work_start}
              onChange={handleChange}
              disabled={saving || loading}
              className="border rounded px-2 py-1"
              aria-label="Work start time"
              title="Work start time"
            />
            <span>to</span>
            <input
              id="work_end"
              type="time"
              name="work_end"
              value={prefs.work_end}
              onChange={handleChange}
              disabled={saving || loading}
              className="border rounded px-2 py-1"
              aria-label="Work end time"
              title="Work end time"
            />
          </div>
        </div>
        <div>
          <fieldset>
            <legend className="font-semibold">Work Days:</legend>
            <div className="flex gap-2 mt-1">
              {dayLabels.map((label, idx) => (
                <label
                  key={label}
                  className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer border ${
                    prefs.work_days.includes(idx) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={prefs.work_days.includes(idx)}
                    onChange={() => handleDaysChange(idx)}
                    disabled={saving || loading}
                    aria-label={`${label} work day`}
                    title={`Toggle ${label} as work day`}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded font-semibold mt-4 disabled:opacity-50"
          disabled={saving || loading}
          aria-label={saving ? 'Saving preferences...' : 'Save preferences'}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        {error && (
          <div className="text-red-500 text-xs mt-2" role="alert">
            {error}
          </div>
        )}
      </form>
      <div className="text-xs text-gray-400 text-center mt-2">
        Your preferences help DayTune tune your schedule. 🌙
      </div>
    </div>
  );
} 