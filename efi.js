const fs = require('fs');
const path = require('path');
const EfiPay = require('sdk-node-apis-efi');

function getEfiPay(){
  const certPath = process.env.EFI_CERT_PATH || path.join(__dirname, 'certificados', 'hotspot-producao.p12');
  if(!fs.existsSync(certPath)) throw new Error('Certificado nao encontrado: '+certPath);
  return new EfiPay({
    sandbox: false,
    client_id: (process.env.EFI_CLIENT_ID||'').trim(),
    client_secret: (process.env.EFI_CLIENT_SECRET||'').trim(),
    certificate: certPath
  });
}

async function criarCobrancaPix(valor){
  const efipay = getEfiPay();
  const valorStr = Number(valor).toFixed(2);
  console.log(`[EFI] Criando R$ ${valorStr}`);
  const body = {
    calendario:{expiracao:3600},
    devedor:{nome:"Cliente SLS WIFI"},
    valor:{original:valorStr},
    chave: (process.env.EFI_PIX_KEY||'').trim(),
    solicitacaoPagador:`SLS WIFI - R$ ${valorStr}`
  };
  const cobranca = await efipay.pixCreateImmediateCharge([], body);
  const qrcode = await efipay.pixGenerateQRCode({id: cobranca.loc.id});
  return {
    txid: cobranca.txid,
    pixCopiaECola: qrcode.qrcode,
    qrcode: qrcode.qrcode,
    imagemQrcode: qrcode.imagemQrcode,
    locId: cobranca.loc.id
  };
}

module.exports = { criarCobrancaPix };
