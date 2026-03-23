// API Adapter
export { setApiAdapter, getApi } from './api/adapter';
export type { IceAPI } from './api/adapter';

// Store
export { store } from "./store";

// Component sub-paths — import via '@ice/ui/canvas', '@ice/ui/deploy', etc.
export * as Canvas from "./features/canvas";
export * as Deploy from "./features/deploy";
export * as Properties from "./features/properties";
export * as Palette from "./features/palette";
export * as Templates from "./features/templates";
export * as AI from "./features/ai";
export * as Wizard from "./features/wizard";
export * as Debug from "./features/debug";
export * as Integrations from "./features/integrations";
export * as Primitives from "./primitives";
