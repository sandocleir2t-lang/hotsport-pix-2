// efi.js - v6.5 FINAL - Suporta BASE64 com quebra de linha
const fs = require('fs');
const path = require('path');
const os = require('os');

let efiInstance = null;

function getEfiInstance() {
  if (efiInstance) return efiInstance;

  try {
    const EfiPay = require('sdk-node-apis-efi');
    // Alguns projetos usam gn-api, tenta fallback
    // const EfiPay = require('gn-api-sdk-node') || require('sdk-node-apis-efi');

    // Pega certificado de qualquer variável que existir
    let certBase64 = process.env.EFI_CERT_BASE64 || process.env.EFI_CERTIFICATE || process.env.EFI_CERTIFICADO || '';
    
    // Limpa sujeira que vem do Render
    certBase64 = certBase64
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '') // remove espaço, quebra de linha, \n
      .trim();

    if (!certBase64) {
      throw new Error('EFI_CERT_BASE64 vazio! Configure no Render.');
    }

    // Tenta decodificar pra ver se é base64 válido
    let certBuffer;
    try {
      certBuffer = Buffer.from(certBase64, 'base64');
    } catch (e) {
      throw new Error('EFI_CERT_BASE64 não é um base64 válido. Gere de novo.');
    }

    if (certBuffer.length < 1000) {
      throw new Error(`Certificado muito pequeno (${certBuffer.length} bytes). Base64 incorreto.`);
    }

    // Salva em /tmp que é gravável no Render
    const certPath = path.join(os.tmpdir(), 'certificado-efi.p12');
    fs.writeFileSync(certPath, certBuffer);
    
    console.log(`[EFI] Certificado salvo em ${certPath} - ${certBuffer.length} bytes`);

    const isSandbox = (process.env.EFI_SANDBOX || 'false').toString().toLowerCase() === 'true';

    const options = {
      sandbox: isSandbox,
      client_id: process.env.EFI_CLIENT_ID,
      client_secret: process.env.EFI_CLIENT_SECRET,
      certificate: certPath,
      cert_base64: false
    };

    if (!options.client_id || !options.client_secret) {
      throw new Error('EFI_CLIENT_ID ou EFI_CLIENT_SECRET vazios');
    }
    if (!process.env.EFI_PIX_KEY) {
      throw new Error('EFI_PIX_KEY vazio');
    }

    console.log(`[EFI] Iniciando - Sandbox: ${isSandbox} - Client: ${options.client_id.substring(0,10)}...`);

    efiInstance = new EfiPay(options);
    return efiInstance;

  } catch (err) {
    console.error('[EFI FATAL]', err.message);
    // Lança erro real pra aparecer no /api/criar-pix em vez de efi:null
    throw err;
  }
}

module.exports = { getEfiInstance };
