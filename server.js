// v9.5 SLS WIFI - DESIGN PREMIUM + JA PAGUEI + VOUCHER + FIX CERT
const express = require('express');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(express.json()); app.use(express.urlencoded({extended:true}));

const PLANOS = {
  "1H": { valor: 3.00, tempo: 60, vel: "5M/5M", nome: "1 HORA", desc: "Ideal para uso rapido" },
  "3H": { valor: 5.00, tempo: 180, vel: "10M/10M", nome: "3 HORAS", desc: "Mais vendido", tag: "MAIS VENDIDO" },
  "24H": { valor: 10.00, tempo: 1440, vel: "10M/10M", nome: "24 HORAS", desc: "Conexao o dia todo" }
};

let certPath = './certs/hotspot-producao.p12';
try{
 if(process.env.EFI_CERT_P12){ fs.writeFileSync('/tmp/cert.p12', Buffer.from(process.env.EFI_CERT_P12,'base64')); certPath='/tmp/cert.p12'; }
 else if(fs.existsSync('./certs/hotspot-producao.p12')) certPath='./certs/hotspot-producao.p12';
}catch(e){}
let fila=[]; const FILA_PATH='/tmp/fila.json';
try{ if(fs.existsSync(FILA_PATH)) fila=JSON.parse(fs.readFileSync(FILA_PATH)); }catch(e){}
const salvar=()=>{try{fs.writeFileSync(FILA_PATH,JSON.stringify(fila))}catch(e){}};
const efipay=new EfiPay({sandbox:false, client_id:process.env.EFI_CLIENT_ID, client_secret:process.env.EFI_CLIENT_SECRET, certificate:certPath, passphrase:process.env.CERT_PASSWORD||''});
const getExp=(m)=>Date.now()+(m*60*1000);

function htmlFull(mac,ip){
return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+
'body{background:#0a0a12;color:#fff;font-family:Arial;margin:0;padding:12px}'+
'.top{background:#15151f;border-radius:20px;padding:12px;text-align:center;border:1px solid #222}'+
'.dot{display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-right:6px}'+
'.logo{display:flex;align-items:center;justify-content:center;gap:10px;margin:8px 0}'+
'.ic{width:38px;height:38px;background:#7c3aed;border-radius:10px;display:flex;align-items:center;justify-content:center}'+
'.sls{font-size:26px;font-weight:800}.sub{color:#8b8fa3;font-size:12px}'+
'.card{background:#15151f;border-radius:20px;padding:14px;border:1px solid #222;margin-top:12px}'+
'.head{display:flex;justify-content:space-between;align-items:center}'+
'.badge{background:#2a2250;color:#a78bfa;font-size:11px;padding:5px 10px;border-radius:20px}'+
'.plano{border:1.5px solid #2a2a3a;border-radius:14px;padding:12px;margin:10px 0;position:relative;cursor:pointer}'+
'.plano.active{border-color:#7c3aed;background:#1d1633}'+
'.tag{position:absolute;top:-8px;right:12px;background:#7c3aed;font-size:10px;padding:2px 7px;border-radius:10px}'+
'.row{display:flex;justify-content:space-between;align-items:center}'+
'.price{font-weight:800;font-size:18px}.small{font-size:11px;color:#8b8fa3}'+
'.btn{width:100%;background:#7c3aed;color:#fff;border:none;padding:15px;border-radius:12px;font-weight:800;margin-top:10px}'+
'.tabs{display:flex;gap:8px;margin-top:14px}'+
'.tab{flex:1;background:#1e1e2d;border:1px solid #2a2a3a;padding:12px;border-radius:12px;text-align:center;font-size:13px;cursor:pointer}'+
'.tab.active{background:#2a2250;border-color:#7c3aed;color:#a78bfa}'+
'.panel{display:none;margin-top:12px}.panel.active{display:block}'+
'.input{width:100%;background:#0f0f1a;border:1px solid #2a2a3a;color:#fff;padding:12px;border-radius:10px;margin:6px 0;box-sizing:border-box}'+
'.btn2{width:100%;background:#1e1e2d;border:1px solid #3a3a4a;color:#fff;padding:12px;border-radius:10px;margin-top:8px}'+
'</style></head><body>'+
'<div class="top"><div style="color:#8b8fa3;font-size:11px"><span class="dot"></span>ONLINE - 247 CLIENTES CONECTADOS</div>'+
'<div class="logo"><div class="ic">📶</div><div class="sls">SLS WIFI</div></div><div class="sub">Internet rapida - Pagamento via PIX</div></div>'+
'<div class="card"><div class="head"><b>ESCOLHA SEU PLANO</b><span class="badge">Ativacao imediata</span></div>'+
'<div id="p1" class="plano active" onclick="sel(\'1H\')"><div class="row"><div><b>1 HORA</b><div class="small">Ideal para uso rapido</div></div><div style="text-align:right"><div class="price">R$ 3</div><div class="small">1h acesso</div></div></div></div>'+
'<div id="p2" class="plano" onclick="sel(\'3H\')"><div class="tag">MAIS VENDIDO</div><div class="row"><div><b>3 HORAS</b><div class="small">Mais vendido</div></div><div style="text-align:right"><div class="price">R$ 5</div><div class="small">3h acesso</div></div></div></div>'+
'<div id="p3" class="plano" onclick="sel(\'24H\')"><div class="row"><div><b>24 HORAS</b><div class="small">Conexao dia todo</div></div><div style="text-align:right"><div class="price">R$ 10</div><div class="small">24h acesso</div></div></div></div>'+
'<form action="/" method="get"><input type="hidden" name="plano" id="plano" value="1H"><input type="hidden" name="mac" value="'+(mac||'')+'"><input type="hidden" name="ip" value="'+(ip||'')+'"><button class="btn">GERAR PIX E CONECTAR</button></form>'+
'<div class="tabs"><div class="tab active" onclick="openTab(\'pix\')">PIX</div><div class="tab" onclick="openTab(\'pago\')">JA PAGUEI</div><div class="tab" onclick="openTab(\'voucher\')">VOUCHER</div></div>'+
'<div id="tab-pix" class="panel active"></div>'+
'<div id="tab-pago" class="panel"><p class="small">Se ja pagou e caiu, clique:</p><button class="btn2" onclick="jaPaguei()">JA PAGUEI - LIBERAR NOVAMENTE</button><div id="msgPago" class="small" style="margin-top:8px"></div></div>'+
'<div id="tab-voucher" class="panel"><form action="http://10.5.50.1/login" method="post"><input type="hidden" name="dst" value="https://www.google.com"><input class="input" name="username" placeholder="Codigo / Usuario"><input class="input" type="password" name="password" placeholder="Senha"><button class="btn2" type="submit">ENTRAR COM VOUCHER</button></form></div>'+
'</div>'+
'<script>'+
'function sel(p){document.getElementById("plano").value=p; document.querySelectorAll(".plano").forEach(e=>e.classList.remove("active")); document.getElementById(p=="1H"?"p1":p=="3H"?"p2":"p3").classList.add("active");}'+
'function openTab(t){document.querySelectorAll(".tab").forEach(e=>e.classList.remove("active")); document.querySelectorAll(".panel").forEach(e=>e.classList.remove("active")); var idx=t=="pix"?0:t=="pago"?1:2; document.querySelectorAll(".tab")[idx].classList.add("active"); document.getElementById("tab-"+t).classList.add("active"); var show=t=="pix"; document.getElementById("p1").style.display=show?"block":"none"; document.getElementById("p2").style.display=show?"block":"none"; document.getElementById("p3").style.display=show?"block":"none"; document.querySelector(".btn").style.display=show?"block":"none";}'+
'async function jaPaguei(){ let ip="'+(ip||'')+'"; let r=await fetch("/api/liberacoes"); let d=await r.json(); let achou=d.find(f=>f.ip==ip); document.getElementById("msgPago").innerHTML=achou?"Encontrado! Liberando...":"Nenhum pagamento ativo para "+ip; if(achou) setTimeout(()=>{window.location.href="http://10.5.50.1";},1500);}'+
'</script></body></html>';
}

app.get('/', async (req,res)=>{
  const {plano,mac,ip}=req.query;
  if(plano && PLANOS[plano]){
    try{
      const p=PLANOS[plano];
      const body={ calendario:{expiracao:600}, valor:{original:p.valor.toFixed(2)}, chave:process.env.EFI_PIX_KEY, infoAdicionais:[{nome:"plano",valor:plano},{nome:"mac",valor:mac||"00:00"},{nome:"ip",valor:ip||"0.0.0.0"},{nome:"tempo",valor:String(p.tempo)},{nome:"velocidade",valor:p.vel}] };
      const cob=await efipay.pixCreateImmediateCharge({},body); const qr=await efipay.pixGenerateQRCode({id:cob.loc.id});
      const item={txid:cob.txid,plano,mac,ip,tempoMin:p.tempo,velocidade:p.vel,status:'ATIVA',expiraEm:getExp(p.tempo),criadoEm:Date.now()}; fila=fila.filter(f=>f.txid!==cob.txid); fila.push(item); salvar();
      return res.send('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0a0a12;color:#fff;text-align:center;padding:20px;font-family:Arial}.qr{background:#fff;padding:15px;border-radius:15px;width:280px;margin:20px auto}</style></head><body><h1>SLS WIFI - '+p.nome+' R$ '+p.valor+'</h1><div class="qr"><img src="'+qr.imagemQrcode+'" style="width:100%"><p style="color:#000;font-size:10px;word-break:break-all">'+qr.qrcode+'</p></div><p id="s">Aguardando PIX...</p><script>let t="'+cob.txid+'";setInterval(async()=>{let r=await fetch("/status/"+t);let d=await r.json();if(d.status=="CONCLUIDA"){document.getElementById("s").innerHTML="PAGO! LIBERADO!";setTimeout(()=>{window.location.href="http://10.5.50.1";},1500);}},3000);</script></body></html>');
    }catch(e){ return res.send('Erro PIX: '+e.message); }
  }
  res.send(htmlFull(req.query.mac, req.query.ip));
});

app.post('/webhook', async (req,res)=>{ const list=req.body.pix||[]; for(let p of list){ let i=fila.findIndex(f=>f.txid===p.txid); if(i>=0){ fila[i].status='CONCLUIDA'; fila[i].expiraEm=getExp(fila[i].tempoMin); salvar(); } } res.json({ok:true}); });
app.get('/api/liberacoes',(req,res)=>res.json(fila.filter(f=>f.status==='CONCLUIDA'&&f.expiraEm>Date.now())));
app.get('/api/consumido/:ip',(req,res)=>{ fila=fila.filter(f=>f.ip!==req.params.ip); salvar(); res.json({ok:true}); });
app.get('/status/:txid',(req,res)=>res.json(fila.find(f=>f.txid===req.params.txid)||{status:'NAO_ENCONTRADO'}));
app.get('/configurar-webhook', async (req,res)=>{ try{ const r=await efipay.pixConfigWebhook({chave:process.env.EFI_PIX_KEY},{webhookUrl:'https://hotsport-pix-2.onrender.com/webhook'}); res.json(r);}catch(e){res.json(e)} });
setInterval(async()=>{ for(const f of fila.filter(f=>f.status==='ATIVA')){ try{ const det=await efipay.pixDetailCharge({txid:f.txid}); if(det.status==='CONCLUIDA'){ f.status='CONCLUIDA'; f.expiraEm=getExp(f.tempoMin); salvar(); } }catch(e){} } },30000);
app.listen(process.env.PORT||3000, ()=>console.log('SLS v9.5 COMPLETO JA PAGUEI + VOUCHER PATH:'+certPath));
