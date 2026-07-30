import type { TenantRole } from "../../db/types.js";

export interface AuthContext {
  userId: string;
  email: string;
  isPlatform: boolean;
  memberships: { organizationId: string; role: TenantRole }[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
