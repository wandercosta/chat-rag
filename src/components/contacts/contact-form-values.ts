/** Estado do formulario de contato e conversao para a API. */
export interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  optIn: boolean;
  tagIds: string[];
  customFields: Record<string, string>;
}

export const emptyContactForm: ContactFormValues = {
  name: "",
  email: "",
  phone: "",
  optIn: false,
  tagIds: [],
  customFields: {},
};

/** Valores do formulario no formato da API (vazio vira null). */
export function toContactInput(values: ContactFormValues) {
  return {
    name: values.name.trim() || null,
    email: values.email.trim() || null,
    phone: values.phone.trim() || null,
    optIn: values.optIn,
    tagIds: values.tagIds,
    customFields: Object.fromEntries(
      Object.entries(values.customFields).filter(([, v]) => v.trim() !== ""),
    ),
  };
}
