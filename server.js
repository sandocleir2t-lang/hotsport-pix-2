// server.js - SLS WIFI v6.6 FINAL - PIX + VOUCHER + HA/CHECK FIX
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getEfiInstance } = require('./efi');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

console.log('=== SLS WIFI v6.6 FINAL + VOUCHER + HA FIX ===');
console.log('RODANDO v6.6 porta', PORT);

// --- FIX CRÍTICO: ROTAS QUE O MIKROTIK EXIGE NO WALLED GARDEN ---
app.get('/ha/check', (req, res) => {
  console.log('[HA] /ha/check OK');
  return res.status(200).send('OK');
});
app.get('/check', (req, res) => res.status(200).send('OK'));
app.get('/ha/*', (req, res) => res.status(200).send('OK'));
app.get('/hotspot-detect.html', (req, res) => res.status(200).send('<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>'));
app.get('/success.txt', (req, res) => res.status(200).send('Success'));

// --- BANCO VOUCHER ---
const VOUCHER_FILE = path.join(__dirname, 'vouchers.json');
function loadVouchers() {
  try {
    if (!fs.existsSync(VOUCHER_FILE)) return [];
    return JSON.parse(fs.readFileSync(VOUCHER_FILE, 'utf8'));
  } catch { return []; }
}
function saveVouchers(list) {
  fs.writeFileSync(VOUCHER_FILE, JSON.stringify(list, null, 2));
}

app.get('/', (req, res) => {
  const p1 = path.join(__dirname, 'public', 'index.html');
  const p2 = path.join(__dirname, 'index.html');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  return res.send('SLS WIFI v6.6 LIVE');
});

app.get('/health', (req, res) => res.json({ status: 'LIVE', versao: 'v6.6-ha-fix', vouchers: loadVouchers().length }));

// --- PIX ---
app.post('/api/criar-pix', async (req, res) => {
  try {
    const { mac, ip, valor } = req.body;
    const valorReais = ((valor || 300) / 100).toFixed(2);
    console.log(`[PIX] Gerando R$${valorReais} MAC:${mac}`);
    const efipay = getEfiInstance();
    const charge = await efipay.pixCreateImmediateCharge([], {
      calendario: { expiracao: 3600 },
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
    console.error('[ERRO PIX]', err);
    return res.status(500).json({ erro: err.message, efi: err.response?.data || null });
  }
});

app.post('/api/gerar-pix', (req, res) => {
  req.url = '/api/criar-pix';
  return app.handle(req, res);
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

app.post('/api/webhook-pix', (req, res) => {
  console.log('[WEBHOOK]', JSON.stringify(req.body));
  res.status(200).end();
});

// --- VOUCHER ---
app.post('/api/usar-voucher', (req, res) => {
  const { voucher, mac } = req.body;
  console.log(`[VOUCHER] Tentativa: ${voucher} MAC:${mac}`);
  if (!voucher) return res.json({ ok: false, erro: 'Voucher vazio' });
  const codigo = voucher.trim().toUpperCase();
  const lista = loadVouchers();
  const encontrado = lista.find(v => v.code.toUpperCase() === codigo);
  if (!encontrado) {
    console.log(`[VOUCHER] Invalido: ${codigo}`);
    return res.json({ ok: false, erro: 'Voucher inválido' });
  }
  if (encontrado.used) {
    console.log(`[VOUCHER] Ja usado: ${codigo}`);
    return res.json({ ok: false, erro: 'Voucher já usado' });
  }
  encontrado.used = true;
  encontrado.usedAt = new Date().toISOString();
  encontrado.usedByMac = mac || 'desconhecido';
  saveVouchers(lista);
  console.log(`[VOUCHER] LIBERADO: ${codigo}`);
  return res.json({ 
    ok: true, 
    mensagem: 'Voucher liberado!',
    login: encontrado.code,
    senha: encontrado.code
  });
});

app.post('/api/criar-voucher', (req, res) => {
  const { code, qtd } = req.body;
  const lista = loadVouchers();
  if (qtd) {
    for(let i=0;i<qtd;i++){
      const novo = 'SLS' + Math.random().toString(36).substring(2,6).toUpperCase();
      lista.push({ code: novo, used: false, createdAt: new Date().toISOString() });
    }
  } else if (code) {
    lista.push({ code: code.toUpperCase(), used: false, createdAt: new Date().toISOString() });
  } else {
    return res.json({ ok: false, erro: 'Informe code ou qtd' });
  }
  saveVouchers(lista);
  return res.json({ ok: true, total: lista.length, lista });
});

app.get('/api/listar-vouchers', (req, res) => res.json(loadVouchers()));

app.delete('/api/deletar-voucher/:code', (req, res) => {
  let lista = loadVouchers();
  lista = lista.filter(v => v.code.toUpperCase() !== req.params.code.toUpperCase());
  saveVouchers(lista);
  return res.json({ ok: true, lista });
});

// FALLBACK - não pode dar Cannot GET
app.use((req, res) => {
  console.log(`[404] Tentou acessar: ${req.method} ${req.originalUrl}`);
  // Se for /ha/check que caiu aqui, retorna OK mesmo assim
  if (req.originalUrl.includes('ha/check') || req.originalUrl.includes('check')) {
    return res.status(200).send('OK');
  }
  return res.status(404).send(`Cannot GET ${req.originalUrl} - mas /ha/check esta OK`);
});

app.listen(PORT, () => console.log(`🚀 SLS WIFI v6.6 rodando porta ${PORT} - /ha/check OK`));
