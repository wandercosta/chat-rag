import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { InvalidCredentialsError, identityService } from "./service.js";

describe.skipIf(!RUN_INTEGRATION_TESTS)("identityService (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("logs in with correct credentials and resolves the session afterwards", async () => {
    await identityService.createUser(db, "user@acme.com", "senha-correta");

    const token = await identityService.login("user@acme.com", "senha-correta");
    expect(token).toBeTruthy();

    const auth = await identityService.resolveAuth(token);
    expect(auth?.isPlatform).toBe(false);
  });

  it("rejects login with a wrong password", async () => {
    await identityService.createUser(db, "user2@acme.com", "senha-correta");
    await expect(identityService.login("user2@acme.com", "senha-errada")).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it("invalidates the session after logout", async () => {
    await identityService.createUser(db, "user3@acme.com", "senha-correta");
    const token = await identityService.login("user3@acme.com", "senha-correta");

    await identityService.logout(token);

    const auth = await identityService.resolveAuth(token);
    expect(auth).toBeNull();
  });
});
