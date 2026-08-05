// v9.8 SLS WIFI - PREMIUM ROXO + TELA UNICA - HIBRIDO PERFEITO
const express = require('express');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(express.json()); app.use(express.urlencoded({extended:true}));

const PLANOS = {
  "1H": { valor: 3.00, tempo: 60, vel: "5 MEGA", nome: "1 HORA - 5 MEGA", desc: "Ideal para uso rapido", sub: "1h de acesso" },
  "3H": { valor: 5.00, tempo: 180, vel: "10 MEGA", nome: "3 HORAS - 10 MEGA", desc: "Mais vendido", sub: "3h de acesso", tag: "MAIS VENDIDO" },
  "24H": { valor: 12.00, tempo: 1440, vel: "15 MEGA", nome: "EVENTO TODO - 15 MEGA", desc: "Ultra rapida o dia todo", sub: "24h de acesso" }
};

let certPath = './certs/hotspot-producao.p12';
try{
 if(process.env.EFI_CERT_P12){ fs.writeFileSync('/tmp/cert.p12', Buffer.from(process.env.EFI_CERT_P12,'base64')); certPath='/tmp/cert.p12'; }
 else if(fs.existsSync('./certs/hotspot-producao.p12')) certPath='./certs/hotspot-producao.p12';
}catch(e){}
let fila=[]; const F='/tmp/fila.json';
try{ if(fs.existsSync(F)) fila=JSON.parse(fs.readFileSync(F)); }catch(e){}
const salvar=()=>{try{fs.writeFileSync(F,JSON.stringify(fila))}catch(e){}};
const efipay=new EfiPay({sandbox:false, client_id:process.env.EFI_CLIENT_ID, client_secret:process.env.EFI_CLIENT_SECRET, certificate:certPath, passphrase:process.env.CERT_PASSWORD||''});
const getExp=(m)=>Date.now()+(m*60*1000);

app.get('/', (req,res)=>{
  const mac = req.query.mac || '';
  const ip = req.query.ip || '';
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{background:#0a0a12;color:#fff;font-family:Inter,Arial;margin:0;padding:12px}
.top{background:#15151f;border-radius:20px;padding:12px;text-align:center;border:1px solid #222;margin-bottom:12px}
.online{color:#8b8fa3;font-size:11px;letter-spacing:1px}.dot{display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-right:6px;box-shadow:0 0 8px #22c55e}
.logo{display:flex;align-items:center;justify-content:center;gap:10px;margin:8px 0}
.ic{width:38px;height:38px;background:#7c3aed;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
.sls{font-size:28px;font-weight:800}.wifi{font-weight:300;color:#a78bfa}.sub{color:#8b8fa3;font-size:12px}
.card{background:#15151f;border-radius:20px;padding:14px;border:1px solid #222}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.badge{background:#2a2250;color:#a78bfa;font-size:10px;padding:6px 10px;border-radius:20px;border:1px solid #3b2f6e}
.alerta{background:#ffeb3b;color:#000;text-align:center;padding:10px;border-radius:12px;font-weight:800;font-size:13px;margin-bottom:12px}
.plano{border:1.5px solid #2a2a3a;border-radius:16px;padding:14px;margin-bottom:10px;position:relative;cursor:pointer;background:#1a1a27}
.plano.ativo{border-color:#ffeb3b;box-shadow:0 0 15px rgba(255,235,59,.3);background:#1e1e2d}
.tag{position:absolute;top:-9px;right:15px;background:#7c3aed;font-size:10px;padding:3px 8px;border-radius:10px;font-weight:700;color:#fff}
.row{display:flex;justify-content:space-between;align-items:center}
.left{display:flex;gap:10px;align-items:center}
.ico{width:32px;height:32px;background:#1e1e2d;border-radius:50%;display:flex;align-items:center;justify-content:center}
.price{font-size:20px;font-weight:800}.small{font-size:11px;color:#8b8fa3}
.btn{width:100%;background:#ffeb3b;color:#000;border:none;padding:16px;border-radius:14px;font-size:16px;font-weight:900;margin-top:12px;cursor:pointer}
.qrbox{display:none;background:#fff;border-radius:16px;padding:14px;margin-top:14px;text-align:center;color:#000}
.input{width:100%;background:#0f0f1a;border:1px solid #2a2a3a;color:#fff;padding:13px;border-radius:12px;margin-top:10px;box-sizing:border-box}
.btn-voucher{width:100%;background:#2a2250;border:1px solid #3b2f6e;color:#a78bfa;padding:13px;border-radius:12px;font-weight:800;margin-top:10px;cursor:pointer}
.sep{text-align:center;color:#8b8fa3;font-size:12px;margin-top:16px}
</style></head><body>

<div class="top"><div class="online"><span class="dot"></span>ONLINE • 247 CLIENTES CONECTADOS</div>
<div class="logo"><div class="ic">📶</div><div class="sls">SLS<span class="wifi">WIFI</span></div></div>
<div class="sub">Internet rápida • Pagamento instantâneo via PIX</div></div>

<div class="alerta">NAO FECHE ESTA TELA ATE PAGAR!</div>

<div class="card">
<div class="head"><b>ESCOLHA SEU PLANO</b><span class="badge">⚡ Ativação imediata</span></div>

<div id="p1" class="plano ativo" onclick="sel('1H')"><div class="tag" style="background:#ffeb3b;color:#000">1H</div><div class="row"><div class="left"><div class="ico">🕐</div><div><div><b>1 HORA - 5 MEGA</b></div><div class="small">Ideal para uso rápido</div></div></div><div style="text-align:right"><div class="price">R$ 3</div><div class="small">1h de acesso</div></div></div></div>

<div id="p2" class="plano" onclick="sel('3H')"><div class="tag">MAIS VENDIDO</div><div class="row"><div class="left"><div class="ico">🕒</div><div><div><b>3 HORAS - 10 MEGA</b></div><div class="small">Mais vendido</div></div></div><div style="text-align:right"><div class="price">R$ 5</div><div class="small">3h de acesso</div></div></div></div>

<div id="p3" class="plano" onclick="sel('24H')"><div class="row"><div class="left"><div class="ico">📅</div><div><div><b>EVENTO TODO - 15 MEGA</b></div><div class="small">Ultra rápida o dia todo</div></div></div><div style="text-align:right"><div class="price">R$ 12</div><div class="small">24h de acesso</div></div></div></div>

<button class="btn" id="btnGerar" onclick="gerarPix()">GERAR PIX - PAGAR AGORA</button>

<div id="qrBox" class="qrbox">
<div style="font-weight:800;margin-bottom:8px">PIX GERADO - <span id="planoNomeQr"></span></div>
<img id="qrImg" src="" style="width:260px;max-width:100%">
<div id="qrCodeTxt" style="font-size:9px;word-break:break-all;margin-top:8px;color:#000"></div>
<div id="statusPix" style="margin-top:10px;font-weight:800;color:#16a34a">Aguardando pagamento...</div>
</div>

<div class="sep">TEM VOUCHER?</div>
<form action="http://10.5.50.1/login" method="post">
<input type="hidden" name="dst" value="https://www.google.com">
<input class="input" name="username" placeholder="CODIGO VOUCHER">
<input class="input" type="password" name="password" placeholder="SENHA">
<button class="btn-voucher" type="submit">ENTRAR COM VOUCHER</button>
</form>

</div>

<script>
let planoSel='1H';
function sel(p){ planoSel=p; document.querySelectorAll('.plano').forEach(e=>e.classList.remove('ativo')); document.getElementById(p=='1H'?'p1':p=='3H'?'p2':'p3').classList.add('ativo'); }
async function gerarPix(){
 let btn=document.getElementById('btnGerar'); btn.innerHTML='GERANDO PIX...'; btn.disabled=true;
 try{
  let mac='${mac}'; let ip='${ip}';
  let r=await fetch('/api/gerar?plano='+planoSel+'&mac='+encodeURIComponent(mac)+'&ip='+encodeURIComponent(ip));
  let d=await r.json();
  if(d.erro){ alert(d.erro); btn.innerHTML='GERAR PIX - PAGAR AGORA'; btn.disabled=false; return; }
  document.getElementById('planoNomeQr').innerText=d.planoNome;
  document.getElementById('qrImg').src=d.qrImagem;
  document.getElementById('qrCodeTxt').innerText=d.qrCode;
  document.getElementById('qrBox').style.display='block';
  document.getElementById('qrBox').scrollIntoView({behavior:'smooth'});
  btn.innerHTML='PIX GERADO - AGUARDANDO';
  let tx=d.txid;
  let interval=setInterval(async()=>{
   let rs=await fetch('/status/'+tx); let js=await rs.json();
   if(js.status=='CONCLUIDA'){ clearInterval(interval); document.getElementById('statusPix').innerHTML='✅ PAGO! LIBERANDO...'; setTimeout(()=>{ window.location.href='http://10.5.50.1'; },1200); }
  },3000);
 }catch(e){ alert('Erro: '+e.message); btn.innerHTML='GERAR PIX - PAGAR AGORA'; btn.disabled=false; }
}
</script>
</body></html>`);
});

app.get('/api/gerar', async (req,res)=>{
  const {plano,mac,ip}=req.query;
  const PLANOS_MAP = {
    "1H": { valor: 3.00, tempo: 60, vel: "5M/5M", nome: "1 HORA - 5 MEGA" },
    "3H": { valor: 5.00, tempo: 180, vel: "10M/10M", nome: "3 HORAS - 10 MEGA" },
    "24H": { valor: 12.00, tempo: 1440, vel: "15M/15M", nome: "EVENTO TODO - 15 MEGA" },
    "2H": { valor: 5.00, tempo: 120, vel: "10M/10M", nome: "2 HORAS - 10 MEGA" },
    "EVENTO": { valor: 12.00, tempo: 1440, vel: "15M/15M", nome: "EVENTO TODO - 15 MEGA" }
  };
  const p = PLANOS_MAP[plano] || PLANOS_MAP["1H"];
  try{
    const body={ calendario:{expiracao:600}, valor:{original:p.valor.toFixed(2)}, chave:process.env.EFI_PIX_KEY, infoAdicionais:[{nome:"plano",valor:plano},{nome:"mac",valor:mac||"00:00"},{nome:"ip",valor:ip||"0.0.0.0"},{nome:"tempo",valor:String(p.tempo)},{nome:"velocidade",valor:p.vel}] };
    const cob=await efipay.pixCreateImmediateCharge({},body); 
    const qr=await efipay.pixGenerateQRCode({id:cob.loc.id});
    const item={txid:cob.txid,plano,mac,ip,tempoMin:p.tempo,velocidade:p.vel,status:'ATIVA',expiraEm:getExp(p.tempo)}; 
    fila=fila.filter(f=>f.txid!==cob.txid); fila.push(item); salvar();
    res.json({txid:cob.txid, qrImagem:qr.imagemQrcode, qrCode:qr.qrcode, planoNome:p.nome});
  }catch(e){ res.json({erro:'Erro PIX: '+e.message}); }
});

app.post('/webhook', async (req,res)=>{ const list=req.body.pix||[]; for(let p of list){ let i=fila.findIndex(f=>f.txid===p.txid); if(i>=0){ fila[i].status='CONCLUIDA'; fila[i].expiraEm=getExp(fila[i].tempoMin); salvar(); } } res.json({ok:true}); });
app.get('/api/liberacoes',(req,res)=>res.json(fila.filter(f=>f.status==='CONCLUIDA'&&f.expiraEm>Date.now())));
app.get('/api/consumido/:ip',(req,res)=>{ fila=fila.filter(f=>f.ip!==req.params.ip); salvar(); res.json({ok:true}); });
app.get('/status/:txid',(req,res)=>res.json(fila.find(f=>f.txid===req.params.txid)||{status:'NAO_ENCONTRADO'}));
app.get('/configurar-webhook', async (req,res)=>{ try{ const r=await efipay.pixConfigWebhook({chave:process.env.EFI_PIX_KEY},{webhookUrl:'https://hotsport-pix-2.onrender.com/webhook'}); res.json(r);}catch(e){res.json(e)} });
setInterval(async()=>{ for(const f of fila.filter(f=>f.status==='ATIVA')){ try{ const det=await efipay.pixDetailCharge({txid:f.txid}); if(det.status==='CONCLUIDA'){ f.status='CONCLUIDA'; f.expiraEm=getExp(f.tempoMin); salvar(); } }catch(e){} } },30000);
app.listen(process.env.PORT||3000, ()=>console.log('SLS v9.8 PREMIUM ROXO + TELA UNICA HIBRIDO PATH:'+certPath));
