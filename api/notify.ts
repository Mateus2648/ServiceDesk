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
      secure: parseInt(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    // Para evitar erro 550 (Spoofing not allowed), o 'from' deve ser o e-mail autenticado
    const fromAddress = SMTP_USER;

    const info = await transporter.sendMail({
      from: `CPD Guaranésia <${fromAddress}>`,
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
