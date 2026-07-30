const nodemailer = require('nodemailer');
const { formatDateBR, padSsNumero } = require('./util');

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

// Versão curta do objeto do contrato, só para o corpo do e-mail (o PDF em anexo
// traz o texto legal completo). Mesmo contrato fixo 5500132497 de sempre.
const OBJETO_CONTRATO_CURTO = 'Serviços de Manutenção, Montagem e Desmontagem Eletromecânica – Mina do Salobo';

const ITENS_PLANO_EXECUCAO = [
  'Escopo e descrição dos serviços',
  'Planilha de Quantidades (PQ)',
  'Estrutura Analítica do Projeto (EAP)',
  'Cronograma físico-operacional',
  'Histogramas de mão de obra e equipamentos',
  'Organograma',
  'Orçamento (ORC)',
  'Lista de pendências',
  'Plano de aquisição de materiais',
  'Curva de desembolso',
];

function montarEmailHtml(ssData) {
  const ssLabel = `SS-Milplan-${padSsNumero(ssData.ss_numero)}`;
  const itensHtml = ITENS_PLANO_EXECUCAO.map((item) => `<li style="margin-bottom:4px">${item};</li>`).join('');

  return `
<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1a2a40;line-height:1.5">
  <div style="background:#0f4c75;color:#fff;padding:26px 24px;text-align:center;border-radius:6px 6px 0 0">
    <div style="font-size:18px;font-weight:700">Nova demanda cadastrada</div>
    <div style="font-size:22px;font-weight:800;margin-top:4px">${ssLabel}</div>
  </div>
  <div style="padding:24px 22px;border:1px solid #d0dff0;border-top:none;border-radius:0 0 6px 6px">
    <p>Prezado Sr. ${ssData.preposto_nome || ''},</p>
    <p>Em atendimento ao Contrato n° <strong>${ssData.contrato || ''}</strong> (${OBJETO_CONTRATO_CURTO}), formalizamos a
      Solicitação de Serviço <strong>${ssLabel}</strong>, cujo detalhamento completo segue em anexo (PDF).</p>

    <table style="width:100%;background:#f8fafc;border-radius:6px;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:10px 14px;font-weight:700;width:140px;border-bottom:1px solid #e2e8f0">Projeto:</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${(ssData.nome_projeto_carteira || '').toUpperCase()}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:700">Data de emissão:</td>
        <td style="padding:10px 14px">${formatDateBR(ssData.data_emissao)}</td>
      </tr>
    </table>

    <p>Conforme cláusulas contratuais, solicitamos a apresentação do Plano de Execução de Obra em até
      <strong>05 (cinco) dias</strong> após o recebimento desta, contendo os itens previstos na SS:</p>

    <ul style="padding-left:20px;margin:12px 0">${itensHtml}</ul>

    <p>Permanecemos à disposição para os alinhamentos técnicos necessários.</p>
    <p>Atenciosamente,<br><strong>Líder do Squad: ${ssData.lider_nome || ''}</strong></p>
  </div>
</div>`.trim();
}

// Fase 1: envio direto via Gmail (sem domínio próprio ainda). Fase 2 (futura, com
// domínio) troca isso por um provedor transacional com inbound parse, sem mudar
// quem chama esta função — só o que acontece dentro dela.
async function enviarSS({ ssData, pdfBuffer, filename }) {
  const to = process.env.MILPLAN_EMAIL_TO;
  if (!to) throw new Error('MILPLAN_EMAIL_TO não configurado');
  const ssLabel = `SS-Milplan-${padSsNumero(ssData.ss_numero)}`;
  return getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject: `Nova demanda cadastrada — ${ssLabel}`,
    text: `Segue em anexo a Solicitação de Serviço ${ssLabel}.`,
    html: montarEmailHtml(ssData),
    attachments: [{ filename, content: pdfBuffer }],
  });
}

module.exports = { enviarSS };
