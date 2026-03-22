/**
 * Auth Callback — handles OAuth redirect from Google/GitHub
 *
 * Reads ?token= or ?error= from URL, stores token, redirects to canvas.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { setAccessToken, getCurrentUser } from '@ui/shared/api/auth';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      // Read token from URL fragment (#token=...) to prevent token leakage via logs/proxies
      const hash = window.location.hash.substring(1); // remove leading #
      const hashParams = new URLSearchParams(hash);
      const token = hashParams.get('token') || searchParams.get('token');
      const err = hashParams.get('error') || searchParams.get('error');

      // Clear the hash from the URL to prevent token remaining in browser history
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      if (err) {
        setError(err);
        return;
      }

      if (token) {
        setAccessToken(token);
        // Check if user needs onboarding
        try {
          const profile = await getCurrentUser();
          if (profile && !(profile as any).onboardingCompleted) {
            navigate('/onboarding', { replace: true });
            return;
          }
        } catch { /* fallback to home */ }
        navigate('/', { replace: true });
      } else {
        setError('No token received');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ice-base">
        <div className="text-center space-y-4">
          <p className="text-ice-red text-sm">{error}</p>
          <a href="/login" className="text-ice-accent text-sm hover:underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ice-base">
      <Loader2 className="w-6 h-6 animate-spin text-ice-text-3" />
    </div>
  );
};
