import React from 'react';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dyvvmmbwuksxinofhuvl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5dnZtbWJ3dWtzeGlub2ZodXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2NjIzNzAsImV4cCI6MjA2MjIzODM3MH0.WRXCK92MetEdyaHSfwcxo3sLFDnPBUNJiBsnOXppSQM'
);

export default function SignIn() {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setErrorMessage(''); // Clear previous error message
      console.log('Attempting to sign in with Google...');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) {
        console.error('Error signing in with Google:', error);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } else {
        console.log('OAuth sign-in initiated:', data);
        // No need to insert user data here; Supabase will redirect
      }
    } catch (error) {
      console.error('Error during sign-in process:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Welcome to DayTune
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">Sign in to start tuning your day</p>
        </div>
        <div className="mt-8 space-y-6">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
        {errorMessage && <div className="text-red-500 text-center mt-4">{errorMessage}</div>}
      </div>
    </div>
  );
}
