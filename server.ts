import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("[DEBUG] Servidor iniciando...");
  console.log("[DEBUG] RESEND_API_KEY configurada:", !!process.env.RESEND_API_KEY);

  app.use(express.json());

  // Rota de Teste (Health Check)
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API: Logs de Auditoria
  app.post("/api/audit", (req, res) => {
    const log = req.body;
    console.log("[AUDIT LOG]:", log);
    res.json({ status: "logged" });
  });

  // API: Notificações por E-mail
  app.post("/api/notify", async (req, res) => {
    const { to, subject, html } = req.body;
    console.log("[NOTIFY] Pedido recebido para:", to);
    
    if (!process.env.RESEND_API_KEY) {
      console.error("[NOTIFY ERROR]: RESEND_API_KEY não configurada.");
      return res.status(500).json({ error: "Configuração de e-mail ausente no servidor" });
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      console.log("[NOTIFY] Enviando via Resend...");
      const { data, error } = await resend.emails.send({
        from: "CPD Guaranésia <onboarding@resend.dev>",
        to,
        subject,
        html,
      });

      if (error) {
        console.error("[NOTIFY ERROR]:", JSON.stringify(error, null, 2));
        return res.status(400).json({ error });
      }

      console.log("[NOTIFY SUCCESS]:", data);
      res.json({ status: "sent", data });
    } catch (err: any) {
      console.error("[NOTIFY EXCEPTION]:", err);
      res.status(500).json({ error: err.message || "Erro interno no servidor de e-mail" });
    }
  });

  // Vite middleware para desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor CPD Guaranésia rodando em http://localhost:${PORT}`);
  });
}

startServer();
