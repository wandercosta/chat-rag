import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { identityService } from "../identity/index.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { organizationsService } from "./service.js";

describe.skipIf(!RUN_INTEGRATION_TESTS)("organizationsService (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("creates a tenant with its initial admin and an audit event atomically", async () => {
    const master = await identityService.createUser(db, "master@chatrag.local", "senha-forte-123");
    await db.insertInto("platform_roles").values({ user_id: master.id }).execute();

    const result = await organizationsService.createTenant(master.id, {
      name: "Acme",
      slug: "acme",
      adminEmail: "admin@acme.com",
      adminPassword: "outra-senha-forte",
    });

    expect(result.organization.name).toBe("Acme");

    const membership = await db
      .selectFrom("memberships")
      .selectAll()
      .where("organization_id", "=", result.organization.id)
      .executeTakeFirst();
    expect(membership?.role).toBe("Administrador");

    const auditEvent = await db
      .selectFrom("audit_events")
      .selectAll()
      .where("organization_id", "=", result.organization.id)
      .executeTakeFirst();
    expect(auditEvent?.action).toBe("Criou tenant");
  });

  it("never leaves a partially created tenant when the slug already exists", async () => {
    const master = await identityService.createUser(db, "master2@chatrag.local", "senha-forte-123");
    await db.insertInto("platform_roles").values({ user_id: master.id }).execute();

    const input = {
      name: "Acme",
      slug: "acme-duplicado",
      adminEmail: "admin@acme.com",
      adminPassword: "outra-senha-forte",
    };
    await organizationsService.createTenant(master.id, input);

    await expect(
      organizationsService.createTenant(master.id, { ...input, adminEmail: "outro@acme.com" }),
    ).rejects.toThrow();

    const users = await db.selectFrom("users").selectAll().where("email", "=", "outro@acme.com").execute();
    expect(users).toHaveLength(0);
  });
});
