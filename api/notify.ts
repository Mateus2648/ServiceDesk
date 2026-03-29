export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, subject, html } = req.body;

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "RESEND_API_KEY não configurada no Vercel" });
  }

  try {
    // Importação dinâmica para evitar problemas de módulo no Vercel
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const recipients = Array.isArray(to) ? to : [to];
    const results = [];

    // Envia individualmente para evitar bloqueios do plano gratuito do Resend
    // e para facilitar a identificação de qual e-mail falhou
    for (const recipient of recipients) {
      try {
        const result = await resend.emails.send({
          from: "CPD Guaranésia <onboarding@resend.dev>",
          to: recipient,
          subject,
          html,
        });
        results.push({ recipient, success: !result.error, data: result.data, error: result.error });
      } catch (sendErr: any) {
        results.push({ recipient, success: false, error: sendErr.message });
      }
    }

    const hasSuccess = results.some(r => r.success);
    
    if (!hasSuccess) {
      return res.status(400).json({ 
        error: "Falha ao enviar e-mails. Verifique se os destinatários estão autorizados no Resend.",
        details: results 
      });
    }

    return res.status(200).json({ status: "processed", results });
  } catch (err: any) {
    console.error("[Vercel API Exception]:", err);
    return res.status(500).json({ error: err.message || "Erro interno no servidor de e-mail" });
  }
}
