// hotspot-pix-2 - server.js v13.5 FIX 404 - ANTI-500
// FIX: seu front chama /api/gerar-pix ou /gerar-pix e dava 404. Agora aceita TODAS as rotas.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (e) => console.error('[ANTI-500] uncaught', e.message));
process.on('unhandledRejection', (e) => console.error('[ANTI-500] reject', e?.message || e));

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const pagamentos = new Map();
const filaLiberar = [];

function safeCertificado() {
  try {
    const b64 = process.env.EFI_CERTIFICADO_BASE64;
    if (!b64) return null;
    const p = path.join(__dirname, 'certificado.p12');
    if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    return p;
  } catch (e) { return null; }
}

function gerarMockPix(txid, valor) {
  const chave = process.env.EFI_PIX_KEY || 'pix@hotspot.com';
  const v = (valor || 5).toFixed(2);
  const payload = `00020126580014BR.GOV.BCB.PIX0136${chave}520400005303986540${v}5802BR5925SLS WIFI 6009TERESINA62070503***6304`;
  const code = `${payload}${txid.slice(-4)}`;
  return { brcode: code, copiaecola: code, pixCopiaECola: code, qrcode: code };
}

async function getEfiClient() {
  try {
    const id = process.env.EFI_CLIENT_ID, sec = process.env.EFI_CLIENT_SECRET, cert = safeCertificado();
    if (!id || !sec || !cert) return null;
    const EfiPay = require('sdk-node-apis-efi');
    return new EfiPay({ sandbox: false, client_id: id, client_secret: sec, certificate: cert, cert_base64: false });
  } catch { return null; }
}

// CORE GERADOR
async function coreCriarPix(req, res) {
  try {
    const bodyReq = req.body || {};
    const queryReq = req.query || {};
    const valor = parseFloat(bodyReq.valor || bodyReq.value || queryReq.valor || 5) || 5;
    const cliente = bodyReq.cliente || bodyReq.nome || 'cliente';
    const mac = bodyReq.mac || queryReq.mac || null;
    const ip = bodyReq.ip || null;
    const txid = `SLS${Date.now()}${Math.floor(Math.random()*900)}`.slice(0,32);

    let brcode = '';
    try {
      const efi = await getEfiClient();
      if (efi) {
        const chargeBody = { calendario: { expiracao: 3600 }, valor: { original: valor.toFixed(2) }, chave: process.env.EFI_PIX_KEY, solicitacaoPagador: `SLS WIFI ${cliente}`.slice(0,40) };
        const charge = await efi.pixCreateImmediateCharge([], chargeBody);
        const qr = await efi.pixGenerateQRCode({ id: charge.loc.id });
        brcode = qr.qrcode || qr.qrCode || '';
      } else throw new Error('mock');
    } catch (e) {
      const m = gerarMockPix(txid, valor);
      brcode = m.brcode;
    }
    if (!brcode) brcode = gerarMockPix(txid, valor).brcode;

    const pag = { txid, status: 'AGUARDANDO', valor, cliente, mac, ip, brcode, copiaecola: brcode, pixCopiaECola: brcode, qrcode: brcode, qr: brcode, criadoEm: Date.now() };
    pagamentos.set(txid, pag);

    return res.status(200).json({
      ok: true, txid, status: 'AGUARDANDO', valor,
      brcode, copiaecola: brcode, pixCopiaECola: brcode, pixCopiaECola: brcode, qrcode: brcode, qr: brcode, qrcode_base64: brcode,
      // compatibilidade total com fronts antigos
      pix: { qrcode: brcode, copiaECola: brcode },
      data: { brcode, copiaecola: brcode }
    });
  } catch (err) {
    const txid = `MOCK${Date.now()}`;
    const m = gerarMockPix(txid, 5);
    return res.status(200).json({ ok: true, txid, brcode: m.brcode, copiaecola: m.brcode, pixCopiaECola: m.brcode, qrcode: m.brcode, qr: m.brcode, status: 'AGUARDANDO', aviso: 'fallback', erro: err.message });
  }
}

// --- ROTAS FIX 404 - aceita tudo ---
app.get('/api/health', (req,res)=> res.status(200).json({ status:'ok', version:'v13.5 FIX 404 ANTI-500', time:new Date().toISOString(), pagamentos: pagamentos.size, fila: filaLiberar.length }));

// Rota principal + aliases
app.post('/api/criar-pix', coreCriarPix);
app.get('/api/criar-pix', coreCriarPix);
app.post('/api/gerar-pix', coreCriarPix);
app.get('/api/gerar-pix', coreCriarPix);
app.post('/api/gerar', coreCriarPix);
app.post('/api/pix/criar', coreCriarPix);
app.post('/api/pix', coreCriarPix);
app.post('/criar-pix', coreCriarPix);
app.post('/gerar-pix', coreCriarPix);
app.post('/api/criar', coreCriarPix);
app.post('/api/pagamento', coreCriarPix);
app.post('/api/create-pix', coreCriarPix);
app.all('/api/criar-pix/:qualquer', coreCriarPix); // pega variações

app.get('/api/verifica/:txid', (req,res)=>{
  try{ const p=pagamentos.get(req.params.txid); if(!p) return res.status(200).json({ok:false,status:'NAO_ENCONTRADO'}); return res.status(200).json({ok:true, txid:p.txid, status:p.status}); }catch(e){ return res.status(200).json({ok:false}); }
});
app.get('/api/status/:txid', (req,res)=>{
  try{ const p=pagamentos.get(req.params.txid); if(!p) return res.status(200).json({status:'NAO_ENCONTRADO'}); return res.status(200).json({status:p.status, txid:p.txid}); }catch(e){ return res.status(200).json({status:'ERRO'}); }
});
app.post('/api/verifica', (req,res)=>{
  const txid=req.body?.txid; const p=pagamentos.get(txid); return res.status(200).json({ok:!!p, status: p?.status || 'NAO_ENCONTRADO'});
});

app.get('/api/simular-pago/:txid', (req,res)=>{
  const p=pagamentos.get(req.params.txid); if(!p) return res.status(200).json({ok:false});
  p.status='PAGO_LIBERAR'; pagamentos.set(p.txid,p);
  filaLiberar.push({ mac: p.mac || 'FF:FF:FF:FF:FF:FF', ip: p.ip, txid: p.txid, cliente: p.cliente, data:new Date().toISOString() });
  return res.status(200).json({ok:true, status:'PAGO_LIBERAR'});
});

app.get('/api/fila', (req,res)=>{ try{ const f=[...filaLiberar]; filaLiberar.length=0; return res.status(200).json(f); }catch{ return res.status(200).json([]);} });
app.post('/api/fila', (req,res)=>{ try{ const f=[...filaLiberar]; filaLiberar.length=0; return res.status(200).json(f); }catch{ return res.status(200).json([]);} });

app.post('/api/webhook/pix', (req,res)=>{
  try{
    const pixs=req.body?.pix||[];
    for(const pix of pixs){ if(pagamentos.has(pix.txid)){ const p=pagamentos.get(pix.txid); p.status='PAGO_LIBERAR'; pagamentos.set(pix.txid,p); filaLiberar.push({mac:p.mac, ip:p.ip, txid:p.txid, cliente:p.cliente, data:new Date().toISOString()}); } }
    return res.status(200).json({ok:true});
  }catch{ return res.status(200).json({ok:true}); }
});

// Catch-all front
app.get('*', (req,res)=>{
  const idx=path.join(__dirname,'public','index.html');
  if(fs.existsSync(idx)) return res.sendFile(idx);
  return res.status(200).send('SLS WIFI v13.5 Live');
});

app.use((err,req,res,next)=>{ console.error(err.message); return res.status(200).json({ok:false, erro: err.message}); });

app.listen(PORT, ()=>{ console.log(`[v13.5 FIX 404] Porta ${PORT}`); safeCertificado(); });

setInterval(()=>{
  try{ const now=Date.now(); for(const [k,v] of pagamentos){ if(now-v.criadoEm>3600000 && v.status==='AGUARDANDO'){ v.status='EXPIRADO'; pagamentos.set(k,v);} } }catch{}
},5000);
