const { google } = require('googleapis');
const { Readable } = require('stream');
const { padSsNumero } = require('./util');

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

let driveClient = null;
function getDrive() {
  if (driveClient) return driveClient;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurado');
  const key = JSON.parse(raw);
  const auth = new google.auth.JWT(key.client_email, null, key.private_key, ['https://www.googleapis.com/auth/drive']);
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

// Uma subpasta por SS (SS-Milplan-032/), criada sob demanda na primeira geração de PDF.
async function getOrCreateSsFolder(ssNumero) {
  if (!ROOT_FOLDER_ID) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID não configurado');
  const drive = getDrive();
  const name = `SS-Milplan-${padSsNumero(ssNumero)}`;
  const q = `'${ROOT_FOLDER_ID}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const existing = await drive.files.list({ q, fields: 'files(id,name)' });
  if (existing.data.files && existing.data.files.length) return existing.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [ROOT_FOLDER_ID] },
    fields: 'id',
  });
  return created.data.id;
}

async function uploadBuffer({ folderId, filename, mimeType, buffer }) {
  const drive = getDrive();
  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  });
  return created.data.id;
}

// Retorna um stream legível pra pipe direto na resposta HTTP (server nunca expõe a credencial ao browser).
async function downloadFileStream(fileId) {
  const drive = getDrive();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return res.data;
}

module.exports = { getOrCreateSsFolder, uploadBuffer, downloadFileStream };
