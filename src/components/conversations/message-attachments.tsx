import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { conversationsApi, type MessageAttachment } from "@/lib/api-client";

const KIND_LABEL: Record<MessageAttachment["kind"], string> = {
  imagem: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  documento: "Documento",
  figurinha: "Figurinha",
};

function sizeLabel(bytes: number | null) {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? ` · ${Math.ceil(bytes / 1024)} KB`
    : ` · ${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Arquivo recebido pelo canal. A API so entrega como download; aqui ele vira
 * um blob local para mostrar imagem, tocar audio/video ou salvar o documento.
 */
function Attachment({
  organizationId,
  conversationId,
  attachment: a,
}: {
  organizationId: string;
  conversationId: string;
  attachment: MessageAttachment;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const preview = a.kind === "imagem" || a.kind === "figurinha";

  async function load() {
    setLoading(true);
    try {
      const blob = await conversationsApi.attachment(organizationId, conversationId, a.id);
      const objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      return objectUrl;
    } catch {
      toast.error("Não foi possível abrir o arquivo");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (preview && a.status === "pronto") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id, a.status]);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  async function save() {
    const objectUrl = url ?? (await load());
    if (!objectUrl) return;
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = a.file_name ?? `${a.kind}-${a.id}`;
    link.click();
  }

  if (a.status === "pendente") {
    return (
      <p className="flex items-center gap-1 text-xs opacity-80">
        <Loader2 className="h-3 w-3 animate-spin" /> Recebendo {KIND_LABEL[a.kind].toLowerCase()}…
      </p>
    );
  }
  if (a.status === "falhou") {
    return (
      <p className="text-xs opacity-80">
        {KIND_LABEL[a.kind]} não recebido{a.error ? `: ${a.error}` : ""}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {preview && url && (
        <img
          src={url}
          alt={a.file_name ?? KIND_LABEL[a.kind]}
          className="max-h-60 max-w-full rounded-md"
        />
      )}
      {a.kind === "audio" && url && <audio controls src={url} className="max-w-full" />}
      {a.kind === "video" && url && <video controls src={url} className="max-h-60 max-w-full" />}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {!preview && <FileText className="h-3.5 w-3.5" />}
        <span className="opacity-80">
          {a.file_name ?? KIND_LABEL[a.kind]}
          {sizeLabel(a.size_bytes)}
        </span>
        {(a.kind === "audio" || a.kind === "video") && !url && (
          <Button
            size="sm"
            variant="secondary"
            className="h-6 px-2"
            disabled={loading}
            onClick={load}
          >
            {a.kind === "audio" ? "Ouvir" : "Assistir"}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          className="h-6 px-2"
          disabled={loading}
          onClick={save}
          aria-label="Baixar arquivo"
        >
          <Download className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function MessageAttachments({
  organizationId,
  conversationId,
  attachments,
}: {
  organizationId: string;
  conversationId: string;
  attachments?: MessageAttachment[];
}) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {attachments.map((a) => (
        <Attachment
          key={a.id}
          organizationId={organizationId}
          conversationId={conversationId}
          attachment={a}
        />
      ))}
    </div>
  );
}
