// server.js - v6.9 - LOGIN FIXO MIKROTIK - RESOLVE SEM INTERNET
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

console.log('=== SLS WIFI v6.9 - FIX LOGIN FIXO MIKROTIK ===');

// Rotas que MikroTik exige
app.get('/ha/check', (req, res) => res.status(200).send('OK'));
app.get('/check', (req, res) => res.status(200).send('OK'));
app.get('/hotspot-detect.html', (req, res) => res.status(200).send('Success'));
app.get('/success.txt', (req, res) => res.status(200).send('Success'));

// CONFIG - MUDE AQUI SE SEU USUARIO MIKROTIK FOR DIFERENTE
const HOTSPOT_USER_FIXO = 'sls-liberado';
const HOTSPOT_PASS_FIXO = 'sls123';

const VOUCHER_FILE = path.join(__dirname, 'vouchers.json');
function loadVouchers() { try { if (!fs.existsSync(VOUCHER_FILE)) return []; return JSON.parse(fs.readFileSync(VOUCHER_FILE, 'utf8')); } catch { return []; } }
function saveVouchers(l){ try{fs.writeFileSync(VOUCHER_FILE, JSON.stringify(l,null,2));}catch{} }

function usarVoucher(code, mac){
  if(!code) return {ok:false, erro:'Voucher vazio'};
  const c=code.trim().toUpperCase();
  const lista=loadVouchers();
  const f=lista.find(v=>v.code.toUpperCase()===c);
  if(!f) return {ok:false, erro:'Voucher inválido'};
  if(f.used){
    if(f.usedByMac===mac || mac==='desconhecido' || f.usedByMac==='desconhecido'){
      return {ok:true, login:f.code, reuse:true, lista};
    }
    return {ok:false, erro:`Voucher já usado - ${c}`};
  }
  f.used=true; f.usedAt=new Date().toISOString(); f.usedByMac=mac||'desconhecido';
  saveVouchers(lista);
  console.log(`[VOUCHER] LIBERADO: ${c} MAC:${mac} -> vai logar como ${HOTSPOT_USER_FIXO}`);
  return {ok:true, login:f.code, lista};
}

app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/health', (req,res)=>res.json({status:'LIVE', versao:'v6.9-fixo', fixo:`${HOTSPOT_USER_FIXO}/${HOTSPOT_PASS_FIXO}`}));

// PIX
app.post('/api/criar-pix', async (req,res)=>{
  try{
    const {mac,ip,valor}=req.body;
    const reais=((valor||300)/100).toFixed(2);
    const efipay=getEfiInstance();
    const charge=await efipay.pixCreateImmediateCharge([],{calendario:{expiracao:3600}, valor:{original:reais}, chave:process.env.EFI_PIX_KEY, solicitacaoPagador:'SLS WIFI - 3 horas'});
    const qrcode=await efipay.pixGenerateQRCode({id:charge.loc.id});
    return res.json({txid:charge.txid, qrcode:qrcode.qrcode, imagemQrcode:qrcode.imagemQrcode, valor:reais});
  }catch(e){ return res.status(500).json({erro:e.message}); }
});
app.get('/api/pix', async (req,res)=>{
  try{ const {txid}=req.query; const efipay=getEfiInstance(); const r=await efipay.pixDetailCharge({txid}); if(r.status==='CONCLUIDA') return res.json({status:'CONCLUIDA', pago:true}); return res.json({status:r.status, pago:false}); }catch{ return res.json({status:'ATIVA', pago:false}); }
});

// VOUCHER
app.post('/api/usar-voucher', (req,res)=>{
  const {voucher,mac}=req.body;
  console.log(`[POST] ${voucher} MAC:${mac}`);
  const r=usarVoucher(voucher,mac);
  if(!r.ok) return res.json(r);
  return res.json({ok:true, ...r});
});

app.get('/api/libera', (req,res)=>{
  const voucher=req.query.voucher||req.query.code;
  const mac=req.query.mac||req.query['mac-esc']||'desconhecido';
  const ip=req.query.ip||'10.5.50.1';
  console.log(`[GET /api/libera] ${voucher} MAC:${mac} IP:${ip}`);
  const r=usarVoucher(voucher,mac);
  if(!r.ok){
    return res.send(`<html><body style="background:#1e0a4a;color:#fff;font-family:Arial;text-align:center;padding-top:50px"><h2>${r.erro}</h2><a href="/" style="color:#a78bfa">Voltar</a></body></html>`);
  }
  // Pagina que faz login com USUARIO FIXO que EXISTE no MikroTik
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Liberado</title><style>body{background:#1e0a4a;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;margin:0}h1{font-size:22px}</style></head><body>
  <div><h1>✅ Voucher ${voucher} OK!</h1><p id="m">Liberando internet no MikroTik ${ip}...</p><p style="font-size:12px;opacity:0.6">Usuário: ${HOTSPOT_USER_FIXO}</p></div>
  <form id="f" method="POST" action="http://${ip}/login" style="display:none">
    <input name="username" value="${HOTSPOT_USER_FIXO}">
    <input name="password" value="${HOTSPOT_PASS_FIXO}">
    <input name="dst" value="http://www.google.com">
    <input name="popup" value="false">
  </form>
  <script>
    setTimeout(()=>{ document.getElementById('m').innerText='Fazendo login no hotspot...'; document.getElementById('f').submit(); }, 800);
    // Se falhar, tenta 10.5.50.1 e 192.168.88.1
    setTimeout(()=>{ 
      const form=document.getElementById('f');
      if(form) { form.action='http://10.5.50.1/login'; form.submit(); }
    }, 2500);
    setTimeout(()=>{ window.location.href='http://www.google.com'; }, 4000);
  </script></body></html>`;
  return res.send(html);
});

app.post('/api/criar-voucher', (req,res)=>{
  const {qtd, code}=req.body; const lista=loadVouchers();
  if(code) lista.push({code:code.toUpperCase(), used:false, createdAt:new Date().toISOString()});
  else { for(let i=0;i<(parseInt(qtd)||10);i++){ const n='SLS'+Math.random().toString(36).substring(2,6).toUpperCase(); lista.push({code:n, used:false, createdAt:new Date().toISOString()}); } }
  saveVouchers(lista); return res.json({ok:true, lista});
});
app.get('/api/listar-vouchers', (req,res)=>res.json(loadVouchers()));
app.get('/api/limpar-vouchers', (req,res)=>{ saveVouchers([]); return res.json({ok:true}); });
app.delete('/api/limpar-vouchers', (req,res)=>{ saveVouchers([]); return res.json({ok:true}); });

app.listen(PORT, ()=>console.log(`🚀 v6.9 porta ${PORT} - LOGIN FIXO ${HOTSPOT_USER_FIXO}`));
