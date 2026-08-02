import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "./types.js";

const hasActive = vi.fn<(masterUserId: string, organizationId: string) => Promise<boolean>>();

vi.mock("./support-sessions.service.js", () => ({
  supportSessionsService: { hasActive: (...args: [string, string]) => hasActive(...args) },
}));

const { requireMaster, requireOrgRole, requireMasterSupportSession } = await import("./plugin.js");

function fakeReply() {
  const calls: { code?: number; body?: unknown } = {};
  const reply = {
    code(code: number) {
      calls.code = code;
      return reply;
    },
    send(body: unknown) {
      calls.body = body;
      return reply;
    },
  };
  return { reply: reply as unknown as import("fastify").FastifyReply, calls };
}

function fakeRequest(auth: AuthContext | null, organizationId?: string) {
  return { auth, params: { organizationId } } as unknown as import("fastify").FastifyRequest;
}

beforeEach(() => {
  hasActive.mockReset();
  hasActive.mockResolvedValue(false);
});

describe("requireMaster", () => {
  it("blocks a request without platform role", async () => {
    const { reply, calls } = fakeReply();
    await requireMaster(
      fakeRequest({ userId: "u1", email: "u1@example.com", isPlatform: false, memberships: [] }),
      reply,
    );
    expect(calls.code).toBe(403);
  });

  it("allows a request with platform role", async () => {
    const { reply, calls } = fakeReply();
    await requireMaster(
      fakeRequest({ userId: "u1", email: "u1@example.com", isPlatform: true, memberships: [] }),
      reply,
    );
    expect(calls.code).toBeUndefined();
  });
});

describe("requireOrgRole", () => {
  it("blocks a user with no membership in the target organization", async () => {
    const guard = requireOrgRole(["Administrador"]);
    const { reply, calls } = fakeReply();
    const auth: AuthContext = {
      userId: "u1",
      email: "u1@example.com",
      isPlatform: false,
      memberships: [{ organizationId: "org-a", role: "Administrador" }],
    };
    await guard(fakeRequest(auth, "org-b"), reply);
    expect(calls.code).toBe(403);
  });

  it("blocks a member whose role is below the minimum required", async () => {
    const guard = requireOrgRole(["Administrador"]);
    const { reply, calls } = fakeReply();
    const auth: AuthContext = {
      userId: "u1",
      email: "u1@example.com",
      isPlatform: false,
      memberships: [{ organizationId: "org-a", role: "Analista" }],
    };
    await guard(fakeRequest(auth, "org-a"), reply);
    expect(calls.code).toBe(403);
  });

  it("allows a member with a sufficient role in the target organization", async () => {
    const guard = requireOrgRole(["Administrador"]);
    const { reply, calls } = fakeReply();
    const auth: AuthContext = {
      userId: "u1",
      email: "u1@example.com",
      isPlatform: false,
      memberships: [{ organizationId: "org-a", role: "Administrador" }],
    };
    await guard(fakeRequest(auth, "org-a"), reply);
    expect(calls.code).toBeUndefined();
  });

  it("blocks Master without an active support session for that organization", async () => {
    hasActive.mockResolvedValue(false);
    const guard = requireOrgRole(["Administrador"]);
    const { reply, calls } = fakeReply();
    const auth: AuthContext = {
      userId: "master-1",
      email: "master@example.com",
      isPlatform: true,
      memberships: [],
    };
    await guard(fakeRequest(auth, "org-a"), reply);
    expect(calls.code).toBe(403);
  });

  it("allows Master with an active support session for that organization", async () => {
    hasActive.mockResolvedValue(true);
    const guard = requireOrgRole(["Administrador"]);
    const { reply, calls } = fakeReply();
    const auth: AuthContext = {
      userId: "master-1",
      email: "master@example.com",
      isPlatform: true,
      memberships: [],
    };
    await guard(fakeRequest(auth, "org-a"), reply);
    expect(calls.code).toBeUndefined();
    expect(hasActive).toHaveBeenCalledWith("master-1", "org-a");
  });
});

describe("requireMasterSupportSession", () => {
  it("blocks a non-Master user", async () => {
    const { reply, calls } = fakeReply();
    await requireMasterSupportSession(
      fakeRequest(
        { userId: "u1", email: "u1@example.com", isPlatform: false, memberships: [] },
        "org-a",
      ),
      reply,
    );
    expect(calls.code).toBe(403);
  });

  it("blocks Master without an active session", async () => {
    hasActive.mockResolvedValue(false);
    const { reply, calls } = fakeReply();
    await requireMasterSupportSession(
      fakeRequest(
        { userId: "master-1", email: "master@example.com", isPlatform: true, memberships: [] },
        "org-a",
      ),
      reply,
    );
    expect(calls.code).toBe(403);
  });

  it("allows Master with an active session", async () => {
    hasActive.mockResolvedValue(true);
    const { reply, calls } = fakeReply();
    await requireMasterSupportSession(
      fakeRequest(
        { userId: "master-1", email: "master@example.com", isPlatform: true, memberships: [] },
        "org-a",
      ),
      reply,
    );
    expect(calls.code).toBeUndefined();
  });
});
