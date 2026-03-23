/**
 * Onboarding Page — Full-screen wizard
 *
 * 5-step flow: Welcome → Team → Cloud → GitHub → First Project
 * Each step is skippable. Progress bar at top. Back button available.
 */

import { ChevronLeft, ChevronRight, Sparkles, SkipForward } from 'lucide-react';
import React, { useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ConnectCloudStep } from './connect-cloud-step';
import { ConnectGithubStep } from './connect-github-step';
import { FirstProjectStep } from './first-project-step';
import { TeamStep } from './team-step';
import { WelcomeStep } from './welcome-step';
import logoDark from '../../../assets/logo-dark.png';
import logoLight from '../../../assets/logo-light.png';
import { COMPOSED_TEMPLATES, expandComposedTemplate } from '../../../config/templates';
import { QUICK_STARTS } from '../../../config/templates/quick-starts';
import axiosInstance from '../../../shared/api/axios-instance';
import { StepIndicator } from '../../../shared/components/step-indicator';
import { useTheme } from '../../../shared/hooks/use-theme';
import { toSlug } from '../../../shared/utils/slug';
import { addOrganisation, fetchProfile, switchOrganisation  } from '../../../store/slices/account-slice';
import {
  setStep,
  fetchOnboardingStatus,
  saveOnboardingStep,
  completeOnboarding,
  skipOnboarding,
} from '../../../store/slices/onboarding-slice';
import type { Provider } from '../../../config/blocks/types';
import type { RootState, AppDispatch } from '../../../store';

const TOTAL_STEPS = 5;
const STEP_LABELS = ['Welcome', 'Team', 'Cloud', 'GitHub', 'Project'];

export const OnboardingPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const currentStep = useSelector((s: RootState) => s.onboarding.currentStep);
  const completed = useSelector((s: RootState) => s.onboarding.completed);
  const provider = useSelector((s: RootState) => s.onboarding.defaultProvider);
  const region = useSelector((s: RootState) => s.onboarding.defaultRegion);
  const teamMode = useSelector((s: RootState) => s.onboarding.teamMode);
  const teamName = useSelector((s: RootState) => s.onboarding.teamName);
  const _inviteEmails = useSelector((s: RootState) => s.onboarding.inviteEmails);
  const projectName = useSelector((s: RootState) => s.onboarding.projectName);
  const selectedTemplateId = useSelector((s: RootState) => s.onboarding.selectedTemplateId);
  const selectedOrg = useSelector((s: RootState) => s.account.selectedOrg);

  // If already completed, redirect away
  useEffect(() => {
    if (completed) navigate('/', { replace: true });
  }, [completed, navigate]);

  // Fetch profile + onboarding status on mount (resumes where user left off)
  useEffect(() => {
    dispatch(fetchProfile());
    dispatch(fetchOnboardingStatus());
  }, [dispatch]);

  // ── Finish: create project + complete onboarding ─────────────────────────────

  const handleFinish = useCallback(async () => {
    try {
      const orgId = selectedOrg?.id;
      const name = projectName.trim() || 'My Project';

      // Create project
      const res = await axiosInstance.post('/canvas/projects/create', {
        name,
        type: 'project',
        organisationId: orgId,
      });
      const project = res.data;

      // Save provider/region
      if (provider) {
        await axiosInstance.post('/canvas/projects/update', {
          projectId: project.id,
          provider,
          region: region || '',
        });
      }

      // Apply template if selected
      const allTemplates = [...QUICK_STARTS, ...COMPOSED_TEMPLATES];
      const template = selectedTemplateId ? allTemplates.find((t) => t.id === selectedTemplateId) : null;

      if (template) {
        const cardRes = await axiosInstance.post('/canvas/cards/create', {
          name,
          projectId: project.id,
        });
        const card = cardRes.data;
        const expanded = expandComposedTemplate(template, (provider as Provider) || undefined);
        await axiosInstance.post('/canvas/cards/update', {
          cardId: card.id,
          nodes: expanded.nodes,
          edges: expanded.edges,
        });
      }

      // Mark onboarding complete + refresh profile so account.user.onboardingCompleted is true
      await dispatch(completeOnboarding());
      await dispatch(fetchProfile());

      // Navigate to the new project
      const orgSlug = selectedOrg ? toSlug(selectedOrg.name) : '';
      const projectSlug = project.slug || toSlug(name);
      navigate(`/${orgSlug}/${projectSlug}`, { replace: true });
    } catch (err) {
      console.error('Failed to create project:', err);
      await dispatch(completeOnboarding());
      await dispatch(fetchProfile());
      navigate('/', { replace: true });
    }
  }, [projectName, selectedTemplateId, provider, region, selectedOrg, dispatch, navigate]);

  // ── Step navigation ──────────────────────────────────────────────────────────

  const goNext = useCallback(async () => {
    // Execute step-specific side effects before advancing
    if (currentStep === 1) {
      await dispatch(saveOnboardingStep({ step: 2 }));
    }

    if (currentStep === 2) {
      // Create team (required)
      if (teamMode === 'create' && teamName.trim()) {
        try {
          const res = await axiosInstance.post('/organisations/create', { name: teamName.trim() });
          const newOrg = { id: res.data.id, name: res.data.name, role: 'owner' };
          dispatch(addOrganisation(newOrg));
          dispatch(switchOrganisation(newOrg));
        } catch (err) {
          console.warn('Failed to create team:', err);
        }
      }
      await dispatch(saveOnboardingStep({ step: 3 }));
    }

    if (currentStep === 3) {
      // Save provider/region chosen on the Cloud step
      await dispatch(
        saveOnboardingStep({
          step: 4,
          defaultProvider: provider || undefined,
          defaultRegion: region || undefined,
        }),
      );
    }

    if (currentStep === 4) {
      await dispatch(saveOnboardingStep({ step: 5 }));
    }

    if (currentStep === TOTAL_STEPS) {
      await handleFinish();
      return;
    }

    dispatch(setStep(Math.min(currentStep + 1, TOTAL_STEPS)));
  }, [currentStep, provider, region, teamMode, teamName, dispatch, handleFinish]);

  const goBack = useCallback(() => {
    dispatch(setStep(Math.max(currentStep - 1, 1)));
  }, [currentStep, dispatch]);

  const handleSkipStep = useCallback(() => {
    if (currentStep === TOTAL_STEPS) {
      handleFinish();
      return;
    }
    dispatch(setStep(Math.min(currentStep + 1, TOTAL_STEPS)));
    dispatch(saveOnboardingStep({ step: Math.min(currentStep + 1, TOTAL_STEPS) }));
  }, [currentStep, dispatch, handleFinish]);

  const handleSkipAll = useCallback(async () => {
    await dispatch(skipOnboarding());
    await dispatch(fetchProfile());
    navigate('/', { replace: true });
  }, [dispatch, navigate]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-ice-base relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-ice-accent/[0.03] blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <img src={isDark ? logoDark : logoLight} alt="ICE" width={60} height={18} className="h-[18px] object-contain" />
        <button
          onClick={handleSkipAll}
          className="flex items-center gap-1 text-xs text-ice-text-3 hover:text-ice-text-1 transition-colors"
        >
          <SkipForward className="w-3 h-3" />
          Skip setup
        </button>
      </header>

      {/* Progress bar */}
      <StepIndicator
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        labels={STEP_LABELS}
        className="relative z-10 px-6"
      />

      {/* Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-lg">
          <div className="ice-card">
            <div className="ice-card-body">
              {currentStep === 1 && <WelcomeStep />}
              {currentStep === 2 && <TeamStep />}
              {currentStep === 3 && <ConnectCloudStep />}
              {currentStep === 4 && <ConnectGithubStep />}
              {currentStep === 5 && <FirstProjectStep />}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            {/* Back */}
            {currentStep > 1 ? (
              <button
                id="ice-onboarding-nav-btn-back"
                onClick={goBack}
                className="flex items-center gap-1 text-xs text-ice-text-2 hover:text-ice-text-1 px-3 py-1.5 rounded-md hover:bg-ice-hover transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {/* Skip this step */}
              {currentStep < TOTAL_STEPS && (
                <button
                  id="ice-onboarding-nav-btn-skip"
                  onClick={handleSkipStep}
                  className="text-xs text-ice-text-3 hover:text-ice-text-1 px-3 py-1.5 rounded-md hover:bg-ice-hover transition-colors"
                >
                  Skip
                </button>
              )}

              {/* Next / Finish */}
              {currentStep < TOTAL_STEPS ? (
                <button
                  id="ice-onboarding-nav-btn-next"
                  onClick={goNext}
                  className="flex items-center gap-1 text-xs font-medium px-4 py-1.5 rounded-md bg-ice-accent text-white hover:bg-ice-accent-hover transition-colors"
                >
                  Continue
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  id="ice-onboarding-nav-btn-next"
                  onClick={goNext}
                  className="flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-md bg-ice-green text-white hover:bg-ice-green/90 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Create & Start
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
