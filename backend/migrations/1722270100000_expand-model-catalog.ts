import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO ai_model_catalog (id, label, note, enabled) VALUES
      ('gpt-4o-mini', 'GPT-4o Mini', 'OpenAI — Padrão, rápido e econômico', true),
      ('gpt-4o', 'GPT-4o', 'OpenAI — Raciocínio e alta inteligência', true),
      ('o1-mini', 'OpenAI o1-mini', 'OpenAI — Raciocínio rápido para exatas e código', true),
      ('o1', 'OpenAI o1', 'OpenAI — Raciocínio avançado e lógica profunda', true),
      ('o3-mini', 'OpenAI o3-mini', 'OpenAI — Nova geração de raciocínio', true),
      ('gpt-4-turbo', 'GPT-4 Turbo', 'OpenAI — Modelo com grande contexto', true),
      ('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'Anthropic — Alta inteligência em código e redação', true),
      ('claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 'Anthropic — Ultrarrápido e eficiente', true),
      ('claude-3-opus-20240229', 'Claude 3 Opus', 'Anthropic — Análise profunda e raciocínio', true),
      ('gemini-2.0-flash', 'Gemini 2.0 Flash', 'Google — Rápido, moderno e multimodal', true),
      ('gemini-1.5-flash', 'Gemini 1.5 Flash', 'Google — Custo extremamente baixo', true),
      ('gemini-1.5-pro', 'Gemini 1.5 Pro', 'Google — Janela de contexto massiva', true),
      ('deepseek-chat', 'DeepSeek-V3', 'DeepSeek — Modelo geral de alto desempenho', true),
      ('deepseek-reasoner', 'DeepSeek-R1', 'DeepSeek — Raciocínio e matemática avançada', true),
      ('llama-3.3-70b-versatile', 'Llama 3.3 70B', 'Meta — Open-source de alta capacidade', true),
      ('mixtral-8x7b-32768', 'Mixtral 8x7B', 'Mistral — Alta velocidade e contexto longo', true)
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label,
      note = EXCLUDED.note,
      enabled = EXCLUDED.enabled;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Não removemos para não quebrar referências em assistentes existentes
}
