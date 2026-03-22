/** Auth API contracts */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserProfile;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface TokenPayload {
  userId: string;
  organisationId: string;
  type?: 'refresh';
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  organisationId?: string;
  organisations?: OrganisationMembership[];
}

export interface OrganisationMembership {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}
