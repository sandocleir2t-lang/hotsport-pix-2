const express = require('express');
const path = require('path');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(express.json());

// CORRIGIDO: pasta public certa
app.use(express.static(path.join(__dirname, 'public')));

// MEMÓRIA DE LIBERADOS - ESSENCIAL PRO MIKROTIK
let liberacoes = [];
console.log('SLS WIFI v4 - COM LIBERACOES');

// Certificado
let cert = process.env.EFI_CERT_BASE64 
  ? Buffer.from(process.env.EFI_CERT_BASE64, 'base64')
  : path.resolve('./certs/hotspot-producao.p12'); // troquei pra certs

const options = {
  sandbox: false,
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificate: cert,
  cert_base64: !!process.env.EFI_CERT_BASE64
};

const efipay = new EfiPay(options);
console.log('EFI OK - Chave:', process.env.EFI_PIX_KEY);

// ROTA QUE SEU MIKROTIK LÊ A CADA 30s
app.get('/api/liberacoes', (req, res) => {
  // limpa liberados com mais de 24h
  liberacoes = liberacoes.filter(l => Date.now() - l.time < 86400000);
  console.log('MikroTik pediu lista:', liberacoes);
  res.json(liberacoes);
});

// ROTA QUE O BOTÃO JA PAGUEI CHAMA
app.get('/api/liberar', (req, res) => {
  const ip = req.query.ip;
  const mac = req.query.mac || 'auto';
  if (!ip) return res.status(400).send('precisa ?ip=');
  
  if (!liberacoes.find(l => l.ip === ip)) {
    liberacoes.push({ ip, mac, time: Date.now() });
    console.log('LIBERADO:', ip);
  }
  res.send('OK liberado ' + ip);
});

app.post('/api/liberar', (req,res)=>{
  const {ip, mac} = req.body;
  if(ip && !liberacoes.find(l=>l.ip===ip)){
    liberacoes.push({ip, mac: mac||'auto', time: Date.now()});
  }
  res.json({ok:true});
});

// SEU PIX REAL (mantive seu código)
app.post('/api/criar-pix', async (req, res) => {
  try {
    const valor = Number(req.body.valor || req.body.valorPix || 2).toFixed(2);
    console.log('Gerando PIX REAL de R$', valor);
    const body = {
      calendario: { expiracao: 3600 },
      devedor: { nome: 'Cliente SLS WIFI' },
      valor: { original: valor },
      chave: process.env.EFI_PIX_KEY,
      solicitacaoPagador: `SLS WIFI - R$ ${valor}`
    };
    const cob = await efipay.pixCreateImmediateCharge([], body);
    const qrcode = await efipay.pixGenerateQRCode({ id: cob.loc.id });
    console.log('PIX REAL GERADO:', cob.txid);
    res.json({ 
      imagemQrcode: qrcode.imagemQrcode, 
      pixCopiaECola: qrcode.qrcode,
      txid: cob.txid,
      qrcode: qrcode.qrcode,
      imagem: qrcode.imagemQrcode
    });
  } catch (err) {
    console.error('ERRO EFI REAL:', err);
    res.status(500).json({ error: JSON.stringify(err) });
  }
});

// compatibilidade
app.post('/api/gerar-pix', (req,res)=> {
  req.url = '/api/criar-pix';
  app.handle(req,res);
});

app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`SLS WIFI v4 RODANDO PORTA ${PORT}`));