const express = require('express');
const path = require('path');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let cert = process.env.EFI_CERT_BASE64 
  ? Buffer.from(process.env.EFI_CERT_BASE64, 'base64')
  : path.resolve('./certificados/hotspot-producao.p12');

const options = {
  sandbox: false,
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificate: cert,
  cert_base64: !!process.env.EFI_CERT_BASE64
};

const efipay = new EfiPay(options);
console.log('EFI OK - Chave:', process.env.EFI_PIX_KEY);

app.post('/api/criar-pix', async (req, res) => {
  try {
    const valor = Number(req.body.valor).toFixed(2);
    console.log('Gerando PIX REAL de R$', valor);
    
    const body = {
      calendario: { expiracao: 3600 },
      devedor: { nome: 'Cliente SLS WIFI' },
      valor: { original: valor },
      chave: process.env.EFI_PIX_KEY,
      solicitacaoPagador: `SLS WIFI - ${valor}`
    };
    
    const cob = await efipay.pixCreateImmediateCharge([], body);
    const qrcode = await efipay.pixGenerateQRCode({ id: cob.loc.id });
    
    console.log('PIX REAL GERADO:', cob.txid);
    res.json({ 
      imagemQrcode: qrcode.imagemQrcode, 
      pixCopiaECola: qrcode.qrcode,
      txid: cob.txid 
    });
  } catch (err) {
    console.error('ERRO EFI REAL:', err);
    res.status(500).json({ error: JSON.stringify(err) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`RODANDO PORTA ${PORT}`));