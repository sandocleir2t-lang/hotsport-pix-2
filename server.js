const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(cors());
app.use(express.json());
const CERT_PATH = '/tmp/hotspot-producao.p12';
const FILA_PATH = '/tmp/fila.json'; // <--- CORREÇÃO AQUI

function garanteCertificado(){
  try{
    const b64=process.env.EFI_CERTIFICADO_BASE64;
    if(!b64){console.log('SEM CERT');return;}
    fs.writeFileSync(CERT_PATH,Buffer.from(b64.replace(/\s/g,''),'base64'));
    console.log('CERT OK');
  }catch(e){console.log('ERRO CERT',e.message);}
}
garanteCertificado();
const efiOptions={sandbox:false,client_id:process.env.EFI_CLIENT_ID,client_secret:process.env.EFI_CLIENT_SECRET,certificate:CERT_PATH,certificado:CERT_PATH,pixCert:CERT_PATH};

let fila=[];
try{
  if(fs.existsSync(FILA_PATH)){
    fila = JSON.parse(fs.readFileSync(FILA_PATH,'utf8'));
    console.log('FILA CARREGADA', fila.length);
  }
}catch(e){ console.log('FILA VAZIA', e.message); fila=[]; }
function salvarFila(){ 
  try{ 
    fs.writeFileSync(FILA_PATH, JSON.stringify(fila)); 
    console.log('FILA SALVA', fila.length);
  }catch(e){ console.log('ERRO SALVAR FILA', e.message); } 
}

app.get('/',(req,res)=>{ res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SLS WIFI EVENTOS</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial}body{background:#0f0f12;display:flex;justify-content:center;color:#fff}.box{width:100%;max-width:400px;background:#16161a;min-height:100vh;padding:14px}.top{display:flex;align-items:center;justify-content:center;gap:6px;color:#555;font-size:11px;margin-top:8px}.dot{width:8px;height:8px;background:#00e676;border-radius:50%}.logo{display:flex;align-items:center;gap:10px;justify-content:center;margin-top:10px}.logo i{width:38px;height:38px;background:linear-gradient(135deg,#ff8a00,#ffb700);border-radius:10px;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:20px}.logo b{font-size:30px;font-weight:900}.sub{color:#555;text-align:center;font-size:13px;margin-top:6px}.aviso{background:#FFEB3B;color:#000;text-align:center;padding:12px;border-radius:12px;font-weight:900;font-size:12px;margin:16px 0}.head{display:flex;justify-content:space-between;align-items:flex-start;margin:16px 2px}.head b{font-size:17px;line-height:1.1}.badge{background:#26263a;color:#9d9de0;font-size:10px;padding:8px 12px;border-radius:20px}.card{position:relative;border:1.8px solid #2a2a32;background:#222228;border-radius:16px;padding:14px;margin:12px 0;display:flex;justify-content:space-between;align-items:center}.card.ativo{border-color:#FFEB3B;box-shadow:0 0 0 1px #FFEB3B}.tagMais{position:absolute;top:-10px;right:16px;background:#8b5cf6;color:#fff;font-size:9px;font-weight:900;padding:5px 12px;border-radius:20px}.left{display:flex;align-items:center;gap:10px}.ic{width:28px;height:28px;background:#2a2a32;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px}.tit{font-size:15px;font-weight:900;line-height:1.1}.price{text-align:right;min-width:60px}.price b{font-size:20px}.price small{font-size:10px;color:#666;display:block}.btn{width:100%;background:#FFEB3B;color:#000;border:0;padding:18px;border-radius:14px;font-weight:900;font-size:15px;margin-top:10px}.voucher{margin-top:18px}.voucher p{text-align:center;color:#444;font-size:12px;margin-bottom:8px}.voucher input{width:100%;background:#222228;border:1px solid #2f2f38;color:#fff;padding:15px;border-radius:12px;margin:6px 0;font-size:14px}.btnV{width:100%;background:#2e2e4a;color:#8b8bff;border:0;padding:15px;border-radius:12px;font-weight:800;font-size:13px;margin-top:6px}#pixArea{display:none;background:#fff;color:#000;border-radius:18px;padding:16px;margin-top:14px;text-align:center}#pixArea img{width:240px;height:240px;border-radius:12px}#pixArea textarea{width:100%;height:70px;font-size:10px;margin-top:10px;border:1px solid #ddd;border-radius:8px;padding:8px}</style></head><body><div class="box"><div class="top"><div class="dot"></div>ONLINE - 247 CLIENTES CONECTADOS</div><div class="logo"><i>📊</i><b>SLS<span>WIFI</span></b></div><div class="sub">Internet rápida - Pagamento instantâneo via PIX</div><div class="aviso">NAO FECHE ESTA TELA ATE PAGAR!</div><div class="head"><div><b>ESCOLHA SEU<br>PLANO</b></div><div class="badge">⚡ Ativação imediata</div></div><div class="card ativo" id="c1" onclick="sel('c1','3.00',60)"><div class="left"><div class="ic">🕐</div><div><div class="tit">1 HORA - 5</div><div style="font-weight:900">MEGA</div><div style="font-size:11px;color:#666">Ideal para uso rápido</div></div></div><div class="price"><b>R$ 3</b><small>1h de acesso</small></div></div><div class="card" id="c2" onclick="sel('c2','5.00',120)"><div class="tagMais">MAIS VENDIDO</div><div class="left"><div class="ic">🕐</div><div><div class="tit">2 HORAS - 10</div><div style="font-weight:900">MEGA</div><div style="font-size:11px;color:#666">Mais vendido - 10 Mega</div></div></div><div class="price"><b>R$ 5</b><small>2h de acesso</small></div></div><div class="card" id="c3" onclick="sel('c3','12.00',480)"><div class="left"><div class="ic">📅</div><div><div class="tit">EVENTO TODO -</div><div style="font-weight:900">15 MEGA</div><div style="font-size:11px;color:#666">Ultra rápida o dia todo</div></div></div><div class="price"><b>R$<br>12</b><small>8h de acesso</small></div></div><button class="btn" id="btnGerar" onclick="gerar()">GERAR PIX - PAGAR<br>AGORA</button><div id="pixArea"></div><div class="voucher"><p>TEM VOUCHER?</p><input id="vcod" placeholder="CODIGO VOUCHER"><input id="vsen" placeholder="SENHA" type="password"><button class="btnV">ENTRAR COM VOUCHER</button></div></div><script>var plano={valor:'3.00',tempo:60};function sel(id,v,t){document.querySelectorAll('.card').forEach(function(c){c.classList.remove('ativo')});document.getElementById(id).classList.add('ativo');plano={valor:v,tempo:t};}async function gerar(){var area=document.getElementById('pixArea');var btn=document.getElementById('btnGerar');area.style.display='block';btn.innerHTML='GERANDO...';area.innerHTML='Gerando PIX R$ '+plano.valor+' ...';try{var r=await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:plano.valor,tempo:plano.tempo})});var j=await r.json();if(j.erro) throw new Error(j.erro);area.innerHTML='<div style=color:#00a650;font-weight:900>PIX R$ '+plano.valor+' GERADO</div><img src="'+j.imagemQrcode+'"><br><textarea id=cp>'+j.copia_e_cola+'</textarea><br><button onclick=navigator.clipboard.writeText(document.getElementById("cp").value);alert("COPIADO") style="background:#00a650;color:#fff;width:100%;padding:12px;border:0;border-radius:10px;margin-top:8px;font-weight:900">COPIAR</button><div id=sMsg style=background:#FFEB3B;color:#000;padding:10px;border-radius:8px;margin-top:10px;font-weight:900>Aguardando pagamento...</div>';btn.innerHTML='PIX GERADO!';var tx=j.txid;var intervalo=setInterval(async function(){try{var s=await fetch('/status/'+tx);var js=await s.json();if(js.status==='CONCLUIDA'){clearInterval(intervalo);var m=document.getElementById('sMsg');if(m){m.innerHTML='<a href="#" onclick="liberar(\\''+tx+'\\');return false;" style="display:block;background:#00e676;color:#000;padding:15px;border-radius:10px;text-decoration:none;font-size:18px">✅ PAGO! CLIQUE PARA LIBERAR</a>';}} }catch(e){}},4000);}catch(e){area.innerHTML='<div style=color:red>ERRO: '+e.message+'</div>';btn.innerHTML='TENTAR NOVAMENTE';}}async function liberar(txid){await fetch('/api/liberado/'+txid);await fetch('/liberado/'+txid);document.getElementById('pixArea').innerHTML='<h1 style=color:#00a650>✅ LIBERADO!</h1><p style=margin-top:10px;color:#000>Volte para o WiFi e navegue!</p><a href="http://10.5.50.1/login" style="display:block;background:#FFEB3B;color:#000;padding:18px;border-radius:12px;margin-top:15px;font-weight:900;text-decoration:none">ENTRAR NA INTERNET</a>';}</script></body></html>`);});
app.post('/criar-pix',async(req,res)=>{
  try{
    console.log('CRIAR-PIX', req.body);
    if(!fs.existsSync(CERT_PATH)) garanteCertificado();
    const efipay=new EfiPay(efiOptions);
    const body={calendario:{expiracao:3600},valor:{original:req.body.valor.toString()},chave:process.env.EFI_CHAVE_PIX};
    const cob=await efipay.pixCreateImmediateCharge([],body);
    const qrcode=await efipay.pixGenerateQRCode({id:cob.loc.id});
    fila.push({txid:cob.txid,tempo:req.body.tempo,valor:req.body.valor,status:'AGUARDANDO'});
    salvarFila();
    console.log('PIX CRIADO', cob.txid);
    res.json({txid:cob.txid,imagemQrcode:qrcode.imagemQrcode,copia_e_cola:qrcode.qrcode});
  }catch(err){ console.log('ERRO PIX',err.message, err.stack); res.status(500).json({erro:err.message}); }
});
app.get('/status/:txid',async(req,res)=>{
  try{
    console.log('STATUS CHECK', req.params.txid);
    const efipay=new EfiPay(efiOptions);
    const c=await efipay.pixDetailCharge({txid:req.params.txid});
    console.log('STATUS RESULT', c.status);
    if(c.status==='CONCLUIDA'){
      let it=fila.find(f=>f.txid===req.params.txid);
      if(it){ it.status='PAGO_LIBERAR'; } else { fila.push({txid:req.params.txid, status:'PAGO_LIBERAR', valor: c.valor?.original || '3.00', tempo: 60}); }
      salvarFila();
      console.log("PAGO SALVO:", req.params.txid);
    }
    res.json(c);
  }catch(e){ console.log('ERRO STATUS', e.message); res.status(500).json({erro:e.message}); }
});
app.get('/fila',(req,res)=>{ console.log('GET FILA', fila.length); res.json(fila); });
app.get('/api/liberacoes',(req,res)=>{ console.log('GET LIBERACOES', fila.length); res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')); });
app.get('/liberado/:txid',(req,res)=>{ fila=fila.filter(f=>f.txid!==req.params.txid); salvarFila(); console.log('LIBERADO', req.params.txid); res.json({ok:true}); });
app.get('/api/liberado/:txid',(req,res)=>{ fila=fila.filter(f=>f.txid!==req.params.txid); salvarFila(); console.log('API LIBERADO', req.params.txid); res.json({ok:true}); });
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('SLS v12.1 /tmp PERSISTENTE OK PORT',PORT));
