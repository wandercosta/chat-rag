import { randomBytes } from "node:crypto";
import { redis } from "../../db/redis.js";
import { env } from "../../config/env.js";

const TTL_SECONDS = env.SESSION_TTL_HOURS * 3600;

function sessionKey(token: string) {
  return `session:${token}`;
}

export const sessions = {
  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await redis.set(sessionKey(token), userId, "EX", TTL_SECONDS);
    return token;
  },

  async resolve(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    return redis.get(sessionKey(token));
  },

  async destroy(token: string): Promise<void> {
    await redis.del(sessionKey(token));
  },
};
