const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(cors());
app.use(express.json());
const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado(){try{const b=process.env.EFI_CERTIFICADO_BASE64;if(!b)return;const buf=Buffer.from(b.replace(/\s/g,''),'base64');fs.writeFileSync(CERT_PATH,buf);console.log('CERT OK',buf.length);}catch(e){console.log('ERRO CERT',e.message);}}
garanteCertificado();
const efiOptions={sandbox:false,client_id:process.env.EFI_CLIENT_ID,client_secret:process.env.EFI_CLIENT_SECRET,certificate:CERT_PATH,certificado:CERT_PATH,pixCert:CERT_PATH};
let fila=[];
app.get('/',(req,res)=>{
res.send(`<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>SLS WIFI</title>
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Arial, sans-serif}body{background:#0b1c3d;display:flex;justify-content:center;min-height:100vh}.container{width:100%;max-width:380px;background:#0e224a;padding:20px 15px;text-align:center}.logo{color:#fff;font-weight:900;font-size:26px;line-height:1}.logo span{font-size:12px;display:block;font-weight:400;color:#a0b4d0;letter-spacing:2px;margin-top:4px}.aviso{background:#ffeb3b;color:#000;padding:10px;border-radius:12px;font-size:12px;font-weight:bold;margin:15px 0}.plano{background:#1a335f;border:2px solid #2a4a85;border-radius:12px;padding:14px 15px;margin:10px 0;display:flex;justify-content:space-between;align-items:center;color:#fff;cursor:pointer;text-align:left}.plano.ativo{background:#ffeb3b;color:#000;border-color:#ffeb3b;font-weight:bold}.plano small{font-size:11px;opacity:0.9}.btn-gerar{background:#ffeb3b;color:#000;border:0;width:100%;padding:16px;border-radius:12px;font-size:16px;font-weight:900;margin:20px 0 10px;cursor:pointer}#pixArea{display:none;background:#fff;color:#000;border-radius:15px;padding:20px;margin-top:20px;text-align:center}.input{width:100%;padding:12px;border-radius:8px;border:1px solid #334a78;background:#0a1933;color:#fff;margin:6px 0}.btn-voucher{background:#1e3a6e;color:#fff;border:0;width:100%;padding:12px;border-radius:8px;font-weight:bold;margin-top:10px;cursor:pointer}.footer{color:#5a7198;font-size:10px;margin-top:20px}</style>
</head><body><div class="container">
<div class="logo">SLS WIFI<br><span>INTERNET RAPIDA AQUI</span></div>
<div class="aviso">NAO FECHE ESTA TELA ATE PAGAR!</div>
<div class="plano ativo" onclick="sel(this,'3.00',60)"><div><span>1 HORA - 5 MEGA</span><br><small>Internet rapida</small></div><b>R$ 3,00</b></div>
<div class="plano" onclick="sel(this,'5.00',120)"><div><span>2 HORAS - 10 MEGA</span><br><small>Mais velocidade</small></div><b>R$ 5,00</b></div>
<div class="plano" onclick="sel(this,'12.00',1440)"><div><span>EVENTO TODO - 15 MEGA</span><br><small>Ultra rapida o dia todo</small></div><b>R$ 12,00</b></div>
<button class="btn-gerar" onclick="gerar()">GERAR PIX - PAGAR AGORA</button>
<div id="pixArea"></div>
<div style="margin-top:20px"><span style="color:#fff;font-size:12px">TEM VOUCHER?</span><input class="input" placeholder="CODIGO VOUCHER"><input class="input" placeholder="SENHA" type="password"><button class="btn-voucher">ENTRAR COM VOUCHER</button></div>
<div class="footer">SLS WIFI v9 - 5/10/15 MEGA - R$3/5/12</div>
</div>
<script>
let plano={valor:'3.00',tempo:60};
function sel(el,v,t){document.querySelectorAll('.plano').forEach(p=>p.classList.remove('ativo'));el.classList.add('ativo');plano={valor:v,tempo:t};}
async function gerar(){
 const area=document.getElementById('pixArea');
 area.style.display='block';
 area.innerHTML='<h3>⏳ Gerando PIX Real R$ '+plano.valor+'...</h3><p>Aguarde 3s</p>';
 try{
  const r=await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente SLS',valor:plano.valor,tempo:plano.tempo})});
  const j=await r.json();
  if(j.imagem){
   area.innerHTML='<h3 style=color:#00c853;margin-bottom:10px>✅ PIX REAL R$ '+plano.valor+' GERADO</h3><img src='+j.imagem+' style=width:100%;max-width:280px;border:4px solid #ffeb3b;border-radius:12px><p style=margin:15px 0 5px;font-weight:bold;font-size:13px>COPIA E COLA:</p><textarea id=codePix style=width:100%;height:100px;font-size:10px;padding:10px;border:2px dashed #ffeb3b;background:#fffde7;border-radius:8px>'+j.copia_e_cola+'</textarea><button onclick="copiarPix()" style=background:#00c853;color:#fff;border:0;width:100%;padding:14px;border-radius:10px;font-weight:900;margin-top:10px;font-size:14px;cursor:pointer">📋 COPIAR CODIGO PIX</button><p id=statusMsg style=background:#ffeb3b;color:#000;padding:12px;border-radius:8px;margin-top:15px;font-weight:bold;font-size:13px">⏳ Aguardando pagamento...<br><small>Nao feche esta tela</small></p>';
   let txid=j.txid;
   let check=setInterval(async()=>{
    try{
     let s=await fetch('/status/'+txid);
     let js=await s.json();
     let msg=document.getElementById('statusMsg');
     if(!msg) return;
     if(js.status==='CONCLUIDA'){
      msg.innerHTML='✅ PAGO! Liberado em 15s!<br>Pode fechar e navegar!';
      msg.style.background='#00c853';msg.style.color='#fff';
      clearInterval(check);
     } else {
      msg.innerHTML='⏳ Aguardando pagamento...<br><small>Status: '+js.status+'</small>';
     }
    }catch(e){}
   },4000);
  }else{
   area.innerHTML='<p style=color:red>ERRO AO GERAR PIX:<br>'+JSON.stringify(j)+'</p>';
  }
 }catch(e){
  area.innerHTML='<p style=color:red>ERRO: '+e.message+'</p>';
 }
}
function copiarPix(){
 const el=document.getElementById('codePix');
 el.select();el.setSelectionRange(0,99999);
 navigator.clipboard.writeText(el.value).then(()=>{alert('✅ PIX COPIADO! Cola no seu banco agora!')}).catch(()=>{document.execCommand('copy');alert('✅ PIX COPIADO!')});
}
</script></body></html>`);
});
app.post('/criar-pix',async(req,res)=>{try{if(!fs.existsSync(CERT_PATH))garanteCertificado();const efipay=new EfiPay(efiOptions);const body={calendario:{expiracao:3600},valor:{original:req.body.valor.toString()},chave:process.env.EFI_CHAVE_PIX};const cob=await efipay.pixCreateImmediateCharge([],body);const qrcode=await efipay.pixGenerateQRCode({id:cob.loc.id});console.log('COB OK',cob.txid,'R$',req.body.valor,'Tempo',req.body.tempo,'QR OK');fila.push({txid:cob.txid,tempo:req.body.tempo,valor:req.body.valor,status:'AGUARDANDO',criado:new Date().toISOString()});res.json({txid:cob.txid,imagem:qrcode.imagemQrcode,copia_e_cola:qrcode.qrcode});}catch(err){console.log('ERRO CRIAR',err);res.status(500).json({erro:err.message});}});
app.get('/status/:txid',async(req,res)=>{try{const efipay=new EfiPay(efiOptions);const consulta=await efipay.pixDetailCharge({txid:req.params.txid});if(consulta.status==='CONCLUIDA'){let item=fila.find(f=>f.txid===req.params.txid);if(item)item.status='PAGO_LIBERAR';console.log('STATUS',req.params.txid,'->',consulta.status);}else{console.log('STATUS',req.params.txid,'->',consulta.status);}res.json(consulta);}catch(e){res.status(500).json({erro:e.message})}});
app.get('/fila',(req,res)=>{const count=fila.filter(f=>f.status==='PAGO_LIBERAR').length;if(count>0) console.log('Fila req',count);else console.log('Fila req',fila.filter(f=>f.status==='PAGO_LIBERAR').length);const pagos=fila.filter(f=>f.status==='PAGO_LIBERAR');res.json(pagos.length>0?pagos:[]);});
app.get('/api/liberacoes',(req,res)=>{const pagos=fila.filter(f=>f.status==='PAGO_LIBERAR');res.json(pagos);});
app.get('/liberado/:txid',(req,res)=>{fila=fila.filter(f=>f.txid!==req.params.txid);console.log('Liberado chamado',req.params.txid);res.json({ok:true,fila:fila.length});});
app.get('/limpa',(req,res)=>{fila=[];console.log('Fila limpa manualmente');res.json({ok:true});});
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('SLS WIFI v9 ONLINE R$3/5/12 - 5/10/15 MEGA PORT',PORT));
