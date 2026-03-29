/**
 * Invite Accept Page — /invite/:token
 *
 * Accepts an org invitation. Requires authentication.
 * If not logged in, redirects to login with a return URL.
 */

import { useTranslation } from '@ui/i18n';
import { isAuthenticated } from '@ui/shared/api/auth';
import axiosInstance from '@ui/shared/api/axios-instance';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

export const InviteAcceptPage: React.FC = () => {
  const { t } = useTranslation();
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
        setOrgName(res.data.organisation?.name || t('invite.error.fallbackOrg'));
        setStatus('success');
      } catch (err: any) {
        setErrorMsg(err.response?.data?.message || t('invite.error.defaultMessage'));
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
            <p className="text-sm text-ice-text-2">{t('invite.loading')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-semibold text-ice-text-1">{t('invite.success.title')}</h1>
            <p className="text-sm text-ice-text-2">
              {t('invite.success.description', { orgName })}
            </p>
            <button onClick={() => navigate('/', { replace: true })} className="ice-btn ice-btn-primary">
              {t('invite.success.button')}
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-ice-red mx-auto" />
            <h1 className="text-xl font-semibold text-ice-text-1">{t('invite.error.title')}</h1>
            <p className="text-sm text-ice-text-2">{errorMsg}</p>
            <Link to="/" className="text-sm text-ice-accent hover:underline">
              {t('invite.error.button')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};
