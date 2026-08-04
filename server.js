const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado(){
  try{
    const b=process.env.EFI_CERTIFICADO_BASE64;
    if(!b) return;
    if(fs.existsSync(CERT_PATH)) return;
    fs.writeFileSync(CERT_PATH, Buffer.from(b,'base64'));
  }catch(e){ console.log("Erro cert", e) }
}
garanteCertificado();

const efiOptions={
  sandbox:false,
  client_id:process.env.EFI_CLIENT_ID,
  client_secret:process.env.EFI_CLIENT_SECRET,
  certificate:CERT_PATH
};

// FILA PERSISTENTE
let fila = [];
try{
  if(fs.existsSync('/tmp/fila.json')){
    fila = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8'));
  }
}catch(e){ fila=[] }
function salvaFila(){
  try{ fs.writeFileSync('/tmp/fila.json', JSON.stringify(fila)); }catch(e){}
}

app.get('/',(req,res)=>{
  res.send(`<!DOCTYPE html><h1>Hotspot PIX OK</h1><p>Fila: ${fila.length}</p>`);
});

app.post('/gerar',(req,res)=>{ gerar(req,res) });
app.post('/pix/gerar',(req,res)=>{ gerar(req,res) });

async function gerar(req,res){
  try{
    const {tempo, valor, mac, ip} = req.body;
    const efi = new EfiPay(efiOptions);
    const txid = Math.random().toString(36).substring(2,34);
    const params = { txid };
    const body = {
      calendario:{expiracao: 3600},
      devedor:{cpf:"00000000000", nome:"Cliente Hotspot"},
      valor:{original: String(valor||"3.00")},
      chave: process.env.EFI_CHAVE_PIX,
      infoAdicionais:[{nome:"tempo", valor: String(tempo||"60")}]
    };
    const cob = await efi.pixCreateImmediateCharge(params, body);
    const qrcode = await efi.pixGenerateQRCode({id: cob.loc.id});
    fila.push({txid, status:"AGUARDANDO", tempo: tempo||60, valor, qrcode: qrcode.qrcode, mac, ip, criadoEm: new Date()});
    salvaFila();
    res.json({txid, qrcode: qrcode.qrcode, imagem: qrcode.imagemQrcode});
  }catch(e){ console.log(e); res.status(500).json({erro:e.mensagem || e.message}) }
}    const cob = await efi.pixCreateImmediateCharge([], body);
    const qrcode = await efi.pixGenerateQRCode({id: cob.loc.id});
    
    fila.push({txid, status:"AGUARDANDO", tempo: tempo||60, qrcode: qrcode.qrcode, mac, ip, criadoEm: new Date()});
    salvaFila();
    console.log(`QR GERADO ${txid}`);
    res.json({txid, qrcode: qrcode.qrcode, imagem: qrcode.imagemQrcode});
  }catch(e){ console.log(e); res.status(500).json({erro:e.message}) }
}

app.get('/status/:txid',(req,res)=>{
  const item = fila.find(f=>f.txid===req.params.txid);
  res.json(item||{status:"NAO_ENCONTRADO"});
});

// WEBHOOK EFI -> VIRA PAGO_LIBERAR
app.post('/webhook', async (req,res)=>{
  try{
    const pix = req.body.pix || [];
    for(const p of pix){
      if(p.txid){
        let item = fila.find(f=>f.txid===p.txid);
        if(item){
          item.status='PAGO_LIBERAR';
          item.concluidoEm=new Date().toISOString();
          salvaFila();
          console.log(`STATUS ${p.txid} -> CONCLUIDA virou PAGO_LIBERAR`);
        }
      }
    }
  }catch(e){ console.log(e) }
  res.sendStatus(200);
});

// Verificação direta EFI (seu endpoint atual)
app.get('/verifica/:txid', async (req,res)=>{
  try{
    const efi = new EfiPay(efiOptions);
    const r = await efi.pixDetailCharge({txid:req.params.txid});
    console.log(`STATUS ${req.params.txid} -> ${r.status}`);
    if(r.status==='CONCLUIDA'){
      let item = fila.find(f=>f.txid===req.params.txid);
      if(item){
        item.status='PAGO_LIBERAR';
        salvaFila();
      }
    }
    res.json(r);
  }catch(e){ res.json({status:"AGUARDANDO"}) }
});

app.get('/fila',(req,res)=>{
  const paga = fila.filter(f=>f.status==='PAGO_LIBERAR');
  console.log(`Fila req ${paga.length}`);
  res.json(paga);
});

app.get('/confirma/:txid',(req,res)=>{
  fila = fila.filter(f=>f.txid!==req.params.txid);
  salvaFila();
  console.log(`CONFIRMADO ${req.params.txid}`);
  res.json({ok:true});
});

const PORT = process.env.PORT||3000;
app.listen(PORT, ()=>console.log("Rodando "+PORT));
