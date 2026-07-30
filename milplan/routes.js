const express = require('express');
const multer = require('multer');
const { requireAuth } = require('./auth');
const supa = require('./supa');
const { nextSsNumero } = require('./numero');
const { getOrCreateSsFolder, uploadBuffer, downloadFileStream } = require('./drive');
const { enviarSS } = require('./email');
const { gerarPdfSS } = require('./pdf/template');
const { addBusinessDays, toDateOnlyString, ssFileBaseName } = require('./util');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const STATUS_MANUAIS = ['em_analise', 'aprovado', 'reprovado', 'concluido'];

async function getCallerNome(callerUser) {
  const perfil = await supa.selectOne('perfis', { id: callerUser.id }, 'nome');
  return (perfil && perfil.nome) || callerUser.email || 'Usuário';
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function driveConfigurado() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
}

// Gera o PDF da revisão atual da SS, sobe pro Drive e registra o anexo.
// Reaproveitado tanto por /gerar-pdf quanto pelo ciclo de /ressalvas.
// Enquanto o Google Drive não estiver configurado (env vars ausentes), devolve o PDF
// só para visualização — sem persistir nada — pra não travar o teste do layout do PDF
// atrás de uma configuração externa que ainda não foi feita.
async function gerarEArmazenarPdf(ssId, callerNome) {
  const ss = await supa.selectOne('milplan_ss', { id: ssId });
  if (!ss) throw new Error('SS não encontrada');
  const revisoes = await supa.selectMany('milplan_ss_revisoes', { ss_id: ssId }, '*', 'numero_revisao.asc');

  const pdfBuffer = await gerarPdfSS(ss, revisoes);
  const filename = ssFileBaseName(ss.ss_numero, ss.revisao_atual) + '.pdf';

  if (!driveConfigurado()) {
    return { persisted: false, filename, pdfBuffer, ss };
  }

  let folderId = ss.drive_folder_id;
  if (!folderId) {
    folderId = await getOrCreateSsFolder(ss.ss_numero);
    await supa.update('milplan_ss', { id: ssId }, { drive_folder_id: folderId });
  }

  const driveFileId = await uploadBuffer({ folderId, filename, mimeType: 'application/pdf', buffer: pdfBuffer });

  const [anexoRow] = await supa.insert('milplan_ss_anexos', [{
    ss_id: ssId, tipo: 'ss_gerada', nome_arquivo: filename, drive_file_id: driveFileId,
    origem: 'gerado_sistema', enviado_por: null,
  }], { returning: true });
  await supa.update('milplan_ss', { id: ssId }, { pdf_atual_drive_file_id: driveFileId });

  const revisaoAtual = revisoes.find((r) => r.numero_revisao === ss.revisao_atual);
  if (revisaoAtual) {
    await supa.update('milplan_ss_revisoes', { id: revisaoAtual.id }, { pdf_drive_file_id: driveFileId });
  }

  return { persisted: true, driveFileId, anexoId: anexoRow.id, filename, pdfBuffer, ss };
}

async function enviarPdfAtual(ssId) {
  const ss = await supa.selectOne('milplan_ss', { id: ssId });
  if (!ss) throw new Error('SS não encontrada');
  if (!ss.pdf_atual_drive_file_id) throw new Error('Gere o PDF antes de enviar.');
  const filename = ssFileBaseName(ss.ss_numero, ss.revisao_atual) + '.pdf';
  const stream = await downloadFileStream(ss.pdf_atual_drive_file_id);
  const buffer = await streamToBuffer(stream);
  await enviarSS({ ssData: ss, pdfBuffer: buffer, filename });
}

// ── Criar SS ─────────────────────────────────────────────────────────────
router.post('/ss', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.pep || !b.escopo) return res.status(400).json({ error: 'pep e escopo são obrigatórios' });

    const callerNome = await getCallerNome(req.callerUser);
    const ssNumero = await nextSsNumero();
    const hoje = toDateOnlyString(new Date());
    const prazo = toDateOnlyString(addBusinessDays(hoje, 5));

    const row = {
      ss_numero: ssNumero,
      status: 'rascunho',
      pep: b.pep,
      nome_projeto_carteira: b.nome_projeto_carteira || '',
      data_emissao: hoje,
      prazo_plano: prazo,
      lider_squad: b.lider_squad || '',
      lider_nome: b.lider_nome || '',
      lider_telefone: b.lider_telefone || '',
      planejador_nome: b.planejador_nome || '',
      escopo: b.escopo,
      criado_por: req.callerUser.id,
      criado_por_nome: callerNome,
      inicio_previsto: b.inicio_previsto || null,
      codigo_sap: b.codigo_sap || '',
      visita: b.visita === 'Sim' ? 'Sim' : 'Não',
    };
    if (b.contrato) row.contrato = b.contrato;
    if (b.objeto_contrato) row.objeto_contrato = b.objeto_contrato;
    if (b.gestor_contrato_area) row.gestor_contrato_area = b.gestor_contrato_area;
    if (b.gestor_contrato_nome) row.gestor_contrato_nome = b.gestor_contrato_nome;
    if (b.gestor_contrato_telefone) row.gestor_contrato_telefone = b.gestor_contrato_telefone;
    if (b.preposto_area) row.preposto_area = b.preposto_area;
    if (b.preposto_nome) row.preposto_nome = b.preposto_nome;
    if (b.preposto_telefone) row.preposto_telefone = b.preposto_telefone;

    const [created] = await supa.insert('milplan_ss', [row], { returning: true });

    await supa.insert('milplan_ss_revisoes', [{
      ss_id: created.id, numero_revisao: 0, motivo: 'Emissão Inicial', responsavel_nome: callerNome,
    }]);

    res.json({ ok: true, ss: created });
  } catch (e) {
    console.error('[milplan/ss create]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Gerar PDF da revisão atual ───────────────────────────────────────────
router.post('/ss/:id/gerar-pdf', requireAuth, async (req, res) => {
  try {
    const callerNome = await getCallerNome(req.callerUser);
    const result = await gerarEArmazenarPdf(req.params.id, callerNome);
    if (!result.persisted) {
      return res.json({
        ok: true, persisted: false, nome_arquivo: result.filename,
        pdf_base64: result.pdfBuffer.toString('base64'),
        aviso: 'Google Drive não configurado ainda — PDF gerado só para visualização, não foi salvo.',
      });
    }
    res.json({ ok: true, persisted: true, drive_file_id: result.driveFileId, anexo_id: result.anexoId, nome_arquivo: result.filename });
  } catch (e) {
    console.error('[milplan/gerar-pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Enviar e-mail com o PDF atual ────────────────────────────────────────
router.post('/ss/:id/enviar', requireAuth, async (req, res) => {
  try {
    await enviarPdfAtual(req.params.id);
    await supa.update('milplan_ss', { id: req.params.id }, { status: 'aguardando_retorno' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[milplan/enviar]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Registrar retorno "com ressalvas": nova revisão, novo PDF, reenvio ──
router.post('/ss/:id/ressalvas', requireAuth, async (req, res) => {
  try {
    const motivo = (req.body && req.body.motivo) || 'Ressalvas Milplan';
    const ss = await supa.selectOne('milplan_ss', { id: req.params.id });
    if (!ss) return res.status(404).json({ error: 'SS não encontrada' });

    const callerNome = await getCallerNome(req.callerUser);
    const novaRevisao = ss.revisao_atual + 1;

    await supa.insert('milplan_ss_revisoes', [{
      ss_id: ss.id, numero_revisao: novaRevisao, motivo, responsavel_nome: callerNome,
    }]);
    await supa.update('milplan_ss', { id: ss.id }, { revisao_atual: novaRevisao, status: 'recebido_com_ressalvas' });

    await gerarEArmazenarPdf(ss.id, callerNome);
    await enviarPdfAtual(ss.id);
    await supa.update('milplan_ss', { id: ss.id }, { status: 'aguardando_retorno' });

    res.json({ ok: true, revisao_atual: novaRevisao });
  } catch (e) {
    console.error('[milplan/ressalvas]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Transições simples de status ─────────────────────────────────────────
router.patch('/ss/:id/status', requireAuth, async (req, res) => {
  try {
    const status = req.body && req.body.status;
    if (!STATUS_MANUAIS.includes(status)) {
      return res.status(400).json({ error: `status inválido — use um de: ${STATUS_MANUAIS.join(', ')}` });
    }
    await supa.update('milplan_ss', { id: req.params.id }, { status });
    res.json({ ok: true });
  } catch (e) {
    console.error('[milplan/status]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Edição de campos complementares (Início previsto, Código SAP, Visita) ──
router.patch('/ss/:id/campos', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    if ('inicio_previsto' in b) patch.inicio_previsto = b.inicio_previsto || null;
    if ('codigo_sap' in b) patch.codigo_sap = b.codigo_sap || '';
    if ('visita' in b) patch.visita = b.visita === 'Sim' ? 'Sim' : 'Não';
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nada para atualizar' });
    await supa.update('milplan_ss', { id: req.params.id }, patch);
    res.json({ ok: true });
  } catch (e) {
    console.error('[milplan/campos]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Upload manual do retorno da Milplan (Fase 1, até termos domínio próprio) ──
router.post('/ss/:id/anexos', requireAuth, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'arquivo obrigatório (campo "arquivo")' });
    const ss = await supa.selectOne('milplan_ss', { id: req.params.id });
    if (!ss) return res.status(404).json({ error: 'SS não encontrada' });

    let folderId = ss.drive_folder_id;
    if (!folderId) {
      folderId = await getOrCreateSsFolder(ss.ss_numero);
      await supa.update('milplan_ss', { id: ss.id }, { drive_folder_id: folderId });
    }

    const driveFileId = await uploadBuffer({
      folderId, filename: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer,
    });

    const [anexo] = await supa.insert('milplan_ss_anexos', [{
      ss_id: ss.id, tipo: 'retorno_milplan', nome_arquivo: req.file.originalname, drive_file_id: driveFileId,
      origem: 'upload_manual', enviado_por: req.callerUser.id,
    }], { returning: true });

    res.json({ ok: true, anexo });
  } catch (e) {
    console.error('[milplan/anexos upload]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Download de um anexo (PDF gerado ou retorno da Milplan) ─────────────
router.get('/anexo/:anexoId/download', requireAuth, async (req, res) => {
  try {
    const anexo = await supa.selectOne('milplan_ss_anexos', { id: req.params.anexoId });
    if (!anexo) return res.status(404).json({ error: 'Anexo não encontrado' });
    const stream = await downloadFileStream(anexo.drive_file_id);
    res.setHeader('Content-Disposition', `attachment; filename="${anexo.nome_arquivo}"`);
    stream.on('error', (e) => { console.error('[milplan/download stream]', e); if (!res.headersSent) res.status(500).end(); });
    stream.pipe(res);
  } catch (e) {
    console.error('[milplan/download]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
