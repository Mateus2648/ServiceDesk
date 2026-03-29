import nodemailer from "nodemailer";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, subject, html } = req.body;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return res.status(500).json({ error: "Configuração SMTP incompleta no Vercel" });
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

    return res.status(200).json({ status: "sent", messageId: info.messageId });
  } catch (err: any) {
    console.error("[Vercel SMTP Exception]:", err);
    return res.status(500).json({ error: err.message || "Erro interno ao processar notificações SMTP" });
  }
}
