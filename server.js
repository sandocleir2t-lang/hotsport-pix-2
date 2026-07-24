// server.js v6.9.1 - INDEX EMBUTIDO - SEMPRE ABRE
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getEfiInstance } = require('./efi');
const app = express();
const PORT = process.env.PORT || 10000;
app.use(cors());
app.use(express.json());

const HOTSPOT_USER_FIXO='sls-liberado';
const HOTSPOT_PASS_FIXO='sls123';

const VOUCHER_FILE=path.join(__dirname,'vouchers.json');
function loadVouchers(){ try{ if(!fs.existsSync(VOUCHER_FILE)) return []; return JSON.parse(fs.readFileSync(VOUCHER_FILE,'utf8')); }catch{ return []; } }
function saveVouchers(l){ try{fs.writeFileSync(VOUCHER_FILE,JSON.stringify(l,null,2));}catch{} }
function usarVoucher(code,mac){
  if(!code) return {ok:false, erro:'Voucher vazio'};
  const c=code.trim().toUpperCase();
  const lista=loadVouchers();
  const f=lista.find(v=>v.code.toUpperCase()===c);
  if(!f) return {ok:false, erro:'Voucher inválido'};
  if(f.used){
    if(f.usedByMac===mac || mac==='desconhecido' || f.usedByMac==='desconhecido') return {ok:true, login:f.code, reuse:true, lista};
    return {ok:false, erro:`Voucher já usado - ${c}`};
  }
  f.used=true; f.usedAt=new Date().toISOString(); f.usedByMac=mac||'desconhecido';
  saveVouchers(lista);
  return {ok:true, login:f.code, lista};
}

const HTML_INDEX=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>SLS WIFI EVENTOS</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:system-ui}body{background:#0f0a1e;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;color:#fff}.card{background:linear-gradient(180deg,#2a1a5e 0%,#1a1033 100%);width:100%;max-width:390px;border-radius:24px;padding:28px;border:1px solid #3b2a7a}.plano{border:1px solid #3a2a6e;border-radius:16px;padding:12px;margin:8px 0;cursor:pointer}.plano.ativo{background:#2a1e4e;border-color:#7c3aed}.preco{font-size:20px;font-weight:800}.btn{width:100%;padding:16px;background:linear-gradient(90deg,#facc15,#eab308);color:#000;border:0;border-radius:12px;font-weight:900;font-size:16px;cursor:pointer;margin-top:12px}#pix-area{display:none;margin-top:20px;text-align:center}#qr-wrap{background:#fff;padding:12px;border-radius:16px;display:inline-block}#qr-img{width:260px;height:260px;display:block}#pix-copia{font-size:10px;word-break:break-all;background:#0f0a1e;border:1px dashed #3a2a6e;padding:10px;border-radius:10px;margin-top:10px;color:#c4b5fd;text-align:left}.voucher-area{margin-top:18px;border-top:1px solid #2a1e4e;padding-top:18px}.voucher-area input{width:100%;padding:14px;border-radius:10px;border:1px solid #3a2a6e;background:#1a1342;color:#fff;font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:2px;text-align:center}.btn-v{width:100%;padding:14px;border-radius:10px;border:1px solid #3a2a6e;background:#1e1b4b;color:#a78bfa;font-weight:800;margin-top:10px;cursor:pointer}</style></head><body><div class="card"><div style="text-align:center;margin-bottom:18px"><h1 style="font-size:30px;font-weight:900;letter-spacing:2px">SLS <span style="color:#a78bfa">WIFI</span> 🚀</h1><p style="color:#8b7bb8;font-size:11px;letter-spacing:3px">INTERNET RAPIDA AQUI</p></div><div class="plano ativo" onclick="sel(this,200)"><div style="display:flex;justify-content:space-between"><b>1 HORA</b><span class="preco">R$ 2,00</span></div></div><div class="plano" onclick="sel(this,300)"><div style="display:flex;justify-content:space-between"><b>2 HORAS</b><span class="preco">R$ 5,00</span></div></div><div class="plano" onclick="sel(this,1200)"><div style="display:flex;justify-content:space-between"><b>EVENTO TODO</b><span class="preco">R$ 12,00</span></div></div><button id="btn-gerar" class="btn">GERAR PIX - PAGAR AGORA</button><div id="pix-area"><div id="qr-wrap"><img id="qr-img"></div><div id="pix-copia"></div><button class="btn-v" onclick="navigator.clipboard.writeText(document.getElementById('pix-copia').innerText).then(()=>alert('PIX copiado'))">📋 COPIAR PIX</button><p id="status-pix" style="margin-top:10px;color:#facc15;font-weight:700">⏳ Aguardando pagamento...</p></div><div class="voucher-area"><p style="text-align:center;color:#8b7bb8;font-size:12px;margin-bottom:8px">Tenho voucher / Sou da equipe</p><input id="inp-voucher" placeholder="DIGITE SLS..."><button class="btn-v" onclick="usarVoucher()">🎫 USAR VOUCHER</button></div><div style="text-align:center;margin-top:16px;font-size:10px;color:#5a4a7a">SLS WIFI v6.9.1 FIXO sls-liberado 3H • LIVE</div></div><script>const qp=new URLSearchParams(location.search);const mac=qp.get('mac')||qp.get('mac-esc')||'';const ip=qp.get('ip')||'10.5.50.1';let valorCent=200,txidGlobal=null,interval=null;function sel(el,c){document.querySelectorAll('.plano').forEach(p=>p.classList.remove('ativo'));el.classList.add('ativo');valorCent=c}async function gerarPix(){const btn=document.getElementById('btn-gerar');btn.innerText='GERANDO PIX...';btn.disabled=true;try{const res=await fetch('/api/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mac,ip,valor:valorCent})});const data=await res.json();if(data.erro) throw new Error(data.erro);let b64=data.imagemQrcode.trim();document.getElementById('qr-img').src=b64.startsWith('data:')?b64:'data:image/png;base64,'+b64;document.getElementById('pix-copia').innerText=data.qrcode;document.getElementById('pix-area').style.display='block';txidGlobal=data.txid;if(interval)clearInterval(interval);interval=setInterval(()=>checar(txidGlobal),4000)}catch(e){alert('Erro PIX: '+e.message);btn.disabled=false;btn.innerText='GERAR PIX - PAGAR AGORA';return}btn.innerText='PIX GERADO ABAIXO ↓'}async function checar(txid){try{const r=await fetch('/api/pix?txid='+txid);const d=await r.json();if(d.status==='CONCLUIDA'||d.pago){clearInterval(interval);document.getElementById('status-pix').innerHTML='✅ PAGO! Liberando...';location.href='/api/libera?voucher=PIX-'+txid.substring(0,6)+'&mac='+mac+'&ip='+ip}}catch{}}async function usarVoucher(){const v=document.getElementById('inp-voucher').value.trim();if(!v) return alert('Digite voucher');location.href='/api/libera?voucher='+encodeURIComponent(v)+'&mac='+encodeURIComponent(mac)+'&ip='+encodeURIComponent(ip)}document.getElementById('btn-gerar').addEventListener('click',gerarPix);<\/script></body></html>`;

app.get('/ha/check',(req,res)=>res.status(200).send('OK'));
app.get('/check',(req,res)=>res.status(200).send('OK'));
app.get('/hotspot-detect.html',(req,res)=>res.status(200).send('Success'));
app.get('/success.txt',(req,res)=>res.status(200).send('Success'));
app.get('/health',(req,res)=>res.json({status:'LIVE',versao:'v6.9.1-INDEX-EMBUTIDO',fixo:`${HOTSPOT_USER_FIXO}/${HOTSPOT_PASS_FIXO}`}));

app.get('/', (req,res)=>{
  // tenta arquivo fisico, se não existir usa embutido
  const p=path.join(__dirname,'index.html');
  if(fs.existsSync(p)) return res.sendFile(p);
  return res.send(HTML_INDEX);
});

app.post('/api/criar-pix', async (req,res)=>{
  try{
    const {mac,ip,valor}=req.body;
    const reais=((valor||300)/100).toFixed(2);
    const efipay=getEfiInstance();
    const charge=await efipay.pixCreateImmediateCharge([],{calendario:{expiracao:3600}, valor:{original:reais}, chave:process.env.EFI_PIX_KEY, solicitacaoPagador:'SLS WIFI 3h'});
    const qrcode=await efipay.pixGenerateQRCode({id:charge.loc.id});
    return res.json({txid:charge.txid, qrcode:qrcode.qrcode, imagemQrcode:qrcode.imagemQrcode, valor:reais});
  }catch(e){ return res.status(500).json({erro:e.message}); }
});
app.get('/api/pix', async (req,res)=>{
  try{ const {txid}=req.query; const efipay=getEfiInstance(); const r=await efipay.pixDetailCharge({txid}); if(r.status==='CONCLUIDA') return res.json({status:'CONCLUIDA', pago:true}); return res.json({status:r.status, pago:false}); }catch{ return res.json({status:'ATIVA', pago:false}); }
});
app.post('/api/usar-voucher',(req,res)=>{
  const {voucher,mac}=req.body;
  const r=usarVoucher(voucher,mac);
  if(!r.ok) return res.json(r);
  return res.json({ok:true,...r});
});
app.get('/api/libera',(req,res)=>{
  const voucher=req.query.voucher||req.query.code;
  const mac=req.query.mac||'desconhecido';
  const ip=req.query.ip||'10.5.50.1';
  const r=usarVoucher(voucher,mac);
  if(!r.ok) return res.send(`<body style="background:#1e0a4a;color:#fff;font-family:Arial;text-align:center;padding-top:50px"><h2>${r.erro}</h2><a href="/" style="color:#a78bfa">Voltar</a></body>`);
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OK</title><style>body{background:#1e0a4a;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}</style></head><body><div><h1>✅ Voucher ${voucher} OK!</h1><p id="m">Liberando no MikroTik ${ip}...</p></div><form id="f" method="POST" action="http://${ip}/login" style="display:none"><input name="username" value="${HOTSPOT_USER_FIXO}"><input name="password" value="${HOTSPOT_PASS_FIXO}"><input name="dst" value="http://www.google.com"><input name="popup" value="false"></form><script>setTimeout(()=>{document.getElementById('f').submit();},800);setTimeout(()=>{location.href='http://www.google.com';},3500);<\/script></body></html>`;
  return res.send(html);
});
app.post('/api/criar-voucher',(req,res)=>{ const {qtd,code}=req.body; const lista=loadVouchers(); if(code) lista.push({code:code.toUpperCase(),used:false,createdAt:new Date().toISOString()}); else { for(let i=0;i<(parseInt(qtd)||10);i++){ const n='SLS'+Math.random().toString(36).substring(2,6).toUpperCase(); lista.push({code:n,used:false,createdAt:new Date().toISOString()}); } } saveVouchers(lista); return res.json({ok:true,lista}); });
app.get('/api/listar-vouchers',(req,res)=>res.json(loadVouchers()));
app.get('/api/limpar-vouchers',(req,res)=>{ saveVouchers([]); return res.json({ok:true}); });
app.delete('/api/limpar-vouchers',(req,res)=>{ saveVouchers([]); return res.json({ok:true}); });

app.listen(PORT, ()=>console.log(`🚀 v6.9.1 porta ${PORT} INDEX EMBUTIDO`));
