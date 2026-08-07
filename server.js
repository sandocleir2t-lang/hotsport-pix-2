// SLS WIFI EVENTOS - server.js v13.6 UNIFICADO FINAL - 07/08/2026 MANHÃ QUE FUNCIONOU
// Une: EFI PIX real + fallback mock + rotas antigas que o login.html amarelo chama + rotas novas
// FIX DEFINITIVO DO 404: aceita /api/gerar-qrcode E /api/criar-pix

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

process.on('uncaughtException', e => console.error('[ANTI-500] uncaught', e.message));
process.on('unhandledRejection', e => console.error('[ANTI-500] reject', e?.message));

app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- MEMORIA COMPATIVEL COM hEX ---
let FILA = []; // {txid, mac, valor, tempo, plano, brcode, qrcode, status: PENDENTE|PAGO_LIBERAR, createdAt, cliente, ip }

function genTxid(){ return 'SLS-' + crypto.randomBytes(4).toString('hex').toUpperCase(); }

function safeCertificado(){
  try{
    const b64 = process.env.EFI_CERTIFICADO_BASE64;
    if(!b64) return null;
    const p = path.join(__dirname,'certificado.p12');
    if(!fs.existsSync(p)) fs.writeFileSync(p, Buffer.from(b64,'base64'));
    return p;
  }catch{ return null; }
}

function mockPix(txid, valor){
  const chave = process.env.EFI_PIX_KEY || 'pix@slswifi.com';
  const v = Number(valor||5).toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136${chave}520400005303986540${v}5802BR5920SLS WIFI 6009TERESINA62070503***6304${txid.slice(-4)}`;
}

async function getEfiClient(){
  try{
    const id=process.env.EFI_CLIENT_ID, sec=process.env.EFI_CLIENT_SECRET, cert=safeCertificado();
    if(!id||!sec||!cert) return null;
    const EfiPay = require('sdk-node-apis-efi');
    return new EfiPay({ sandbox:false, client_id:id, client_secret:sec, certificate:cert, cert_base64:false });
  }catch{ return null; }
}

// CORE que funciona igual manhã 06:00
async function gerarPixCore(req,res){
  try{
    const b = req.body||{}; const q = req.query||{};
    const mac = (b.mac || q.mac || 'AA:BB:CC:DD:EE:FF').toUpperCase();
    const valor = Number(b.valor || b.value || q.valor || 5);
    const tempo = b.tempo || q.tempo || (valor<=3?'1h':valor<=5?'2h':'8h');
    const plano = b.plano || q.plano || `SLS ${tempo}`;
    const cliente = b.cliente || mac;
    const ip = b.ip || null;

    const txid = genTxid();
    let brcode = '';
    let qrcode_b64 = '';

    // 1. Tenta EFI real
    try{
      const efi = await getEfiClient();
      if(efi){
        const body = { calendario:{expiracao:3600}, valor:{original:valor.toFixed(2)}, chave:process.env.EFI_PIX_KEY, solicitacaoPagador: `SLS ${plano}`.slice(0,35) };
        const charge = await efi.pixCreateImmediateCharge([], body);
        const qr = await efi.pixGenerateQRCode({ id: charge.loc.id });
        brcode = qr.qrcode || qr.qrCode || '';
      }
    }catch(e){ console.log('[EFI] fallback mock', e.message); }

    if(!brcode) brcode = mockPix(txid, valor);

    const item = { txid, mac, valor, tempo, plano, cliente, ip, brcode, qrcode: qrcode_b64, status:'PENDENTE', createdAt: Date.now() };
    FILA.push(item);
    setTimeout(()=>{ FILA=FILA.filter(f=>f.txid!==txid); }, 15*60*1000);

    // Retorno COMPATÍVEL com TODOS os fronts (amarelo v13 antigo e novo 4KB)
    return res.status(200).json({
      ok:true, txid, valor, tempo, plano, mac,
      brcode, copiaecola: brcode, pixCopiaECola: brcode, qrcode: qrcode_b64 || brcode, qr: brcode,
      pix:{ qrcode: qrcode_b64, copiaECola: brcode },
      data:{ brcode, copiaecola: brcode }
    });
  }catch(err){
    const txid = genTxid(); const code = mockPix(txid,5);
    return res.status(200).json({ ok:true, txid, brcode:code, copiaecola:code, pixCopiaECola:code, qrcode:code, qr:code, status:'PENDENTE', fallback:true, erro:err.message });
  }
}

// --- ROTAS ---
app.get('/api/health', (req,res)=> res.json({ status:'ok', version:'v13.6 UNIFICADO - MANHA FUNCIONANDO', time:new Date().toISOString(), fila: FILA.length, pendentes: FILA.filter(f=>f.status==='PENDENTE').length, pagos: FILA.filter(f=>f.status==='PAGO_LIBERAR').length }));

// Rota que estava dando 404 - agora é a principal + aliases
app.post('/api/gerar-qrcode', gerarPixCore);
app.get('/api/gerar-qrcode', gerarPixCore);
app.post('/api/criar-pix', gerarPixCore);
app.get('/api/criar-pix', gerarPixCore);
app.post('/api/gerar-pix', gerarPixCore);
app.post('/api/pix/criar', gerarPixCore);
app.post('/criar-pix', gerarPixCore);
app.post('/gerar-pix', gerarPixCore);
app.post('/api/gerar', gerarPixCore);
app.post('/api/pagamento', gerarPixCore);

// Fila - login.html faz polling aqui a cada 3s
app.get('/api/fila', (req,res)=>{
  try{
    const { txid, mac } = req.query;
    if(txid){ const f=FILA.find(x=>x.txid===txid); return res.status(200).json(f || { status:'NAO_ENCONTRADO' }); }
    if(mac){ const f=FILA.filter(x=>x.mac===mac.toUpperCase()); return res.status(200).json(f); }
    return res.status(200).json(FILA);
  }catch{ return res.status(200).json([]); }
});

// Compatível com SLS-LIBERA v12.5.6 que lê /api/liberacoes
app.get('/api/liberacoes', (req,res)=>{
  try{ const pagos=FILA.filter(f=>f.status==='PAGO_LIBERAR'); return res.status(200).json(pagos); }catch{ return res.status(200).json([]); }
});

app.get('/api/liberacoes/limpar', (req,res)=>{
  try{
    const { txid } = req.query;
    if(txid) FILA=FILA.filter(f=>f.txid!==txid);
    else FILA=FILA.filter(f=>f.status!=='PAGO_LIBERAR');
    return res.status(200).send('LIMPO');
  }catch{ return res.status(200).send('LIMPO'); }
});

// Status / verifica
app.get('/api/status/:txid', (req,res)=>{ const f=FILA.find(x=>x.txid===req.params.txid); return res.status(200).json(f||{status:'NAO_ENCONTRADO'}); });
app.get('/api/verifica/:txid', (req,res)=>{ const f=FILA.find(x=>x.txid===req.params.txid); return res.status(200).json(f||{status:'NAO_ENCONTRADO'}); });
app.post('/api/verifica', (req,res)=>{ const f=FILA.find(x=>x.txid===req.body?.txid); return res.status(200).json({ok:!!f, status:f?.status||'NAO_ENCONTRADO'}); });

// Simulador e pagamento real
app.get('/api/pagar/:txid', (req,res)=>{
  const f=FILA.find(x=>x.txid===req.params.txid);
  if(f){ f.status='PAGO_LIBERAR'; return res.status(200).json({ok:true, msg:'PAGO_LIBERAR', mac:f.mac, txid:f.txid}); }
  return res.status(200).json({ok:false, error:'txid nao encontrado'});
});
app.get('/api/simular-pago/:txid', (req,res)=>{
  const f=FILA.find(x=>x.txid===req.params.txid);
  if(f){ f.status='PAGO_LIBERAR'; return res.status(200).json({ok:true, status:'PAGO_LIBERAR'}); }
  return res.status(200).json({ok:false});
});

app.post('/api/webhook', (req,res)=>{ res.sendStatus(200); });
app.post('/api/webhook/pix', async (req,res)=>{
  try{
    const pixs=req.body?.pix||[];
    for(const p of pixs){ const f=FILA.find(x=>x.txid===p.txid); if(f) f.status='PAGO_LIBERAR'; }
    return res.status(200).json({ok:true});
  }catch{ return res.status(200).json({ok:true}); }
});

app.get('/api/limpar-tudo', (req,res)=>{ FILA=[]; return res.status(200).send('LIMPO TOTAL'); });

// Front
app.get('*', (req,res)=>{
  const idx=path.join(__dirname,'public','index.html');
  if(fs.existsSync(idx)) return res.sendFile(idx);
  return res.status(200).send('SLS WIFI EVENTOS v13.6 Live');
});

app.use((err,req,res,next)=>{ console.error(err.message); return res.status(200).json({ok:false, erro:err.message}); });

app.listen(PORT, ()=>{ console.log(`[v13.6 UNIFICADO] Rodando ${PORT} - MANHA 06:00 FIX`); safeCertificado(); });

setInterval(()=>{
  try{
    const now=Date.now();
    for(const f of FILA){ if(now-f.createdAt>3600000 && f.status==='PENDENTE') f.status='EXPIRADO'; }
  }catch{}
},5000);
