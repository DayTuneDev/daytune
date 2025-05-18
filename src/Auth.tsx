import React, { useState, ChangeEvent } from 'react';
import { supabase } from './supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');

  const getRedirectTo = () => {
    if (process.env.NODE_ENV === 'production') {
      return 'https://daytune.app';
    } else {
      return 'http://localhost:3000';
    }
  };

  const handleLogin = async (type: 'google' | 'email') => {
    setLoading(true);
    setMessage('');
    if (type === 'google') {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getRedirectTo() } });
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
        localStorage.clear();
        window.location.reload();
      }
    } catch (error) {
      setMessage('Error signing out');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card w-full max-w-md mx-auto flex flex-col items-center gap-6 p-8">
        <h2 className="text-2xl font-bold mb-1 text-center">Welcome to DayTune</h2>
        <p className="text-gray-600 text-center mb-2">
          Sign in to gently tune your day. Your data is private and secure. 🌱
        </p>
        <button
          className="bg-blue-500 text-white w-full py-3 rounded-full font-semibold text-lg shadow-sm hover:bg-blue-600 transition"
          onClick={() => handleLogin('google')}
          disabled={loading}
        >
          Sign in with Google
        </button>
        <div className="text-gray-400 text-sm">or</div>
        <input
          className="border px-4 py-3 rounded-full w-full text-lg focus:ring-2 focus:ring-blue-200"
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          disabled={loading}
          title="Email address"
        />
        <button
          className="bg-green-500 text-white w-full py-3 rounded-full font-semibold text-lg shadow-sm hover:bg-green-600 transition"
          onClick={() => handleLogin('email')}
          disabled={loading}
        >
          Sign in with Email
        </button>
        <button
          className="bg-red-500 text-white w-full py-3 rounded-full font-semibold text-lg shadow-sm hover:bg-red-600 transition"
          onClick={handleSignOut}
          disabled={loading}
        >
          Sign Out
        </button>
        {message && <div className="mt-2 text-red-500 text-center text-sm">{message}</div>}
        <div className="text-xs text-gray-400 text-center mt-2">
          DayTune is here to support you, one gentle step at a time.
        </div>
      </div>
    </div>
  );
} 