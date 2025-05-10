import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async (type) => {
    setLoading(true);
    setMessage('');
    if (type === 'google') {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (error) setMessage(error.message);
    } else {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setMessage(error.message);
      else setMessage('Check your email for the login link!');
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setMessage(error.message);
      } else {
        // Clear any local storage items
        localStorage.clear();
        // Reload the page to ensure a clean state
        window.location.reload();
      }
    } catch (error) {
      setMessage('Error signing out');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-10">
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded"
        onClick={() => handleLogin('google')}
        disabled={loading}
      >
        Sign in with Google
      </button>
      <div>or</div>
      <input
        className="border px-2 py-1 rounded"
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <button
        className="bg-green-500 text-white px-4 py-2 rounded"
        onClick={() => handleLogin('email')}
        disabled={loading}
      >
        Sign in with Email
      </button>
      <button
        className="bg-red-500 text-white px-4 py-2 rounded"
        onClick={handleSignOut}
        disabled={loading}
      >
        Sign Out
      </button>
      {message && <div className="mt-2 text-red-500">{message}</div>}
    </div>
  );
} 