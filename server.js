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

async function liberar(txid){
  await fetch('/api/liberado/'+txid);
  await fetch('/liberado/'+txid);
  // AUTO-LOGIN NO MIKROTIK
  var formData = new FormData();
  formData.append('username', txid);
  formData.append('password', txid);
  try{
    await fetch('http://10.5.50.1/login', {method:'POST', body: formData, mode:'no-cors'});
  }catch(e){}
  document.getElementById('pixArea').innerHTML='<h1 style=color:#00a650>✅ LIBERADO!</h1><p style=margin-top:10px;color:#000>Conectado! Se não entrar, clique:</p><a href="http://10.5.50.1/login?username='+txid+'&password='+txid+'" style="display:block;background:#FFEB3B;color:#000;padding:18px;border-radius:12px;margin-top:15px;font-weight:900;text-decoration:none">ENTRAR NA INTERNET</a>';
}app.post('/criar-pix',async(req,res)=>{
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
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.listen(PORT,()=>console.log('SLS v12.1 /tmp PERSISTENTE OK PORT',PORT));
