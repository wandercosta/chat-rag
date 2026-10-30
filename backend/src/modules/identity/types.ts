import type { TenantRole } from "../../db/types.js";

export interface AuthContext {
  userId: string;
  email: string;
  /** Verificacao em duas etapas ativa (o painel e a regra do Master usam). */
  twoFactorEnabled: boolean;
  isPlatform: boolean;
  memberships: { organizationId: string; role: TenantRole }[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
