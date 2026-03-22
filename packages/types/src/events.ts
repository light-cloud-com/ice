/** Socket.IO event types */

export interface DeployProgressEvent {
  type: 'log' | 'progress' | 'complete';
  message?: string;
  resource?: string;
  action?: string;
  status?: string;
  progress?: number;
  success?: boolean;
  results?: any;
}

export interface CanvasUpdateEvent {
  type: 'node:add' | 'node:update' | 'node:delete' | 'edge:add' | 'edge:delete' | 'card:update';
  cardId: string;
  userId: string;
  data: any;
}
