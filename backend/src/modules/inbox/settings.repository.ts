import { db } from "../../db/client.js";

export interface InboxSettings {
  firstResponseMinutes: number | null;
  emailOnAssignment: boolean;
}

const DEFAULTS: InboxSettings = { firstResponseMinutes: null, emailOnAssignment: false };

/** Configuracao da caixa de entrada; sem linha, valem os padroes (sem SLA, sem e-mail). */
export const settingsRepository = {
  async get(organizationId: string): Promise<InboxSettings> {
    const row = await db
      .selectFrom("inbox_settings")
      .select(["first_response_minutes", "email_on_assignment"])
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
    return row
      ? {
          firstResponseMinutes: row.first_response_minutes,
          emailOnAssignment: row.email_on_assignment,
        }
      : DEFAULTS;
  },

  async save(organizationId: string, settings: InboxSettings) {
    const values = {
      first_response_minutes: settings.firstResponseMinutes,
      email_on_assignment: settings.emailOnAssignment,
      updated_at: new Date().toISOString(),
    };
    await db
      .insertInto("inbox_settings")
      .values({ organization_id: organizationId, ...values })
      .onConflict((oc) => oc.column("organization_id").doUpdateSet(values))
      .execute();
  },
};
