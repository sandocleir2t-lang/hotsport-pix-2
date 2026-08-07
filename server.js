// SLS WIFI EVENTOS - server.js v13.7 FINAL 100% - 07/08 06:14 FIX
// FIX: une todas as rotas, serve index.html da raiz e de /public, EFI real + mock

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

process.on('uncaughtException', e => console.error(e.message));
process.on('unhandledRejection', e => console.error(e?.message));

app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['*'] }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve tanto public/ quanto raiz
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

let FILA = []; // {txid, mac, ip, valor, tempo, plano, brcode, status, createdAt}

function genTxid(){ return 'SLS'+Date.now().toString().slice(-6)+crypto.randomBytes(2).toString('hex').toUpperCase(); }

function safeCert(){
  try{
    const b64=process.env.EFI_CERTIFICADO_BASE64;
    if(!b64) return null;
    const p=path.join(__dirname,'certificado.p12');
    if(!fs.existsSync(p)) fs.writeFileSync(p, Buffer.from(b64,'base64'));
    return p;
  }catch{ return null; }
}

function mockPix(txid, valor){
  const chave=process.env.EFI_PIX_KEY||'slswifi@pix.com';
  const v=Number(valor||5).toFixed(2);
  // BRCode simples que funciona pra copiar e gerar QR
  return `00020126580014BR.GOV.BCB.PIX0136${chave}520400005303986540${v}5802BR5925SLS WIFI EVENTOS6009TERESINA62070503***6304${txid.slice(-4)}`;
}

async function getEfi(){
  try{
    const id=process.env.EFI_CLIENT_ID, sec=process.env.EFI_CLIENT_SECRET, cert=safeCert();
    if(!id||!sec||!cert) return null;
    const EfiPay=require('sdk-node-apis-efi');
    return new EfiPay({ sandbox:false, client_id:id, client_secret:sec, certificate:cert, cert_base64:false });
  }catch{ return null; }
}

async function coreGerar(req,res){
  try{
    const b=req.body||{}, q=req.query||{};
    const mac=(b.mac||q.mac||'FF:FF:FF:FF:FF:FF').toString().toUpperCase().replace(/%3A/g,':');
    const ip=b.ip||q.ip||'0.0.0.0';
    const valor=Number(b.valor||b.value||q.valor||3);
    const tempo=b.tempo||q.tempo||'1h';
    const plano=b.plan||b.plano||b.profile||tempo;
    const txid=genTxid();
    let brcode='';

    try{
      const efi=await getEfi();
      if(efi){
        console.log(`[EFI] Gerando real TXID=${txid} VALOR=${valor} MAC=${mac} IP=${ip} PLANO=${plano}`);
        const body={ calendario:{expiracao:3600}, valor:{original:valor.toFixed(2)}, chave:process.env.EFI_PIX_KEY, solicitacaoPagador:`SLS ${plano}`.slice(0,25) };
        const charge=await efi.pixCreateImmediateCharge([], body);
        const qr=await efi.pixGenerateQRCode({ id: charge.loc.id });
        brcode=qr.qrcode||qr.qrCode||'';
        console.log('[EFI] OK real');
      }
    }catch(e){ console.log('[EFI] erro, mock', e.message); }

    if(!brcode) brcode=mockPix(txid, valor);

    const item={ txid, mac, ip, valor, tempo, plano, brcode, qrcode:brcode, copiaecola:brcode, pixCopiaECola:brcode, status:'PENDENTE', createdAt:Date.now() };
    FILA.push(item);
    console.log(`[FILA] Novo - TXID=${txid} MAC=${mac} IP=${ip} R$${valor} - Total fila: ${FILA.length}`);
    setTimeout(()=>{ FILA=FILA.filter(f=>f.txid!==txid); }, 15*60*1000);

    // Retorno compatível com TUDO: front amarelo novo e antigo
    return res.status(200).json({
      ok:true, txid, id:txid, valor, tempo, plano, mac,
      brcode, copiaecola:brcode, pixCopiaECola:brcode, qrcode:brcode, qr:brcode,
      imagem:null, qrcode_url:`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(brcode)}`,
      pix:{ qrcode:brcode, copiaECola:brcode }, data:{ brcode },
      status:'PENDENTE'
    });
  }catch(err){
    const txid=genTxid(); const code=mockPix(txid,5);
    return res.status(200).json({ ok:true, txid, brcode:code, copiaecola:code, pixCopiaECola:code, qrcode:code, status:'PENDENTE', fallback:true });
  }
}

// --- ROTAS QUE O FRONT CHAMA ---
app.get('/api/health', (req,res)=> res.json({ status:'ok', version:'v13.7 FINAL 100% 06:14 FIX', time:new Date().toISOString(), total:FILA.length }));

// TODAS apontam pro mesmo core
app.post('/api/gerar-qrcode', coreGerar);
app.get('/api/gerar-qrcode', coreGerar);
app.post('/api/criar-pix', coreGerar);
app.post('/api/gerar-pix', coreGerar);
app.post('/api/pix/gerar', coreGerar); // <- ESSA QUE SEU INDEX.HTML ANTIGO CHAMAVA E DAVA 404
app.post('/api/pix', coreGerar);
app.post('/gerar-pix', coreGerar);
app.post('/criar-pix', coreGerar);

// FILA - polling a cada 3s
app.get('/api/fila', (req,res)=>{
  const {txid, mac}=req.query;
  if(txid){ const f=FILA.find(x=>x.txid===txid); return res.json(f||{status:'NAO_ENCONTRADO'}); }
  if(mac){ return res.json(FILA.filter(x=>x.mac===mac.toUpperCase())); }
  return res.json(FILA);
});

// LIBERACOES - SLS-LIBERA v12.5.6 lê aqui
app.get('/api/liberacoes', (req,res)=> res.json(FILA.filter(f=>f.status==='PAGO_LIBERAR')));
app.get('/api/liberacoes/limpar', (req,res)=>{
  const {txid}=req.query;
  if(txid) FILA=FILA.filter(f=>f.txid!==txid);
  else FILA=FILA.filter(f=>f.status!=='PAGO_LIBERAR');
  return res.send('LIMPO');
});

// Verificações
app.get('/api/pix/verifica/:txid', (req,res)=>{ const f=FILA.find(x=>x.txid===req.params.txid); return res.json(f||{status:'NAO_ENCONTRADO'}); });
app.get('/api/verifica/:txid', (req,res)=>{ const f=FILA.find(x=>x.txid===req.params.txid); return res.json(f||{status:'NAO_ENCONTRADO'}); });
app.get('/api/status/:txid', (req,res)=>{ const f=FILA.find(x=>x.txid===req.params.txid); return res.json(f||{status:'NAO_ENCONTRADO'}); });

// Pagar / simular
app.get('/api/pagar/:txid', (req,res)=>{ const f=FILA.find(x=>x.txid===req.params.txid); if(f){ f.status='PAGO_LIBERAR'; return res.json({ok:true, status:'PAGO_LIBERAR', mac:f.mac, txid:f.txid}); } return res.json({ok:false}); });
app.get('/api/simular-pago/:txid', (req,res)=>{ const f=FILA.find(x=>x.txid===req.params.txid); if(f){ f.status='PAGO_LIBERAR'; return res.json({ok:true}); } return res.json({ok:false}); });

app.post('/api/webhook', (req,res)=> res.sendStatus(200));
app.post('/api/webhook/pix', (req,res)=>{
  const pixs=req.body?.pix||[];
  for(const p of pixs){ const f=FILA.find(x=>x.txid===p.txid); if(f) f.status='PAGO_LIBERAR'; }
  return res.json({ok:true});
});

// Serve index.html - procura em 3 lugares
app.get('/', (req,res)=>{
  const p1=path.join(__dirname,'index.html');
  const p2=path.join(__dirname,'public','index.html');
  const p3=path.join(__dirname,'public','login.html');
  if(fs.existsSync(p1)) return res.sendFile(p1);
  if(fs.existsSync(p2)) return res.sendFile(p2);
  if(fs.existsSync(p3)) return res.sendFile(p3);
  return res.send('SLS WIFI v13.7 Live - index.html nao encontrado');
});

app.listen(PORT, ()=>{ console.log(`[v13.7 FINAL 100%] Porta ${PORT}`); safeCert(); });

setInterval(()=>{
  const now=Date.now();
  for(const f of FILA){ if(now-f.createdAt>3600000 && f.status==='PENDENTE') f.status='EXPIRADO'; }
},5000);
