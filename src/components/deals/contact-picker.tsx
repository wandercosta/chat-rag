import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contactsApi } from "@/lib/contacts-api";

/** Busca de contato por nome, e-mail ou telefone (o negocio e de um contato). */
export function ContactPicker({
  tenantId,
  value,
  label,
  onChange,
  disabled,
}: {
  tenantId: string;
  value: string | null;
  label: string | null;
  onChange: (contact: { id: string; label: string } | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["contacts-picker", tenantId, search],
    queryFn: () => contactsApi.list(tenantId, { search }),
    enabled: !value && search.trim().length >= 2,
  });

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border px-3 text-sm">
        <span className="truncate">{label ?? "Contato"}</span>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Tirar contato"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        placeholder="Buscar contato (nome, e-mail ou telefone)"
        aria-label="Buscar contato"
        value={search}
        disabled={disabled}
        onChange={(e) => setSearch(e.target.value)}
      />
      {(query.data?.items.length ?? 0) > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border text-sm">
          {query.data!.items.slice(0, 8).map((c) => {
            const text = c.name ?? c.email ?? c.phone ?? "Contato";
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    onChange({ id: c.id, label: text });
                    setSearch("");
                  }}
                >
                  {text}
                  {c.name && c.email && (
                    <span className="ml-2 text-xs text-muted-foreground">{c.email}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
