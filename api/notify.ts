import { Resend } from "resend";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, subject, html } = req.body;

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "RESEND_API_KEY não configurada no Vercel" });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const recipients = Array.isArray(to) ? to : [to];
    const results = [];

    // Envia individualmente para garantir que o Resend processe cada um
    // e para evitar falhas em massa no plano gratuito
    for (const recipient of recipients) {
      try {
        const { data, error } = await resend.emails.send({
          from: "CPD Guaranésia <onboarding@resend.dev>",
          to: recipient,
          subject,
          html,
        });
        
        results.push({ 
          recipient, 
          success: !error, 
          data: data || null, 
          error: error || null 
        });
      } catch (sendErr: any) {
        results.push({ 
          recipient, 
          success: false, 
          error: sendErr.message || "Erro desconhecido no envio" 
        });
      }
    }

    const hasSuccess = results.some(r => r.success);
    
    if (!hasSuccess) {
      return res.status(400).json({ 
        error: "Nenhum e-mail pôde ser enviado. Verifique se os destinatários são autorizados no seu plano do Resend.",
        details: results 
      });
    }

    return res.status(200).json({ status: "processed", results });
  } catch (err: any) {
    console.error("[Vercel API Exception]:", err);
    return res.status(500).json({ error: "Erro interno ao processar notificações" });
  }
}
