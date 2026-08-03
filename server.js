const express = require('express');
const fs = require('fs');
const cors = require('cors');
const sdk = require('sdk-node-apis-efi');
const Efi = sdk.EfiPay || sdk.default || sdk;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let filaLiberacao = [];
let pixDB = {};
try{
  if(fs.existsSync('/tmp/fila.json')) filaLiberacao = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8'));
  if(fs.existsSync('/tmp/pix.json')) pixDB = JSON.parse(fs.readFileSync('/tmp/pix.json','utf8'));
}catch(e){}

function salvarFila(){
  try{
    fs.writeFileSync('/tmp/fila.json', JSON.stringify(filaLiberacao));
    fs.writeFileSync('/tmp/pix.json', JSON.stringify(pixDB));
  }catch(e){}
}

function getEfi(){
  const b64 = process.env.EFI_CERTIFICADO_BASE64 || process.env.EFI_CERT_BASE64;
  let cert = null;
  if(b64) cert = Buffer.from(b64, 'base64');
  return new Efi({
    sandbox: false,
    client_id: process.env.EFI_CLIENT_ID,
    client_secret: process.env.EFI_CLIENT_SECRET,
    certificate: cert
  });
}

app.all('/api/gerar-pix', async (req,res)=>{
  try{
    let {valor, ip, mac} = {...req.query,...req.body};
    valor = String(valor||"2.00");
    ip = ip || "10.5.50.199";
    mac = mac || "58:04:4F:54:64:7C";
    const efi = getEfi();
    const cob = await efi.pixCreateImmediateCharge([], {
      calendario:{expiracao:3600},
      valor:{original:valor},
      chave: process.env.EFI_CHAVE_PIX || process.env.EFI_PIX_KEY,
      solicitacaoPagador:"SLS WIFI"
    });
    const qr = await efi.pixGenerateQRCode({id:cob.loc.id});
    pixDB[cob.txid] = {ip, mac, valor, status:"ATIVA"};
    salvarFila();
    res.json({txid:cob.txid, pixCopiaECola:qr.qrcode, qrcode:qr.imagemQrcode});
  }catch(err){
    console.error(err);
    res.status(500).json({error:err.message});
  }
});

app.get('/api/status/:txid', async (req,res)=>{
  try{
    const txid = req.params.txid;
    const dados = pixDB[txid];
    if(!dados) return res.json({status:"NAO_ENCONTRADO"});
    const efi = getEfi();
    const c = await efi.pixDetailCharge({txid});
    if(c.status==="CONCLUIDA"){
      dados.status="CONCLUIDA";
      if(!filaLiberacao.find(f=>f.mac===dados.mac)){
        filaLiberacao.push({ip:dados.ip, mac:dados.mac, txid});
        salvarFila();
      }
      return res.json({status:"CONCLUIDA"});
    }
    res.json({status:c.status});
  }catch(e){ res.json({status:"ATIVA"}); }
});

app.get('/api/liberacoes', (req,res)=>{
  try{ if(fs.existsSync('/tmp/fila.json')) filaLiberacao=JSON.parse(fs.readFileSync('/tmp/fila.json','utf8')); }catch(e){}
  if(req.query.rsc!==undefined){
    if(filaLiberacao.length===0) return res.type('text/plain').send('/log info "SLS fila vazia"');
    let cmds = filaLiberacao.map(f=>`/ip hotspot user remove [find name="${f.mac}"]\n/ip hotspot user add name="${f.mac}" password="${f.mac}" profile=default`).join('\n');
    return res.type('text/plain').send(cmds);
  }
  res.json({fila:filaLiberacao});
});

app.get('/api/liberacoes/clear',(req,res)=>{ filaLiberacao=[]; salvarFila(); res.send('/log info "limpa"'); });
app.get('/api/forcar/:ip/:mac',(req,res)=>{ filaLiberacao.push({ip:req.params.ip, mac:req.params.mac}); salvarFila(); res.json({ok:true}); });

app.listen(process.env.PORT||10000, ()=>console.log("SLS FINAL OK"));
