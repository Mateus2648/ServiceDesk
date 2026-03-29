import { Resend } from "resend";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, subject, html } = req.body;

  if (!process.env.RESEND_API_KEY) {
    console.error("[Vercel API] RESEND_API_KEY não configurada.");
    return res.status(500).json({ error: "Configuração de e-mail ausente no servidor" });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const { data, error } = await resend.emails.send({
      from: "CPD Guaranésia <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[Vercel API Error]:", error);
      return res.status(400).json({ error });
    }

    return res.status(200).json({ status: "sent", data });
  } catch (err: any) {
    console.error("[Vercel API Exception]:", err);
    return res.status(500).json({ error: err.message || "Erro interno no servidor de e-mail" });
  }
}
