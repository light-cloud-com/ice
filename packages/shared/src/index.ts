export {
  requireAuth,
  requireProjectAccess,
  requireOrgRole,
  generateToken,
  generateRefreshToken,
  setDesktopUser,
  isDesktopMode,
} from './auth/middleware';
export type { AuthRequest } from './auth/middleware';
export { encryptCredentials, decryptCredentials, encryptString, decryptString } from './crypto';
export { ensureLocalSecrets } from './local-secrets/index';
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
} from './socket/service';
export type { PipelineStatusUpdate, CardPipelineUpdate } from './socket/service';
