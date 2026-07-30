import { describe, expect, it } from "vitest";
import { requireMaster, requireOrgRole } from "./plugin.js";
import type { AuthContext } from "./types.js";

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
  return { reply: reply as any, calls };
}

function fakeRequest(auth: AuthContext | null, organizationId?: string) {
  return { auth, params: { organizationId } } as any;
}

describe("requireMaster", () => {
  it("blocks a request without platform role", async () => {
    const { reply, calls } = fakeReply();
    await requireMaster(fakeRequest({ userId: "u1", isPlatform: false, memberships: [] }), reply);
    expect(calls.code).toBe(403);
  });

  it("allows a request with platform role", async () => {
    const { reply, calls } = fakeReply();
    await requireMaster(fakeRequest({ userId: "u1", isPlatform: true, memberships: [] }), reply);
    expect(calls.code).toBeUndefined();
  });
});

describe("requireOrgRole", () => {
  it("blocks a user with no membership in the target organization", async () => {
    const guard = requireOrgRole(["Administrador"]);
    const { reply, calls } = fakeReply();
    const auth: AuthContext = {
      userId: "u1",
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
      isPlatform: false,
      memberships: [{ organizationId: "org-a", role: "Administrador" }],
    };
    await guard(fakeRequest(auth, "org-a"), reply);
    expect(calls.code).toBeUndefined();
  });

  it("allows Master to bypass membership entirely", async () => {
    const guard = requireOrgRole(["Administrador"]);
    const { reply, calls } = fakeReply();
    const auth: AuthContext = { userId: "master-1", isPlatform: true, memberships: [] };
    await guard(fakeRequest(auth, "org-a"), reply);
    expect(calls.code).toBeUndefined();
  });
});
