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
res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SLS WIFI</title>
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial}body{background:#080812;display:flex;justify-content:center;color:#fff}.box{width:100%;max-width:390px;padding:14px}.top{color:#00e676;font-size:9px;display:flex;gap:6px}.dot{width:6px;height:6px;background:#00e676;border-radius:50%}.logo{font-size:28px;font-weight:900;margin-top:8px}.logo span{color:#a78bfa}.sub{color:#777;font-size:12px;margin:4px 0 12px}.aviso{background:#FFEB3B;color:#000;text-align:center;padding:10px;border-radius:12px;font-weight:900;font-size:11px;margin:10px 0}.head{display:flex;justify-content:space-between;margin:10px 0}.badge{background:#1a1a2e;color:#a78bfa;font-size:9px;padding:5px 10px;border-radius:20px}.card{border:1.5px solid #1e1e2a;background:#12121f;border-radius:16px;padding:14px;margin:8px 0;display:flex;justify-content:space-between;cursor:pointer}.card.ativo{border-color:#a78bfa;background:#1c1c2a}.price b{font-size:18px}.btn{background:#FFEB3B;color:#000;width:100%;border:0;padding:15px;border-radius:14px;font-weight:900;margin:12px 0}#pixArea{display:none;background:#fff;color:#000;border-radius:16px;padding:14px;text-align:center;margin-top:10px}</style></head><body><div class="box">
<div class="top"><div class="dot"></div>ONLINE • 247 CLIENTES CONECTADOS</div>
<div class="logo">SLS <span>WIFI</span></div><div class="sub">Internet rápida • Pagamento instantâneo via PIX</div>
<div class="aviso">NAO FECHE ESTA TELA ATE PAGAR!</div>
<div class="head"><b style="font-size:11px">ESCOLHA SEU PLANO</b><span class="badge">⚡ Ativação imediata</span></div>
<div class="card ativo" id="c1" onclick="sel('c1','3.00',60)"><div><b>1 HORA • 5 MEGA</b><br><small style="color:#777">Ideal uso rápido - 1h</small></div><b>R$ 3</b></div>
<div class="card" id="c2" onclick="sel('c2','5.00',180)"><div><b>3 HORAS • 10 MEGA</b> <span style="background:#a78bfa;color:#fff;font-size:8px;padding:2px 6px;border-radius:6px">MAIS VENDIDO</span><br><small style="color:#777">3h de acesso</small></div><b>R$ 5</b></div>
<div class="card" id="c3" onclick="sel('c3','10.00',1440)"><div><b>24 HORAS • 15 MEGA</b><br><small style="color:#777">Conexão o dia todo</small></div><b>R$ 10</b></div>
<button class="btn" onclick="gerar()">GERAR PIX - PAGAR AGORA</button>
<div id="pixArea"></div>
<div id="msg" style="text-align:center;margin-top:10px;font-size:11px;color:#a78bfa"></div>
</div><script>
var plano={valor:'3.00',tempo:60};
function sel(id,v,t){document.querySelectorAll('.card').forEach(c=>c.classList.remove('ativo'));document.getElementById(id).classList.add('ativo');plano={valor:v,tempo:t};}
async function gerar(){var a=document.getElementById('pixArea');a.style.display='block';a.innerHTML='Gerando PIX R$ '+plano.valor+'... Aguarde 0,001s';try{var r=await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:plano.valor,tempo:plano.tempo})});var j=await r.json();if(j.erro) throw new Error(j.erro);a.innerHTML='<b style=color:#00c853>PIX R$ '+plano.valor+' GERADO - VALIDO</b><br><img src='+j.imagemQrcode+' style=width:230px;margin:10px 0><br><textarea id=cp style=width:100%;height:70px;font-size:10px>'+j.copia_e_cola+'</textarea><br><button onclick="navigator.clipboard.writeText(document.getElementById(\\'cp\\').value);alert(\\'COPIADO\\')" style=background:#00c853;color:#fff;width:100%;padding:10px;border:0;border-radius:8px;margin-top:6px>COPIAR CODIGO</button><div id=sMsg style=background:#FFEB3B;color:#000;padding:8px;border-radius:8px;margin-top:8px;font-size:11px;font-weight:bold">Aguardando pagamento...</div>';var tx=j.txid;setInterval(async()=>{try{var s=await fetch('/status/'+tx);var js=await s.json();if(js.status==='CONCLUIDA'){document.getElementById('sMsg').innerHTML='✅ PAGO! LIBERADO!';}}catch(e){}},4000);}catch(e){a.innerHTML='ERRO QR: '+e.message+'<br>Verifique EFI_CERTIFICADO_BASE64 no Render';}}
</script></body></html>`);
});
app.post('/criar-pix',async(req,res)=>{try{if(!fs.existsSync(CERT_PATH))garanteCertificado();const efipay=new EfiPay(efiOptions);const body={calendario:{expiracao:3600},valor:{original:req.body.valor.toString()},chave:process.env.EFI_CHAVE_PIX};const cob=await efipay.pixCreateImmediateCharge([],body);const qrcode=await efipay.pixGenerateQRCode({id:cob.loc.id});fila.push({txid:cob.txid,tempo:req.body.tempo,valor:req.body.valor,status:'AGUARDANDO'});res.json({txid:cob.txid,imagemQrcode:qrcode.imagemQrcode,copia_e_cola:qrcode.qrcode});}catch(err){console.log('ERRO CRIAR',err.message);res.status(500).json({erro:err.message});}});
app.get('/status/:txid',async(req,res)=>{try{const efipay=new EfiPay(efiOptions);const c=await efipay.pixDetailCharge({txid:req.params.txid});if(c.status==='CONCLUIDA'){let i=fila.find(f=>f.txid===req.params.txid);if(i)i.status='PAGO_LIBERAR';}res.json(c);}catch(e){res.status(500).json({erro:e.message})}});
app.get('/fila',(req,res)=>{res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));});
app.get('/api/liberacoes',(req,res)=>{res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));});
app.get('/liberado/:txid',(req,res)=>{fila=fila.filter(f=>f.txid!==req.params.txid);res.json({ok:true});});
const PORT=process.env.PORT||3000;app.listen(PORT,()=>console.log('SLS SEM CDN ONLINE',PORT));
