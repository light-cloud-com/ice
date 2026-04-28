export {
  requireAuth,
  requireProjectAccess,
  requireOrgRole,
  generateToken,
  generateRefreshToken,
  setDesktopUser,
  isDesktopMode,
} from './auth/middleware.js';
export type { AuthRequest } from './auth/middleware.js';
export { encryptCredentials, decryptCredentials, encryptString, decryptString } from './crypto';
export {
  setupSocketService,
  getSocketServer,
  emitDeployNodeStatus,
  emitDeployNodeProgress,
  emitDeployComplete,
  emitDeployLog,
  emitDeployRequirementVerified,
  emitCanvasUpdate,
  emitPipelineUpdate,
  emitCardPipelineUpdate,
} from './socket/service.js';
export type { PipelineStatusUpdate, CardPipelineUpdate } from './socket/service.js';
