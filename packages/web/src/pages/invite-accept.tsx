/**
 * Invite Accept Page — /invite/:token
 *
 * Accepts an org invitation. Requires authentication.
 * If not logged in, redirects to login with a return URL.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { isAuthenticated } from '@ui/shared/api/auth';
import axiosInstance from '@ui/shared/api/axios-instance';

export const InviteAcceptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [orgName, setOrgName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate(`/login?redirect=/invite/${token}`, { replace: true });
      return;
    }

    const accept = async () => {
      try {
        const res = await axiosInstance.post('/users/invite/accept', { token });
        setOrgName(res.data.organisation?.name || 'the team');
        setStatus('success');
      } catch (err: any) {
        setErrorMsg(err.response?.data?.message || 'Failed to accept invitation');
        setStatus('error');
      }
    };

    accept();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ice-base">
      <div className="w-full max-w-sm text-center space-y-4 px-4">
        {status === 'loading' && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-ice-accent mx-auto" />
            <p className="text-sm text-ice-text-2">Accepting invitation...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-semibold text-ice-text-1">You're in!</h1>
            <p className="text-sm text-ice-text-2">
              You've been added to <span className="font-medium text-ice-text-1">{orgName}</span>.
            </p>
            <button onClick={() => navigate('/', { replace: true })} className="ice-btn ice-btn-primary">
              Go to dashboard
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-ice-red mx-auto" />
            <h1 className="text-xl font-semibold text-ice-text-1">Invitation failed</h1>
            <p className="text-sm text-ice-text-2">{errorMsg}</p>
            <Link to="/" className="text-sm text-ice-accent hover:underline">
              Go to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
};
