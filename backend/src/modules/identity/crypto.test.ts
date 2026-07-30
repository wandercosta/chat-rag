import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./crypto.js";

describe("crypto", () => {
  it("verifies a matching password against its hash", async () => {
    const hash = await hashPassword("uma-senha-forte");
    await expect(verifyPassword(hash, "uma-senha-forte")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("uma-senha-forte");
    await expect(verifyPassword(hash, "senha-errada")).resolves.toBe(false);
  });

  it("never stores the plain password inside the hash", async () => {
    const hash = await hashPassword("uma-senha-forte");
    expect(hash).not.toContain("uma-senha-forte");
  });
});
