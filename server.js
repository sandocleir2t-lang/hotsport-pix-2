// v9.7 SLS WIFI - UMA TELA SO - IGUAL PRINT EXEMPLO
const express = require('express');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(express.json()); app.use(express.urlencoded({extended:true}));

const PLANOS = {
  "1H": { valor: 3.00, tempo: 60, vel: "5 MEGA", nome: "1 HORA - 5 MEGA", desc: "Internet rapida" },
  "2H": { valor: 5.00, tempo: 120, vel: "10 MEGA", nome: "2 HORAS - 10 MEGA", desc: "Mais velocidade" },
  "EVENTO": { valor: 12.00, tempo: 1440, vel: "15 MEGA", nome: "EVENTO TODO - 15 MEGA", desc: "Ultra rapida o dia todo" }
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
*{box-sizing:border-box}body{background:#0f2040;margin:0;padding:14px;font-family:Arial,Helvetica,sans-serif;color:#fff}
.header{text-align:center;margin-bottom:14px}.header h1{margin:0;font-size:32px;letter-spacing:1px}.header p{margin:2px 0 0 0;color:#8da0c0;font-size:14px;letter-spacing:2px}
.alerta{background:#ffeb3b;color:#000;text-align:center;padding:10px;border-radius:12px;font-weight:800;font-size:14px;margin-bottom:14px}
.plano{background:#19305e;border:1.5px solid #2a4a80;border-radius:14px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer}
.plano.ativo{background:#ffeb3b;border-color:#ffeb3b;color:#000}
.plano.ativo .desc{color:#333}
.nome{font-weight:800;font-size:17px}.desc{font-size:12px;color:#8da0c0;margin-top:2px}.preco{font-weight:800;font-size:18px}
.btn-amarelo{width:100%;background:#ffeb3b;color:#000;border:none;padding:16px;border-radius:12px;font-weight:900;font-size:17px;margin-top:12px;cursor:pointer}
.qrbox{display:none;background:#fff;border-radius:14px;padding:14px;margin-top:14px;text-align:center;color:#000}.qrbox img{width:260px;max-width:100%}
.input{width:100%;background:#0f1c36;border:1.5px solid #2a4a80;color:#fff;padding:14px;border-radius:12px;margin-top:10px}
.btn-voucher{width:100%;background:#203a6b;color:#fff;border:none;padding:14px;border-radius:12px;font-weight:800;margin-top:10px;cursor:pointer}
.small{color:#6b7fa3;font-size:11px;text-align:center;margin-top:12px}
</style></head><body>

<div class="header"><h1>SLS WIFI</h1><p>INTERNET RAPIDA AQUI</p></div>

<div class="alerta">NAO FECHE ESTA TELA ATE PAGAR!</div>

<div id="p1" class="plano ativo" onclick="sel('1H')"><div><div class="nome">1 HORA - 5 MEGA</div><div class="desc">Internet rapida</div></div><div class="preco">R$ 3,00</div></div>
<div id="p2" class="plano" onclick="sel('2H')"><div><div class="nome">2 HORAS - 10 MEGA</div><div class="desc">Mais velocidade</div></div><div class="preco">R$ 5,00</div></div>
<div id="p3" class="plano" onclick="sel('EVENTO')"><div><div class="nome">EVENTO TODO - 15 MEGA</div><div class="desc">Ultra rapida o dia todo</div></div><div class="preco">R$ 12,00</div></div>

<button class="btn-amarelo" id="btnGerar" onclick="gerarPix()">GERAR PIX - PAGAR AGORA</button>

<div id="qrBox" class="qrbox">
<div style="font-weight:800;margin-bottom:8px">ESCANEIE O PIX - <span id="planoNomeQr"></span></div>
<img id="qrImg" src=""><div id="qrCodeTxt" style="font-size:10px;word-break:break-all;margin-top:8px"></div>
<div id="statusPix" style="margin-top:10px;font-weight:800;color:#0a0">Aguardando pagamento...</div>
</div>

<div style="margin-top:20px;text-align:center;font-size:14px">TEM VOUCHER?</div>
<form action="http://10.5.50.1/login" method="post">
<input type="hidden" name="dst" value="https://www.google.com">
<input class="input" name="username" placeholder="CODIGO VOUCHER">
<input class="input" type="password" name="password" placeholder="SENHA">
<button class="btn-voucher" type="submit">ENTRAR COM VOUCHER</button>
</form>

<div class="small">SLS WIFI v9 - 5/10/15 MEGA - R$3/5/12</div>

<script>
let planoSel='1H';
function sel(p){ planoSel=p; document.querySelectorAll('.plano').forEach(e=>e.classList.remove('ativo')); document.getElementById(p=='1H'?'p1':p=='2H'?'p2':'p3').classList.add('ativo'); }
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
  btn.innerHTML='PIX GERADO - AGUARDANDO PAGAMENTO';
  // polling
  let tx=d.txid;
  let interval=setInterval(async()=>{
   let rs=await fetch('/status/'+tx); let js=await rs.json();
   if(js.status=='CONCLUIDA'){ clearInterval(interval); document.getElementById('statusPix').innerHTML='✅ PAGO! LIBERANDO...'; setTimeout(()=>{ window.location.href='http://10.5.50.1'; },1200); }
  },3000);
 }catch(e){ alert('Erro ao gerar PIX: '+e.message); btn.innerHTML='GERAR PIX - PAGAR AGORA'; btn.disabled=false; }
}
</script>
</body></html>`);
});

app.get('/api/gerar', async (req,res)=>{
  const {plano,mac,ip}=req.query;
  const p = PLANOS[plano] || PLANOS["1H"];
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
app.listen(process.env.PORT||3000, ()=>console.log('SLS v9.7 UMA TELA SO IGUAL PRINT PATH:'+certPath));
