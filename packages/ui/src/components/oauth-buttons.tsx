/**
 * OAuth Buttons — Google + GitHub sign in
 *
 * Google: Uses GIS initTokenClient (no redirect URI needed)
 * GitHub: Still uses redirect flow (works with Device Flow fallback)
 */

import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { setAccessToken } from '../api/auth';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const BACKEND_URL = API_URL.startsWith('/') ? `${window.location.origin}${API_URL}` : API_URL;

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (error: { type: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

export const OAuthButtons: React.FC = () => {
  const [loading, setLoading] = useState<'google' | 'github' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = () => {
    if (!window.google?.accounts?.oauth2) {
      setError('Google Sign-In not loaded. Please refresh.');
      return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Google login not configured.');
      return;
    }

    setLoading('google');
    setError(null);

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'email profile',
      callback: async (response) => {
        if (response.error || !response.access_token) {
          setLoading(null);
          setError(response.error || 'Google sign-in failed');
          return;
        }

        try {
          // Send token to backend for user creation/login
          const res = await fetch(`${BACKEND_URL}/auth/google/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ access_token: response.access_token }),
          });

          const data = await res.json();
          if (!res.ok) {
            setError(data.message || 'Login failed');
            setLoading(null);
            return;
          }

          // Store token and redirect
          setAccessToken(data.token);
          window.location.href = '/';
        } catch (err: any) {
          setError(err.message || 'Login failed');
          setLoading(null);
        }
      },
      error_callback: (err) => {
        setLoading(null);
        if (err.type !== 'popup_closed') {
          setError('Google sign-in failed');
        }
      },
    });

    client.requestAccessToken();
  };

  return (
    <div className="space-y-3">
      {error && <div className="text-xs text-red-500 text-center">{error}</div>}
      <button
        onClick={handleGoogleLogin}
        disabled={loading === 'google'}
        className="ice-btn w-full border border-ice-border bg-ice-surface hover:bg-ice-hover text-ice-text-1 disabled:opacity-50"
      >
        {loading === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </button>
      <a
        href={`${BACKEND_URL}/auth/github`}
        className="ice-btn w-full border border-ice-border bg-ice-surface hover:bg-ice-hover text-ice-text-1"
      >
        <GitHubIcon />
        Continue with GitHub
      </a>
    </div>
  );
};
