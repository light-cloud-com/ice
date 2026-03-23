/**
 * Wizard State Hook
 *
 * Local React hook managing multi-step wizard form state,
 * validation, and navigation.
 */

import { useState, useCallback } from 'react';
import type { Provider } from '../../../config/blocks/types';
import type { SecurityLevel, EnvironmentPreset } from '../../../config/templates/types';

// =============================================================================
// Types
// =============================================================================

export interface WizardEnvironment {
  enabled: boolean;
  type: 'production' | 'staging' | 'development' | 'pr';
  name: string;
  region: string;
  securityLevel: SecurityLevel;
}

export interface WizardState {
  step: number; // 1-4
  // Step 1: Project Info
  projectName: string;
  projectDescription: string;
  provider: Provider;
  // Step 2: Environments
  environments: WizardEnvironment[];
  // Step 3: Template
  selectedTemplateId: string | null; // null = blank
  searchQuery: string;
}

export interface WizardValidation {
  step1Valid: boolean;
  step2Valid: boolean;
  step3Valid: boolean;
}

const DEFAULT_ENVIRONMENTS: WizardEnvironment[] = [
  {
    enabled: true,
    type: 'production',
    name: 'Production',
    region: 'us-central1',
    securityLevel: 'standard',
  },
  {
    enabled: true,
    type: 'staging',
    name: 'Staging',
    region: 'us-central1',
    securityLevel: 'basic',
  },
  {
    enabled: false,
    type: 'development',
    name: 'Development',
    region: 'us-central1',
    securityLevel: 'basic',
  },
  { enabled: false, type: 'pr', name: 'PR Preview', region: 'us-central1', securityLevel: 'basic' },
];

// =============================================================================
// Hook
// =============================================================================

export function useWizardState() {
  const [state, setState] = useState<WizardState>({
    step: 1,
    projectName: '',
    projectDescription: '',
    provider: 'aws',
    environments: DEFAULT_ENVIRONMENTS.map((e) => ({ ...e })),
    selectedTemplateId: null,
    searchQuery: '',
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    setState((s) => ({ ...s, step: Math.min(s.step + 1, 4) }));
  }, []);

  const goBack = useCallback(() => {
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 1) }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState((s) => ({ ...s, step: Math.max(1, Math.min(step, 4)) }));
  }, []);

  // ── Step 1 setters ────────────────────────────────────────────────────────

  const setProjectName = useCallback((projectName: string) => {
    setState((s) => ({ ...s, projectName }));
  }, []);

  const setProjectDescription = useCallback((projectDescription: string) => {
    setState((s) => ({ ...s, projectDescription }));
  }, []);

  const setProvider = useCallback((provider: Provider) => {
    setState((s) => ({ ...s, provider }));
  }, []);

  // ── Step 2 setters ────────────────────────────────────────────────────────

  const toggleEnvironment = useCallback((index: number) => {
    setState((s) => {
      const environments = s.environments.map((e, i) => (i === index ? { ...e, enabled: !e.enabled } : e));
      return { ...s, environments };
    });
  }, []);

  const setEnvironmentRegion = useCallback((index: number, region: string) => {
    setState((s) => {
      const environments = s.environments.map((e, i) => (i === index ? { ...e, region } : e));
      return { ...s, environments };
    });
  }, []);

  const setEnvironmentSecurity = useCallback((index: number, securityLevel: SecurityLevel) => {
    setState((s) => {
      const environments = s.environments.map((e, i) => (i === index ? { ...e, securityLevel } : e));
      return { ...s, environments };
    });
  }, []);

  const setAllSecurityLevel = useCallback((securityLevel: SecurityLevel) => {
    setState((s) => ({
      ...s,
      environments: s.environments.map((e) => ({ ...e, securityLevel })),
    }));
  }, []);

  const applyEnvironmentPresets = useCallback((presets: EnvironmentPreset[]) => {
    setState((s) => {
      const environments = s.environments.map((env) => {
        const preset = presets.find((p) => p.type === env.type);
        if (preset) {
          return {
            ...env,
            enabled: true,
            region: preset.region,
            securityLevel: preset.securityLevel,
          };
        }
        return { ...env, enabled: false };
      });
      return { ...s, environments };
    });
  }, []);

  // ── Step 3 setters ────────────────────────────────────────────────────────

  const setSelectedTemplateId = useCallback((selectedTemplateId: string | null) => {
    setState((s) => ({ ...s, selectedTemplateId }));
  }, []);

  const setSearchQuery = useCallback((searchQuery: string) => {
    setState((s) => ({ ...s, searchQuery }));
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────

  const validation: WizardValidation = {
    step1Valid: state.projectName.trim().length > 0,
    step2Valid: state.environments.some((e) => e.enabled),
    step3Valid: true, // blank is allowed
  };

  const canProceed =
    (state.step === 1 && validation.step1Valid) ||
    (state.step === 2 && validation.step2Valid) ||
    (state.step === 3 && validation.step3Valid) ||
    state.step === 4;

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setState({
      step: 1,
      projectName: '',
      projectDescription: '',
      provider: 'aws',
      environments: DEFAULT_ENVIRONMENTS.map((e) => ({ ...e })),
      selectedTemplateId: null,
      searchQuery: '',
    });
  }, []);

  return {
    state,
    validation,
    canProceed,
    // Navigation
    goNext,
    goBack,
    goToStep,
    // Step 1
    setProjectName,
    setProjectDescription,
    setProvider,
    // Step 2
    toggleEnvironment,
    setEnvironmentRegion,
    setEnvironmentSecurity,
    setAllSecurityLevel,
    applyEnvironmentPresets,
    // Step 3
    setSelectedTemplateId,
    setSearchQuery,
    // Reset
    reset,
  };
}
