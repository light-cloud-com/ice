/**
 * Project Wizard — Root Modal
 *
 * Multi-step Radix Dialog that orchestrates:
 *   Step 1: Project Info → Step 2: Environments → Step 3: Template → Step 4: Review
 *
 * On "Create Project" dispatches to projectsSlice + cardsSlice,
 * opens first environment card, and closes the dialog.
 */

import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import React, { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import { COMPOSED_TEMPLATES, expandComposedTemplate } from '../../../config/templates';
import axiosInstance from '../../../shared/api/axios-instance';
import { StepIndicator } from '../../../shared/components/step-indicator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../shared/components/ui/dialog';
import { cn } from '../../../shared/utils/cn';
import { toSlug } from '../../../shared/utils/slug';
import { closeDialog } from '../../../store/slices/ui-slice';
import { useWizardState } from '../hooks/use-wizard-state';
import { EnvironmentStep } from '../steps/environment-step';
import { ProjectInfoStep } from '../steps/project-info-step';
import { ReviewStep } from '../steps/review-step';
import { TemplateStep } from '../steps/template-step';
import type { RootState, AppDispatch } from '../../../store';

export const ProjectWizard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isOpen = useSelector((state: RootState) => state.ui.dialogs.projectWizard);
  const selectedOrg = useSelector((state: RootState) => state.account?.selectedOrg);

  const STEP_LABELS = [
    t('wizard.stepProject'),
    t('wizard.stepEnvironments'),
    t('wizard.stepTemplate'),
    t('wizard.stepReview'),
  ];

  const wizard = useWizardState();
  const { state, canProceed } = wizard;

  // ── Close handler ─────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    dispatch(closeDialog('projectWizard'));
    wizard.reset();
  }, [dispatch, wizard]);

  // ── Create handler ────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    try {
      // 1. Create project in backend DB
      const orgId = selectedOrg?.id;
      const res = await axiosInstance.post('/canvas/projects/create', {
        name: state.projectName,
        description: state.projectDescription,
        type: 'project',
        organisationId: orgId,
      });
      const project = res.data;

      // 2. Save provider & region to project
      if (state.provider) {
        const firstEnv = state.environments.find((e) => e.enabled);
        await axiosInstance.post('/canvas/projects/update', {
          projectId: project.id,
          provider: state.provider,
          region: firstEnv?.region || '',
        });
      }

      // 3. If template selected, create card with template nodes
      const template = state.selectedTemplateId
        ? COMPOSED_TEMPLATES.find((t) => t.id === state.selectedTemplateId) || null
        : null;

      if (template) {
        // Create a card
        const cardRes = await axiosInstance.post('/canvas/cards/create', {
          name: state.projectName,
          projectId: project.id,
        });
        const card = cardRes.data;

        // Expand template and save to card
        const expanded = expandComposedTemplate(template, state.provider);
        await axiosInstance.post('/canvas/cards/update', {
          cardId: card.id,
          nodes: expanded.nodes,
          edges: expanded.edges,
        });
      }

      // 4. Create additional environments from wizard config (production already created by backend)
      const enabledEnvs = state.environments.filter((e) => e.enabled && e.type !== 'production');
      for (const env of enabledEnvs) {
        try {
          await axiosInstance.post('/environments/create', {
            projectId: project.id,
            name: env.name.toLowerCase(),
            type: env.type,
            region: env.region || undefined,
          });
        } catch (envErr) {
          console.warn(`Failed to create ${env.name} environment:`, envErr);
        }
      }

      // 5. Refresh project tree in sidebar
      if (orgId) {
        const { fetchProjectTree } = await import('../../../store/slices/projects-slice');
        dispatch(fetchProjectTree(orgId));
      }

      // 6. Close wizard
      handleClose();

      // 7. Navigate to the new project
      if (selectedOrg) {
        const orgSlug = toSlug(selectedOrg.name);
        const projectSlug = project.slug || toSlug(state.projectName);
        navigate(`/${orgSlug}/${projectSlug}`);
      } else {
        // Fallback: reload current page to show the new project
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  }, [state, selectedOrg, navigate, handleClose, dispatch]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg bg-ice-base border-ice-border text-ice-text-1 p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold text-ice-text-1">{t('wizard.title')}</DialogTitle>
          <DialogDescription className="text-xs text-ice-text-2">
            {t('wizard.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <StepIndicator currentStep={state.step} totalSteps={4} labels={STEP_LABELS} />

        {/* Step content */}
        <div className="px-5 pb-2 min-h-[320px]">
          {state.step === 1 && (
            <ProjectInfoStep
              projectName={state.projectName}
              projectDescription={state.projectDescription}
              provider={state.provider}
              onNameChange={wizard.setProjectName}
              onDescriptionChange={wizard.setProjectDescription}
              onProviderChange={wizard.setProvider}
            />
          )}
          {state.step === 2 && (
            <EnvironmentStep
              environments={state.environments}
              onToggle={wizard.toggleEnvironment}
              onRegionChange={wizard.setEnvironmentRegion}
              onSecurityChange={wizard.setEnvironmentSecurity}
              onAllSecurityChange={wizard.setAllSecurityLevel}
            />
          )}
          {state.step === 3 && (
            <TemplateStep
              selectedTemplateId={state.selectedTemplateId}
              searchQuery={state.searchQuery}
              provider={state.provider}
              onSelect={wizard.setSelectedTemplateId}
              onSearchChange={wizard.setSearchQuery}
            />
          )}
          {state.step === 4 && <ReviewStep state={state} />}
        </div>

        {/* Footer — navigation buttons */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-ice-border">
          {/* Back */}
          {state.step > 1 ? (
            <button
              onClick={wizard.goBack}
              className="flex items-center gap-1 text-xs text-ice-text-2 hover:text-ice-text-1 px-3 py-1.5 rounded-md hover:bg-ice-hover transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {t('wizard.backButton')}
            </button>
          ) : (
            <div />
          )}

          {/* Next / Create */}
          {state.step < 4 ? (
            <button
              onClick={wizard.goNext}
              disabled={!canProceed}
              className={cn(
                'flex items-center gap-1 text-xs font-medium px-4 py-1.5 rounded-md transition-colors',
                canProceed
                  ? 'bg-ice-accent text-ice-text-1 hover:bg-ice-accent-hover'
                  : 'bg-ice-raised text-ice-text-3 cursor-not-allowed',
              )}
            >
              {t('wizard.nextButton')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-md bg-ice-green text-ice-text-1 hover:bg-ice-green/90 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t('wizard.createButton')}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
