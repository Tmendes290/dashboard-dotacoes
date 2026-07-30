const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER/GMAIL_APP_PASSWORD não configurados');
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  return transporter;
}

// Fase 1: envio direto via Gmail (sem domínio próprio ainda). Fase 2 (futura, com
// domínio) troca isso por um provedor transacional com inbound parse, sem mudar
// quem chama esta função — só o que acontece dentro dela.
async function enviarSS({ ssNumero, pdfBuffer, filename }) {
  const to = process.env.MILPLAN_EMAIL_TO;
  if (!to) throw new Error('MILPLAN_EMAIL_TO não configurado');
  return getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject: `Solicitação de Serviço ${filename.replace(/\.pdf$/i, '')}`,
    text: `Segue em anexo a Solicitação de Serviço nº ${ssNumero}.`,
    attachments: [{ filename, content: pdfBuffer }],
  });
}

module.exports = { enviarSS };
