// server.js - SLS WIFI v6.7 FINAL - COM ALIAS /api/libera
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

console.log('=== SLS WIFI v6.7 FINAL FIX + /api/libera ===');

// FIX MIKROTIK
app.get('/ha/check', (req, res) => res.status(200).send('OK'));
app.get('/check', (req, res) => res.status(200).send('OK'));
app.get('/ha/*', (req, res) => res.status(200).send('OK'));
app.get('/hotspot-detect.html', (req, res) => res.status(200).send('<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>'));
app.get('/success.txt', (req, res) => res.status(200).send('Success'));

const VOUCHER_FILE = path.join(__dirname, 'vouchers.json');
function loadVouchers() { try { if (!fs.existsSync(VOUCHER_FILE)) return []; return JSON.parse(fs.readFileSync(VOUCHER_FILE, 'utf8')); } catch { return []; } }
function saveVouchers(list) { fs.writeFileSync(VOUCHER_FILE, JSON.stringify(list, null, 2)); }

app.get('/', (req, res) => {
  const p1 = path.join(__dirname, 'public', 'index.html');
  const p2 = path.join(__dirname, 'index.html');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  return res.send('SLS WIFI v6.7 LIVE');
});
app.get('/health', (req, res) => res.json({ status: 'LIVE', versao: 'v6.7-libera-fix', vouchers: loadVouchers().length }));

// PIX
app.post('/api/criar-pix', async (req, res) => {
  try {
    const { mac, ip, valor } = req.body;
    const valorReais = ((valor || 300) / 100).toFixed(2);
    const efipay = getEfiInstance();
    const charge = await efipay.pixCreateImmediateCharge([], { calendario: { expiracao: 3600 }, valor: { original: valorReais }, chave: process.env.EFI_PIX_KEY, solicitacaoPagador: 'SLS WIFI - 3 horas' });
    const qrcode = await efipay.pixGenerateQRCode({ id: charge.loc.id });
    return res.json({ txid: charge.txid, qrcode: qrcode.qrcode, pixCopiaECola: qrcode.qrcode, imagemQrcode: qrcode.imagemQrcode, valor: valorReais });
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});
app.get('/api/pix', async (req, res) => {
  try { const { txid } = req.query; const efipay = getEfiInstance(); const result = await efipay.pixDetailCharge({ txid }); if (result.status === 'CONCLUIDA') return res.json({ status: 'CONCLUIDA', pago: true }); return res.json({ status: result.status, pago: false }); } catch (e) { return res.json({ status: 'ATIVA', pago: false }); }
});

// --- LOGICA CENTRAL DE VOUCHER ---
function usarVoucherLogica(voucherCode, mac) {
  if (!voucherCode) return { ok: false, erro: 'Voucher vazio' };
  const codigo = voucherCode.trim().toUpperCase();
  const lista = loadVouchers();
  const encontrado = lista.find(v => v.code.toUpperCase() === codigo);
  if (!encontrado) return { ok: false, erro: 'Voucher inválido' };
  if (encontrado.used) return { ok: false, erro: 'Voucher já usado' };
  encontrado.used = true;
  encontrado.usedAt = new Date().toISOString();
  encontrado.usedByMac = mac || 'desconhecido';
  saveVouchers(lista);
  console.log(`[VOUCHER] LIBERADO: ${codigo} MAC:${mac}`);
  return { ok: true, login: encontrado.code, senha: encontrado.code };
}

// Rota oficial POST
app.post('/api/usar-voucher', (req, res) => {
  const { voucher, mac } = req.body;
  console.log(`[VOUCHER] POST /api/usar-voucher: ${voucher}`);
  const result = usarVoucherLogica(voucher, mac);
  if (!result.ok) return res.json(result);
  return res.json({ ok: true, mensagem: 'Voucher liberado!', ...result });
});

// ALIAS QUE SEU FRONT ANTIGO CHAMA - GET /api/libera?voucher=XXX
app.get('/api/libera', (req, res) => {
  const voucher = req.query.voucher || req.query.code || req.query.v;
  const mac = req.query.mac || req.query['mac-esc'] || 'desconhecido';
  console.log(`[VOUCHER] GET /api/libera: ${voucher} MAC:${mac}`);
  const result = usarVoucherLogica(voucher, mac);
  if (!result.ok) {
    // Se for chamado via navegador, retorna pagina simples com erro
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.status(200).send(`<h1 style="font-family:Arial;text-align:center;margin-top:50px">${result.erro} - ${voucher}</h1><p style="text-align:center"><a href="/">Voltar</a></p>`);
    }
    return res.json(result);
  }
  // Sucesso: tenta logar no MikroTik automaticamente
  // O MikroTik espera POST em http://192.168.88.1/login
  // Mas como estamos externo, vamos retornar pagina que faz auto-login
  const mikrotikIp = '192.168.88.1';
  const htmlLiberado = `
  <!DOCTYPE html><html><head><meta charset="utf-8"><title>Liberado</title></head><body style="background:#1e0a4a;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
  <div><h1>✅ Voucher ${result.login} LIBERADO!</h1><p>Conectando...</p>
  <script>
    // Tenta logar direto no MikroTik
    setTimeout(() => {
      const form = document.createElement('form');
      form.method='POST';
      form.action='http://${mikrotikIp}/login';
      const u=document.createElement('input'); u.name='username'; u.value='${result.login}'; form.appendChild(u);
      const p=document.createElement('input'); p.name='password'; p.value='${result.senha}'; form.appendChild(p);
      document.body.appendChild(form);
      form.submit();
    }, 1000);
    setTimeout(()=>{ window.location.href='http://www.google.com'; }, 3000);
  </script></div></body></html>`;
  return res.send(htmlLiberado);
});

app.post('/api/criar-voucher', (req, res) => { const { qtd } = req.body; const lista=loadVouchers(); for(let i=0;i<(qtd||10);i++){ const novo='SLS'+Math.random().toString(36).substring(2,6).toUpperCase(); lista.push({code:novo,used:false,createdAt:new Date().toISOString()}); } saveVouchers(lista); return res.json({ok:true,lista}); });
app.get('/api/listar-vouchers', (req, res) => res.json(loadVouchers()));

app.listen(PORT, () => console.log(`🚀 v6.7 porta ${PORT} - /api/libera + /ha/check OK`));
