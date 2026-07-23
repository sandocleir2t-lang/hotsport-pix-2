const fs = require('fs');
const path = require('path');
require('dotenv').config();
const EfiPay = require('sdk-node-apis-efi');

const certPath = path.resolve(process.env.EFI_CERT_PATH);
const certExists = fs.existsSync(certPath);

if (!certExists) {
  console.warn(`[EFI] Certificado não encontrado em: ${certPath}`);
}

const options = {
  sandbox: process.env.EFI_ENV !== 'production',
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificate: certPath,
  cert_base64: false,
};

const efipay = new EfiPay(options);

async function criarCobrancaPix(valor) {
  // valor vem como 2, 5, 12
  const valorStr = Number(valor).toFixed(2);

  console.log(`[EFI] Criando cobrança de R$ ${valorStr}`);

  // 1. Cria cobrança imediata
  const body = {
    calendario: { expiracao: 3600 }, // 1 hora pra pagar
    devedor: { nome: "Cliente SLS WIFI" },
    valor: { original: valorStr },
    chave: process.env.EFI_PIX_KEY,
    solicitacaoPagador: `SLS WIFI - ${valorStr} reais`,
  };

  const cobranca = await efipay.pixCreateImmediateCharge([], body);
  
  console.log(`[EFI] Cobrança criada TXID: ${cobranca.txid}`);

  // 2. Gera QR Code
  const qrcode = await efipay.pixGenerateQRCode({ id: cobranca.loc.id });

  return {
    txid: cobranca.txid,
    pixCopiaECola: qrcode.qrcode,
    imagemQrcode: qrcode.imagemQrcode, // pode vir base64 puro, vamos tratar no front
    locId: cobranca.loc.id
  };
}

async function consultarPix(txid) {
  const result = await efipay.pixDetailCharge({ txid });
  return result;
}

module.exports = { criarCobrancaPix, consultarPix };