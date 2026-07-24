// server.js - SLS WIFI v6.5 FINAL - COM VOUCHER FIX
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getEfiInstance } = require('./efi');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// serve RAIZ e PUBLIC
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

console.log('=== SLS WIFI v6.5 FINAL + VOUCHER ===');

// --- BANCO DE VOUCHER SIMPLES EM ARQUIVO ---
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
  const pathPublic = path.join(__dirname, 'public', 'index.html');
  const pathRoot = path.join(__dirname, 'index.html');
  if (fs.existsSync(pathPublic)) return res.sendFile(pathPublic);
  if (fs.existsSync(pathRoot)) return res.sendFile(pathRoot);
  return res.status(404).send('SLS WIFI - index.html nao encontrado');
});

app.get('/health', (req, res) => res.json({ status: 'LIVE', versao: 'v6.5-voucher-fix', vouchers: loadVouchers().length }));

// --- ROTAS PIX (SUAS ORIGINAIS) ---
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

// --- ROTAS VOUCHER - NOVO - SEM MIKROTIK_HOST ---
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

  // Marca como usado
  encontrado.used = true;
  encontrado.usedAt = new Date().toISOString();
  encontrado.usedByMac = mac || 'desconhecido';
  saveVouchers(lista);

  console.log(`[VOUCHER] LIBERADO: ${codigo}`);

  // Retorna login/senha IGUAL ao voucher - seu MikroTik tem que ter usuario = voucher com senha = voucher
  // OU o frontend vai fazer o auto-login no hotspot
  return res.json({ 
    ok: true, 
    mensagem: 'Voucher liberado! Conectando...',
    login: encontrado.code,
    senha: encontrado.code,
    hotspot_user: encontrado.code,
    hotspot_pass: encontrado.code
  });
});

app.post('/api/criar-voucher', (req, res) => {
  const { code, qtd } = req.body;
  const lista = loadVouchers();
  if (qtd) {
    // Criar varios aleatorios
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

app.get('/api/listar-vouchers', (req, res) => {
  return res.json(loadVouchers());
});

app.delete('/api/deletar-voucher/:code', (req, res) => {
  let lista = loadVouchers();
  lista = lista.filter(v => v.code.toUpperCase() !== req.params.code.toUpperCase());
  saveVouchers(lista);
  return res.json({ ok: true, lista });
});

app.listen(PORT, () => console.log(`RODANDO v6.5 VOUCHER FIX porta ${PORT}`));
