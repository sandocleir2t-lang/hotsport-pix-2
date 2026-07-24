// efi.js - SLS WIFI v6.4 FIX
const fs = require('fs');
const path = require('path');
const os = require('os');
const EfiPay = require('sdk-node-apis-efi');

let certPathCache = null;

function getCertPath() {
  // 1. Se já existe no ENV (Render seta /tmp/efi-cert.p12)
  if (process.env.EFI_CERT_PATH && fs.existsSync(process.env.EFI_CERT_PATH)) {
    return process.env.EFI_CERT_PATH;
  }

  // 2. Se tem BASE64, cria o arquivo em /tmp
  if (process.env.EFI_CERT_BASE64) {
    try {
      const tmpPath = path.join(os.tmpdir(), 'efi-cert.p12');
      // se já criou antes, reutiliza
      if (fs.existsSync(tmpPath) && certPathCache) {
        return tmpPath;
      }
      const buffer = Buffer.from(process.env.EFI_CERT_BASE64, 'base64');
      fs.writeFileSync(tmpPath, buffer);
      certPathCache = tmpPath;
      console.log('[EFI] Certificado criado em:', tmpPath);
      return tmpPath;
    } catch (err) {
      console.error('[EFI] Erro ao criar certificado do BASE64:', err);
      throw err;
    }
  }

  // 3. Fallback local (desenvolvimento)
  const localPath = path.join(__dirname, 'certificado.p12');
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  throw new Error('EFI_CERT_PATH ou EFI_CERT_BASE64 não configurado');
}

function getEfiInstance() {
  const certPath = getCertPath();

  const options = {
    sandbox: process.env.EFI_SANDBOX === 'true', // false = produção
    client_id: process.env.EFI_CLIENT_ID,
    client_secret: process.env.EFI_CLIENT_SECRET,
    certificate: certPath,
    // Algumas versões do SDK precisam de cert_base64 e não path, garantimos os dois
    cert_base64: false
  };

  console.log('[EFI] Conectando - Sandbox:', options.sandbox, 'Cert:', certPath);
  
  return new EfiPay(options);
}

module.exports = { getEfiInstance, getCertPath };
