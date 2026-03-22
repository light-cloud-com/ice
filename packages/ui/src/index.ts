// API Adapter
export { setApiAdapter, getApi } from './api/adapter';
export type { IceAPI } from './api/adapter';

// Store
export { store } from './store/index';

// Component sub-paths — import via '@ice/ui/canvas', '@ice/ui/deploy', etc.
export * as Canvas from './features/canvas/index';
export * as Deploy from './features/deploy/index';
export * as Properties from './features/properties/index';
export * as Palette from './features/palette/index';
export * as Templates from './features/templates/index';
export * as AI from './features/ai/index';
export * as Wizard from './features/wizard/index';
export * as Debug from './features/debug/index';
export * as Integrations from './features/integrations/index';
export * as Primitives from './primitives/index';
