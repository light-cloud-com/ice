/**
 * Email Service — Stub Implementation
 *
 * Logs emails to console. Replace with SendGrid/SES for production.
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export interface SendInviteParams {
  to: string;
  inviterName: string;
  orgName: string;
  token: string;
}

export interface SendProjectInviteParams {
  to: string;
  inviterName: string;
  projectName: string;
  role: string;
}

export async function sendOrgInviteEmail(params: SendInviteParams): Promise<void> {
  const inviteUrl = `${FRONTEND_URL}/invite/${params.token}`;
  console.log(`[EMAIL] ─────────────────────────────────────────`);
  console.log(`[EMAIL] To: ${params.to}`);
  console.log(`[EMAIL] Subject: ${params.inviterName} invited you to "${params.orgName}"`);
  console.log(`[EMAIL] Invite URL: ${inviteUrl}`);
  console.log(`[EMAIL] ─────────────────────────────────────────`);
}

export async function sendProjectInviteEmail(params: SendProjectInviteParams): Promise<void> {
  console.log(`[EMAIL] ─────────────────────────────────────────`);
  console.log(`[EMAIL] To: ${params.to}`);
  console.log(`[EMAIL] Subject: You've been added to "${params.projectName}" as ${params.role}`);
  console.log(`[EMAIL] ─────────────────────────────────────────`);
}
