// server.js - v6.8 - FIX REUSO MESMO MAC + LOGIN MIKROTIK
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

console.log('=== SLS WIFI v6.8 - FIX REUSO + MIKROTIK LOGIN ===');

app.get('/ha/check', (req, res) => res.status(200).send('OK'));
app.get('/check', (req, res) => res.status(200).send('OK'));
app.get('/ha/*', (req, res) => res.status(200).send('OK'));

const VOUCHER_FILE = path.join(__dirname, 'vouchers.json');
function loadVouchers() { try { if (!fs.existsSync(VOUCHER_FILE)) return []; return JSON.parse(fs.readFileSync(VOUCHER_FILE, 'utf8')); } catch { return []; } }
function saveVouchers(list) { try { fs.writeFileSync(VOUCHER_FILE, JSON.stringify(list, null, 2)); } catch(e){ console.log('Erro salvar', e.message); } }

function usarVoucherLogica(code, mac) {
  if (!code) return { ok: false, erro: 'Voucher vazio' };
  const codigo = code.trim().toUpperCase();
  const lista = loadVouchers();
  const encontrado = lista.find(v => v.code.toUpperCase() === codigo);
  if (!encontrado) return { ok: false, erro: 'Voucher inválido', lista };
  
  // FIX 1: Se já foi usado PELO MESMO MAC, deixa passar de novo (evita duplo clique)
  if (encontrado.used) {
    if (encontrado.usedByMac === mac || encontrado.usedByMac === 'desconhecido' || mac === 'desconhecido') {
      console.log(`[VOUCHER] Reuso mesmo MAC liberado: ${codigo}`);
      return { ok: true, login: encontrado.code, senha: encontrado.code, reuse: true };
    }
    return { ok: false, erro: `Voucher já usado - ${codigo}`, lista };
  }

  encontrado.used = true;
  encontrado.usedAt = new Date().toISOString();
  encontrado.usedByMac = mac || 'desconhecido';
  saveVouchers(lista);
  console.log(`[VOUCHER] LIBERADO: ${codigo} MAC:${mac}`);
  return { ok: true, login: encontrado.code, senha: encontrado.code, lista };
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'LIVE', versao: 'v6.8', vouchers: loadVouchers().length }));

// PIX
app.post('/api/criar-pix', async (req, res) => {
  try {
    const { mac, ip, valor } = req.body;
    const valorReais = ((valor || 300) / 100).toFixed(2);
    const efipay = getEfiInstance();
    const charge = await efipay.pixCreateImmediateCharge([], { calendario: { expiracao: 3600 }, valor: { original: valorReais }, chave: process.env.EFI_PIX_KEY, solicitacaoPagador: 'SLS WIFI - 3 horas' });
    const qrcode = await efipay.pixGenerateQRCode({ id: charge.loc.id });
    return res.json({ txid: charge.txid, qrcode: qrcode.qrcode, imagemQrcode: qrcode.imagemQrcode, valor: valorReais });
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});
app.get('/api/pix', async (req, res) => {
  try { const { txid } = req.query; const efipay = getEfiInstance(); const result = await efipay.pixDetailCharge({ txid }); if (result.status === 'CONCLUIDA') return res.json({ status: 'CONCLUIDA', pago: true }); return res.json({ status: result.status, pago: false }); } catch { return res.json({ status: 'ATIVA', pago: false }); }
});

// VOUCHER POST
app.post('/api/usar-voucher', (req, res) => {
  const { voucher, mac, ip } = req.body;
  console.log(`[VOUCHER] POST: ${voucher} MAC:${mac} IP:${ip}`);
  const result = usarVoucherLogica(voucher, mac);
  if (!result.ok) return res.json(result);
  return res.json({ ok: true, mensagem: 'Voucher liberado!', ...result });
});

// VOUCHER GET - /api/libera
app.get('/api/libera', (req, res) => {
  const voucher = req.query.voucher || req.query.code;
  const mac = req.query.mac || req.query['mac-esc'] || 'desconhecido';
  const ip = req.query.ip || '10.5.50.1'; // IP do MikroTik vem do login.html
  const hotspotIp = req.query.hotspotIp || ip || '10.5.50.1';

  console.log(`[VOUCHER] GET /api/libera: ${voucher} MAC:${mac} IP:${ip}`);
  const result = usarVoucherLogica(voucher, mac);

  if (!result.ok) {
    return res.status(200).send(`<html><head><meta charset="utf-8"><style>body{background:#1e0a4a;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}</style></head><body><div><h2>${result.erro}</h2><p>Tente outro voucher</p><a href="/" style="color:#a78bfa">Voltar</a></div></body></html>`);
  }

  // FIX MIKROTIK: faz login automatico no IP correto do hotspot
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Liberado</title><style>body{background:#1e0a4a;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}</style></head><body>
  <div><h1>✅ Voucher ${result.login} LIBERADO!</h1><p id="msg">Conectando no MikroTik ${hotspotIp}...</p></div>
  <script>
    console.log('Tentando login MikroTik IP:', '${hotspotIp}');
    setTimeout(()=>{
      try {
        const form = document.createElement('form');
        form.method='POST';
        form.action='http://${hotspotIp}/login';
        form.style.display='none';
        const u=document.createElement('input'); u.name='username'; u.type='hidden'; u.value='${result.login}'; form.appendChild(u);
        const p=document.createElement('input'); p.name='password'; p.type='hidden'; p.value='${result.senha}'; form.appendChild(p);
        const dst=document.createElement('input'); dst.name='dst'; dst.type='hidden'; dst.value='http://www.google.com'; form.appendChild(dst);
        const popup=document.createElement('input'); popup.name='popup'; popup.type='hidden'; popup.value='false'; form.appendChild(popup);
        document.body.appendChild(form);
        document.getElementById('msg').innerText='Fazendo login...';
        form.submit();
      } catch(e){
        document.getElementById('msg').innerText='Erro login: '+e.message + ' - Tente navegar';
        setTimeout(()=>{ window.location.href='http://www.google.com'; }, 2000);
      }
    }, 1000);
  </script></body></html>`;
  return res.send(html);
});

app.post('/api/criar-voucher', (req, res) => {
  const { qtd, code } = req.body;
  const lista = loadVouchers();
  if (code) {
    lista.push({ code: code.toUpperCase(), used: false, createdAt: new Date().toISOString() });
  } else {
    const total = parseInt(qtd) || 10;
    for(let i=0;i<total;i++){
      const novo='SLS'+Math.random().toString(36).substring(2,6).toUpperCase()+Math.floor(Math.random()*10);
      lista.push({ code: novo, used: false, createdAt: new Date().toISOString() });
    }
  }
  saveVouchers(lista);
  console.log(`[VOUCHER] Criados ${qtd || 1} - total ${lista.length}`);
  return res.json({ ok: true, total: lista.length, lista });
});

app.get('/api/listar-vouchers', (req, res) => res.json(loadVouchers()));

app.delete('/api/deletar-voucher/:code', (req, res) => {
  let lista = loadVouchers();
  lista = lista.filter(v => v.code.toUpperCase() !== req.params.code.toUpperCase());
  saveVouchers(lista);
  return res.json({ ok: true, lista });
});

// Limpar todos (pra debug)
app.delete('/api/limpar-vouchers', (req, res) => {
  saveVouchers([]);
  return res.json({ ok: true, lista: [] });
});

app.listen(PORT, () => console.log(`🚀 v6.8 porta ${PORT} - /api/libera FIX REUSO`));
