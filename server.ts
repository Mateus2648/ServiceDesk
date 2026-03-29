import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Logs de Auditoria
  app.post("/api/audit", (req, res) => {
    const log = req.body;
    console.log("[AUDIT LOG]:", log);
    res.json({ status: "logged" });
  });

  // API: Notificações por E-mail (SMTP)
  app.post("/api/notify", async (req, res) => {
    const { to, subject, html } = req.body;
    
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      console.error("[NOTIFY ERROR]: Configuração SMTP incompleta.");
      return res.status(500).json({ error: "Configuração de e-mail SMTP incompleta no servidor" });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT),
        secure: parseInt(SMTP_PORT) === 465, // true para 465, false para outros
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: SMTP_FROM || SMTP_USER,
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
        html,
      });

      console.log("[NOTIFY SUCCESS]:", info.messageId);
      res.json({ status: "sent", messageId: info.messageId });
    } catch (err: any) {
      console.error("[NOTIFY EXCEPTION]:", err);
      res.status(500).json({ error: err.message || "Erro interno no servidor de e-mail SMTP" });
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
