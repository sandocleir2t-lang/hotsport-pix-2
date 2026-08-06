const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(cors());
app.use(express.json());
const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado(){try{const b=process.env.EFI_CERTIFICADO_BASE64;if(!b)return;fs.writeFileSync(CERT_PATH,Buffer.from(b.replace(/\s/g,''),'base64'));}catch(e){}}
garanteCertificado();
const efiOptions={sandbox:false,client_id:process.env.EFI_CLIENT_ID,client_secret:process.env.EFI_CLIENT_SECRET,certificate:CERT_PATH,certificado:CERT_PATH,pixCert:CERT_PATH};
let fila=[];
app.get('/',(req,res)=>{
res.send(`
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SLS WIFI</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Arial, sans-serif}
body{background:#0a0a0a;display:flex;justify-content:center}
.box{width:100%;max-width:390px;background:#111113;padding:12px 14px 20px}
.top{color:#00e676;font-size:9px;display:flex;gap:6px;align-items:center;margin-bottom:8px;letter-spacing:.5px}
.dot{width:7px;height:7px;background:#00e676;border-radius:50%;box-shadow:0 0 6px #00e676}
.logo{display:flex;align-items:center;gap:8px;color:#fff;font-weight:900;font-size:22px}
.logo i{background:linear-gradient(#ffb300,#ff6a00);padding:4px 6px;border-radius:6px;font-style:normal;font-size:14px}
.sub{color:#777;font-size:10px;margin-top:2px}
.aviso{background:#ffeb3b;color:#000;text-align:center;padding:10px;border-radius:20px;font-weight:900;font-size:11px;margin:12px 0}
.head{display:flex;justify-content:space-between;align-items:center;margin:12px 2px}
.head b{color:#fff;font-size:13px}
.badge{background:#1e1e3a;color:#8b8bff;font-size:8px;padding:4px 8px;border-radius:10px;border:1px solid #2a2a5a}
.card{position:relative;background:#1c1c1e;border:2px solid #2a2a2e;border-radius:16px;padding:12px 14px;margin:10px 0;display:flex;justify-content:space-between;align-items:center;color:#fff;cursor:pointer}
.card.ativo{border-color:#ffeb3b;background:#232326}
.radio{width:18px;height:18px;border:2px solid #555;border-radius:50%;display:flex;align-items:center;justify-content:center}
.ativo .radio{border-color:#ffeb3b}
.ativo .radio:after{content:'';width:8px;height:8px;background:#ffeb3b;border-radius:50%;display:block}
.left{display:flex;gap:10px;align-items:center}
.tit{font-size:13px;font-weight:800;line-height:1.1}
.subt{font-size:10px;color:#777;margin-top:2px}
.price{text-align:right}
.price b{font-size:16px;display:block}
.price small{font-size:9px;color:#888}
.tagMais{position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#a93aff;color:#fff;font-size:8px;font-weight:900;padding:3px 10px;border-radius:10px;letter-spacing:.5px}
.btnYellow{background:#ffeb3b;color:#000;width:100%;border:0;border-radius:14px;padding:16px;font-weight:900;font-size:13px;margin:14px 0;cursor:pointer}
.voucher{margin-top:10px;text-align:center}
.voucher p{color:#555;font-size:10px;margin-bottom:8px}
.voucher input{width:100%;background:#1c1c1e;border:1px solid #2a2a2e;color:#fff;padding:13px;border-radius:10px;margin:5px 0;font-size:12px}
.btnVoucher{background:#2a2a4a;color:#fff;border:0;width:100%;padding:13px;border-radius:10px;font-weight:800;margin-top:6px;font-size:11px}
#pixArea{display:none;background:#fff;border-radius:16px;padding:14px;color:#000;text-align:center;margin-top:10px}
</style></head><body><div class="box">
<div class="top"><div class="dot"></div>ONLINE - 247 CLIENTES CONECTADOS</div>
<div class="logo"><i>📶</i>SLSWIFI</div><div class="sub">Internet rapida • Pagamento instantaneo via PIX</div>
<div class="aviso">NAO FECHE ESTA TELA ATE PAGAR!</div>
<div class="head"><b>ESCOLHA SEU PLANO</b><span class="badge">⚡ Ativacao imediata</span></div>

<div class="card ativo" id="c1" onclick="sel('c1','3.00',60)">
<div class="left"><div class="radio"></div><div><div class="tit">1 HORA - 5 MEGA</div><div class="subt">Ideal para uso rapido</div></div></div>
<div class="price"><b>R$ 3</b><small>1h de acesso</small></div>
</div>

<div class="card" id="c2" onclick="sel('c2','5.00',120)">
<div class="tagMais">MAIS VENDIDO</div>
<div class="left"><div class="radio"></div><div><div class="tit">2 HORAS - 10 MEGA</div><div class="subt">Mais vendido - 10 Mega</div></div></div>
<div class="price"><b>R$ 5</b><small>2h de acesso</small></div>
</div>

<div class="card" id="c3" onclick="sel('c3','12.00',480)">
<div class="left"><div class="radio"></div><div><div class="tit">📅 EVENTO TODO -<br>15 MEGA</div><div class="subt">Ultra rapida o dia todo</div></div></div>
<div class="price"><b>R$<br>12</b><small>8h de acesso</small></div>
</div>

<button class="btnYellow" onclick="gerar()">GERAR PIX - PAGAR AGORA</button>
<div id="pixArea"></div>

<div class="voucher"><p>TEM VOUCHER?</p><input placeholder="CODIGO VOUCHER"><input placeholder="SENHA" type="password"><button class="btnVoucher">ENTRAR COM VOUCHER</button></div>
</div>
<script>
var plano={valor:'3.00',tempo:60};
function sel(id,v,t){var all=document.querySelectorAll('.card');for(var i=0;i<all.length;i++){all[i].classList.remove('ativo')}document.getElementById(id).classList.add('ativo');plano={valor:v,tempo:t};}
async function gerar(){
 var area=document.getElementById('pixArea');area.style.display='block';area.innerHTML='Gerando PIX R$ '+plano.valor+'...';
 try{
  var r=await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:plano.valor,tempo:plano.tempo})});
  var j=await r.json();
  if(!j.copia_e_cola) throw new Error(JSON.stringify(j));
  area.innerHTML='<div style=color:#00c853;font-weight:900>PIX REAL R$ '+plano.valor+' GERADO</div><img src='+j.imagemQrcode+' style=width:250px;margin:10px 0;border-radius:10px><textarea id=codePix style=width:100%;height:80px;font-size:10px>'+j.copia_e_cola+'</textarea><button onclick="copiar()" style=background:#00c853;color:#fff;width:100%;padding:12px;border:0;border-radius:10px;font-weight:900;margin-top:8px">COPIAR CODIGO PIX</button><div id=sMsg style=background:#ffeb3b;padding:8px;border-radius:8px;margin-top:8px;font-size:12px;font-weight:bold">Aguardando pagamento...</div>';
  var txid=j.txid;setInterval(async function(){try{var s=await fetch('/status/'+txid);var js=await s.json();if(js.status==='CONCLUIDA'){document.getElementById('sMsg').innerHTML='PAGO! LIBERADO!';document.getElementById('sMsg').style.background='#00c853';document.getElementById('sMsg').style.color='#fff';}}catch(e){}},4000);
 }catch(e){area.innerHTML='ERRO: '+e.message;}
}
function copiar(){var el=document.getElementById('codePix');el.select();navigator.clipboard.writeText(el.value);alert('PIX COPIADO!');}
</script></body></html>
`);
});
app.post('/criar-pix',async(req,res)=>{try{if(!fs.existsSync(CERT_PATH))garanteCertificado();const efipay=new EfiPay(efiOptions);const body={calendario:{expiracao:3600},valor:{original:req.body.valor.toString()},chave:process.env.EFI_CHAVE_PIX};const cob=await efipay.pixCreateImmediateCharge([],body);const qrcode=await efipay.pixGenerateQRCode({id:cob.loc.id});fila.push({txid:cob.txid,tempo:req.body.tempo,valor:req.body.valor,status:'AGUARDANDO'});res.json({txid:cob.txid,imagemQrcode:qrcode.imagemQrcode,copia_e_cola:qrcode.qrcode});}catch(err){res.status(500).json({erro:err.message});}});
app.get('/status/:txid',async(req,res)=>{try{const efipay=new EfiPay(efiOptions);const c=await efipay.pixDetailCharge({txid:req.params.txid});if(c.status==='CONCLUIDA'){let i=fila.find(f=>f.txid===req.params.txid);if(i)i.status='PAGO_LIBERAR';}res.json(c);}catch(e){res.status(500).json({erro:e.message})}});
app.get('/fila',(req,res)=>{res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));});
app.get('/api/liberacoes',(req,res)=>{res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));});
app.get('/liberado/:txid',(req,res)=>{fila=fila.filter(f=>f.txid!==req.params.txid);res.json({ok:true});});
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('SLS WIFI IGUAL FOTO ONLINE',PORT));
