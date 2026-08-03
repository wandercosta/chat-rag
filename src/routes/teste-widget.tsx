import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/teste-widget")({
  component: TesteWidgetPage,
});

function TesteWidgetPage() {
  useEffect(() => {
    // Injeta o script do widget no rodapé do DOM ao montar a página
    const existingScript = document.getElementById("chatrag-test-widget-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "chatrag-test-widget-script";
      script.src = "/chat-widget.js";
      script.setAttribute("data-key", "pk_test_55042fddd1e4f2fbe30c89b67bd20821830a1c89bb3c9ba2");
      script.setAttribute("data-api", "http://localhost:3333");
      script.setAttribute("data-mode", "floating");
      script.setAttribute("data-position", "bottom-right");
      script.setAttribute("data-theme", "sync");
      script.setAttribute("data-accent", "#6366f1");
      script.setAttribute("data-avatar", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80");
      script.setAttribute("data-online", "true");
      script.setAttribute("data-title", "Suporte Virtual IA");
      script.setAttribute("data-greeting", "Olá! Sou a assistente de demonstração. Como posso te ajudar?");
      script.async = true;

      document.body.appendChild(script);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3 font-bold text-lg">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black">
            C
          </div>
          <span>ChatRAG Suite — Página de Teste</span>
        </div>
        <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-xs font-medium">
          ● Servidor Ativo (Localhost)
        </span>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto my-12 px-6 w-full flex-1">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold mb-3 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Demonstração do Widget Embarcado
          </h1>
          <p className="text-slate-400 text-lg">
            Página simulando um site hospedeiro que carrega o script do ChatRAG no rodapé.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 text-xl font-semibold text-white">
            <span className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
              1
            </span>
            <h2>Script gerado e carregado no rodapé HTML</h2>
          </div>

          <p className="text-slate-400 text-sm">
            O script do widget foi incluído no rodapé da página. Você pode testar e interagir diretamente pelo balão no canto inferior direito.
          </p>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed">
            <span className="text-rose-400">&lt;script</span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">src</span>=
            <span className="text-lime-400">&quot;http://localhost:3000/chat-widget.js&quot;</span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">data-key</span>=
            <span className="text-lime-400">
              &quot;pk_test_55042fddd1e4f2fbe30c89b67bd20821830a1c89bb3c9ba2&quot;
            </span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">data-api</span>=
            <span className="text-lime-400">&quot;http://localhost:3333&quot;</span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">data-mode</span>=
            <span className="text-lime-400">&quot;floating&quot;</span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">data-position</span>=
            <span className="text-lime-400">&quot;bottom-right&quot;</span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">data-theme</span>=
            <span className="text-lime-400">&quot;sync&quot;</span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">data-title</span>=
            <span className="text-lime-400">&quot;Suporte ChatRAG (Teste)&quot;</span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">data-greeting</span>=
            <span className="text-lime-400">
              &quot;Olá! Este é um teste do widget no rodapé. Como posso te ajudar?&quot;
            </span>
            <br />
            &nbsp;&nbsp;<span className="text-sky-400">async</span>
            <br />
            <span className="text-rose-400">&gt;&lt;/script&gt;</span>
          </div>

          <div className="bg-indigo-500/10 border-l-4 border-indigo-500 p-4 rounded-r-lg text-sm text-slate-300">
            👉 <strong>Instrução de teste:</strong> Clique na bolha de chat roxa no canto inferior direito para abrir a janela de conversação e testar o envio e recebimento de mensagens.
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-slate-500 text-sm">
        © 2026 ChatRAG Suite — Página de teste com script injetado no rodapé.
      </footer>
    </div>
  );
}
