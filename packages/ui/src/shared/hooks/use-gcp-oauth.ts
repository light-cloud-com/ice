/**
 * GCP OAuth hook — Uses Google Identity Services (GIS) authorization code flow.
 *
 * Uses initCodeClient (popup) → gets auth code → backend exchanges for tokens.
 * This flow goes through RAPT challenge (required by Google Workspace)
 * and provides a refresh token for long-lived access.
 */

import { useState, useCallback } from 'react';
import { getApi } from '../api/api-adapter';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup';
            callback: (response: { code?: string; error?: string }) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }) => { requestCode: () => void };
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

const GCP_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/cloudplatformprojects.readonly',
].join(' ');

interface UseGCPOAuthResult {
  connecting: boolean;
  error: string | null;
  connect: () => void;
}

export function useGCPOAuth(onSuccess: () => void): UseGCPOAuthResult {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    setError(null);

    if (!window.google?.accounts?.oauth2) {
      setError('Google Sign-In library not loaded. Please refresh and try again.');
      return;
    }

    const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Google OAuth not configured (missing VITE_GOOGLE_CLIENT_ID).');
      return;
    }

    setConnecting(true);

    // Use authorization code flow — goes through RAPT challenge,
    // provides refresh token, and works with Google Workspace policies.
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: GCP_SCOPES,
      ux_mode: 'popup',
      callback: async (response) => {
        if (response.error || !response.code) {
          setConnecting(false);
          if (response.error !== 'popup_closed_by_user') {
            setError(response.error || 'OAuth cancelled');
          }
          return;
        }

        try {
          // Send auth code to backend for token exchange
          const res = await (getApi() as any).provider.exchangeGCPCode(response.code);
          if (res.success) {
            onSuccess();
          } else {
            setError(res.error || 'Connection failed');
          }
        } catch (err: any) {
          setError(err?.response?.data?.error || err?.message || 'Connection failed');
        } finally {
          setConnecting(false);
        }
      },
      error_callback: (err) => {
        setConnecting(false);
        if (err.type !== 'popup_closed') {
          setError(err.message || 'Google sign-in failed');
        }
      },
    });

    client.requestCode();
  }, [onSuccess]);

  return { connecting, error, connect };
}
