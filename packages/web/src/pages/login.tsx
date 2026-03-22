/**
 * Login Page — uses ICE design tokens
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { login } from '@ui/shared/api/auth';
import { OAuthButtons } from '@ui/shared/components/oauth-buttons';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(searchParams.get('redirect') || '/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ice-base relative overflow-hidden">
      {/* Subtle radial glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-ice-accent/[0.03] blur-[120px] pointer-events-none motion-reduce:hidden" />

      <div className="relative w-full max-w-[380px] space-y-8 px-4">
        {/* Brand */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ice-text-1">ICE</h1>
          <p className="text-sm text-ice-text-3 mt-2">Integrated Cloud Environment</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="ice-card" id="ice-login-auth-form">
          <div className="ice-card-header">
            <h2 className="text-base font-semibold text-ice-text-1">Sign in to your account</h2>
          </div>

          <div className="ice-card-body space-y-5">
            <OAuthButtons />

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-ice-border" />
              <span className="text-xs text-ice-text-3">or</span>
              <div className="flex-1 h-px bg-ice-border" />
            </div>

            {error && (
              <div
                role="alert"
                aria-live="polite"
                id="ice-login-auth-alert-error"
                className="rounded-md px-3 py-2.5 text-sm bg-ice-red-muted text-ice-red border border-ice-red/20"
              >
                {error}
              </div>
            )}

            <label className="block">
              <span className="block text-sm font-medium text-ice-text-2 mb-1.5">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                id="ice-login-auth-input-email"
                className="ice-input"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-ice-text-2 mb-1.5">Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                id="ice-login-auth-input-password"
                className="ice-input"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              id="ice-login-auth-btn-submit"
              className="ice-btn ice-btn-primary w-full"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-ice-text-3">
          Don&rsquo;t have an account?{' '}
          <Link to="/signup" className="text-ice-accent hover:text-ice-accent-hover transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
};
