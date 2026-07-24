// server.js - SLS WIFI v6.5 FINAL - FIX DEFINITIVO
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getEfiInstance } = require('./efi');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CORREÇÃO DEFINITIVA: serve RAIZ e PUBLIC - nunca mais Not Found
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

console.log('=== SLS WIFI v6.5 FINAL ===');
console.log('Dir:', __dirname);
console.log('Tem public/index.html?', fs.existsSync(path.join(__dirname, 'public', 'index.html')));
console.log('Tem index.html na raiz?', fs.existsSync(path.join(__dirname, 'index.html')));

app.get('/', (req, res) => {
  const pathPublic = path.join(__dirname, 'public', 'index.html');
  const pathRoot = path.join(__dirname, 'index.html');
  if (fs.existsSync(pathPublic)) return res.sendFile(pathPublic);
  if (fs.existsSync(pathRoot)) return res.sendFile(pathRoot);
  return res.status(404).send('SLS WIFI - index.html nao encontrado');
});

app.get('/health', (req, res) => res.json({ status: 'LIVE', versao: 'v6.5' }));

app.post('/api/criar-pix', async (req, res) => {
  try {
    const { mac, ip, valor } = req.body;
    const valorReais = ((valor || 300) / 100).toFixed(2);
    console.log(`[PIX] Gerando R$${valorReais} MAC:${mac}`);
    const efipay = getEfiInstance();
    const charge = await efipay.pixCreateImmediateCharge([], {
      calendario: { expiracao: 3600 },
      devedor: { nome: `Cliente SLS ${(mac||'').substring(0,10)}` },
      valor: { original: valorReais },
      chave: process.env.EFI_PIX_KEY,
      solicitacaoPagador: 'SLS WIFI - 3 horas'
    });
    const qrcode = await efipay.pixGenerateQRCode({ id: charge.loc.id });
    return res.json({
      txid: charge.txid,
      qrcode: qrcode.qrcode,
      pixCopiaECola: qrcode.qrcode,
      imagemQrcode: qrcode.imagemQrcode,
      valor: valorReais
    });
  } catch (err) {
    console.error('[ERRO]', err);
    return res.status(500).json({ erro: err.message, efi: err.response?.data || null });
  }
});

app.get('/api/pix', async (req, res) => {
  try {
    const { txid } = req.query;
    const efipay = getEfiInstance();
    const result = await efipay.pixDetailCharge({ txid });
    if (result.status === 'CONCLUIDA') return res.json({ status: 'CONCLUIDA', pago: true });
    return res.json({ status: result.status, pago: false });
  } catch (e) {
    return res.json({ status: 'ATIVA', pago: false });
  }
});

app.listen(PORT, () => console.log(`RODANDO v6.5 porta ${PORT}`));
