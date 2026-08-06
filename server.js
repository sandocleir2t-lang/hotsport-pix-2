const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(cors());
app.use(express.json());
const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado(){try{const b=process.env.EFI_CERTIFICADO_BASE64;if(!b)return;const buf=Buffer.from(b.replace(/\s/g,''),'base64');fs.writeFileSync(CERT_PATH,buf);}catch(e){}}
garanteCertificado();
const efiOptions={sandbox:false,client_id:process.env.EFI_CLIENT_ID,client_secret:process.env.EFI_CLIENT_SECRET,certificate:CERT_PATH,certificado:CERT_PATH,pixCert:CERT_PATH};
let fila=[];

app.get('/',(req,res)=>{
const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SLS WIFI</title>
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial}body{background:#0d0d0d;display:flex;justify-content:center} .container{width:100%;max-width:380px;background:#111;padding:16px} .online{color:#00e676;font-size:10px;display:flex;gap:6px;margin-bottom:12px} .dot{width:8px;height:8px;background:#00e676;border-radius:50%} .logo{font-size:28px;font-weight:900;color:#fff} .sub{color:#888;font-size:10px} .aviso{background:#ffeb3b;color:#000;text-align:center;padding:10px;border-radius:20px;font-weight:900;font-size:11px;margin:14px 0} .plano{background:#1e1e1e;border:2px solid #2a2a2a;border-radius:16px;padding:14px;display:flex;justify-content:space-between;margin:8px 0;color:#fff} .plano.ativo{border-color:#ffeb3b} .btn-gerar{background:#ffeb3b;color:#000;width:100%;padding:16px;border:0;border-radius:16px;font-weight:900;margin:14px 0} #pixArea{display:none;background:#fff;border-radius:16px;padding:16px;text-align:center;color:#000}</style>
</head><body><div class="container">
<div class="online"><div class="dot"></div>ONLINE - 247 CLIENTES</div>
<div class="logo">SLS WIFI<div class="sub">Internet rapida via PIX</div></div>
<div class="aviso">NAO FECHE ESTA TELA ATE PAGAR!</div>
<div class="plano ativo" id="p1" onclick="sel('p1','3.00',60)"><div>1 HORA - 5 MEGA<br><small>Ideal rapido</small></div><b>R$ 3</b></div>
<div class="plano" id="p2" onclick="sel('p2','5.00',120)"><div>2 HORAS - 10 MEGA<br><small>Mais vendido</small></div><b>R$ 5</b></div>
<div class="plano" id="p3" onclick="sel('p3','12.00',480)"><div>EVENTO TODO - 15 MEGA<br><small>Dia todo</small></div><b>R$ 12</b></div>
<button class="btn-gerar" onclick="gerar()">GERAR PIX - PAGAR AGORA</button>
<div id="pixArea"></div>
</div>
<script>
let plano={valor:'3.00',tempo:60};
function sel(id,v,t){document.querySelectorAll('.plano').forEach(function(p){p.classList.remove('ativo')});document.getElementById(id).classList.add('ativo');plano={valor:v,tempo:t};}
async function gerar(){
 var area=document.getElementById('pixArea');area.style.display='block';area.innerHTML='Gerando PIX R$ '+plano.valor+'...';
 try{
  var r=await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:plano.valor,tempo:plano.tempo})});
  var j=await r.json();
  if(!j.copia_e_cola) throw new Error(JSON.stringify(j));
  area.innerHTML='<div style=color:#00c853;font-weight:900>PIX REAL R$ '+plano.valor+' GERADO</div><img src='+j.imagemQrcode+' style=width:260px><textarea id=codePix style=width:100%;height:80px;font-size:10px;margin-top:10px>'+j.copia_e_cola+'</textarea><button onclick="copiar()" style=background:#00c853;color:#fff;width:100%;padding:12px;border:0;border-radius:10px;font-weight:900;margin-top:8px">COPIAR CODIGO PIX</button><div id=sMsg style=background:#ffeb3b;padding:10px;border-radius:8px;margin-top:10px;font-weight:bold;font-size:12px">Aguardando pagamento...</div>';
  var txid=j.txid;setInterval(async function(){try{var s=await fetch('/status/'+txid);var js=await s.json();if(js.status==='CONCLUIDA'){document.getElementById('sMsg').innerHTML='PAGO! LIBERADO!';}}catch(e){}},4000);
 }catch(e){area.innerHTML='ERRO: '+e.message;}
}
function copiar(){var el=document.getElementById('codePix');el.select();navigator.clipboard.writeText(el.value);alert('PIX COPIADO!');}
</script></body></html>
`;
res.send(html);
});

app.post('/criar-pix',async(req,res)=>{try{if(!fs.existsSync(CERT_PATH))garanteCertificado();const efipay=new EfiPay(efiOptions);const body={calendario:{expiracao:3600},valor:{original:req.body.valor.toString()},chave:process.env.EFI_CHAVE_PIX};const cob=await efipay.pixCreateImmediateCharge([],body);const qrcode=await efipay.pixGenerateQRCode({id:cob.loc.id});fila.push({txid:cob.txid,tempo:req.body.tempo,valor:req.body.valor,status:'AGUARDANDO'});res.json({txid:cob.txid,imagemQrcode:qrcode.imagemQrcode,copia_e_cola:qrcode.qrcode});}catch(err){res.status(500).json({erro:err.message});}});
app.get('/status/:txid',async(req,res)=>{try{const efipay=new EfiPay(efiOptions);const c=await efipay.pixDetailCharge({txid:req.params.txid});if(c.status==='CONCLUIDA'){let i=fila.find(f=>f.txid===req.params.txid);if(i)i.status='PAGO_LIBERAR';}res.json(c);}catch(e){res.status(500).json({erro:e.message})}});
app.get('/fila',(req,res)=>{res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));});
app.get('/api/liberacoes',(req,res)=>{res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));});
app.get('/liberado/:txid',(req,res)=>{fila=fila.filter(f=>f.txid!==req.params.txid);res.json({ok:true});});
app.get('/limpa',(req,res)=>{fila=[];res.json({ok:true});});
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('SLS WIFI ONLINE PORT',PORT));
