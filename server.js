const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));

let filaLiberacao = [];
let pagamentos = {};
let efiInstance = null;

// CARREGA FILA DO DISCO (se já existir)
try{
  if(fs.existsSync('/tmp/fila.json')) filaLiberacao = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8'));
  if(fs.existsSync('/tmp/pags.json')) pagamentos = JSON.parse(fs.readFileSync('/tmp/pags.json','utf8'));
}catch(e){}
function salvarFila(){
  try{ fs.writeFileSync('/tmp/fila.json', JSON.stringify(filaLiberacao)); fs.writeFileSync('/tmp/pags.json', JSON.stringify(pagamentos)); }catch(e){}
}

function getEfiInstance(){
  if(efiInstance) return efiInstance;
  const mod = require('sdk-node-apis-efi');
  const EfiPay = mod.EfiPay || mod.default || mod;
  let certPath;
  const base64 = process.env.EFI_CERTIFICADO_BASE64 || process.env.EFI_CERT_BASE64;
  if(base64){
    try {
      const cleanBase64 = base64.replace(/\s/g, '');
      const buf = Buffer.from(cleanBase64, 'base64');
      certPath = '/tmp/efi-cert.p12';
      fs.writeFileSync(certPath, buf);
    } catch(e) {}
  } else {
    const local1 = path.join(__dirname, 'certs', 'hotspot-producao.p12');
    const local2 = path.join(__dirname, 'certs', 'certificado.p12');
    if(fs.existsSync(local1)) certPath = local1;
    else if(fs.existsSync(local2)) certPath = local2;
    else certPath = process.env.EFI_CERT_PATH || './certs/certificado.p12';
  }
  if(!certPath ||!fs.existsSync(certPath)){ throw new Error('Certificado não encontrado'); }
  efiInstance = new EfiPay({sandbox: false, client_id: process.env.EFI_CLIENT_ID, client_secret: process.env.EFI_CLIENT_SECRET, certificate: certPath});
  return efiInstance;
}

app.get('/api/liberacoes',(req,res)=>{
  // recarrega do disco toda vez pra garantir
  try{ if(fs.existsSync('/tmp/fila.json')) filaLiberacao = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8')); }catch(e){}
  if(req.query.rsc!==undefined){
    let cmds="";
    filaLiberacao.forEach(f=>{
      const m=(f.mac||'').trim(); if(!m) return;
      cmds+=`/ip hotspot user remove [find name="${m}"]\n/ip hotspot user add name="${m}" password="${m}" profile=default limit-uptime=2h\n`;
    });
    if(cmds==="") cmds=":log info \"SLS fila vazia\"\n";
    res.set('Content-Type','text/plain'); return res.send(cmds);
  }
  if(req.query.clear!==undefined){ filaLiberacao=[]; salvarFila(); return res.json([]); }
  res.json(filaLiberacao);
});

app.get('/api/consumido',(req,res)=>{
  const ip = (req.query.ip||"").trim();
  filaLiberacao = filaLiberacao.filter(x => x.ip!== ip);
  salvarFila(); res.send("ok "+ip);
});

app.get('/api/reset',(req,res)=>{
  filaLiberacao=[]; pagamentos={}; salvarFila();
  res.set('Content-Type','text/plain'); res.send("RESET OK");
});

app.get('/api/debug',(req,res)=>{
  try{ if(fs.existsSync('/tmp/fila.json')) filaLiberacao = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8')); }catch(e){}
  res.json({fila:filaLiberacao, qtd:filaLiberacao.length, pagamentos});
});

app.get('/api/forcar/:ip/:mac', (req,res)=>{
  const {ip,mac}=req.params;
  if(!filaLiberacao.find(x=>x.mac===mac)){ filaLiberacao.push({ip, mac, txid:"MANUAL"}); salvarFila(); }
  res.json({ok:true, fila:filaLiberacao});
});

async function handlerPix(req,res){
  try{
    const forwarded = req.headers['x-forwarded-for'] || "";
    const ip = (forwarded.split(',')[0].trim() || req.body.ip || req.ip || "0.0.0.0").trim();
    const mac = (req.body.mac || "").trim();
    let valor = (req.body.valor || "3.00").toString().replace("R$","").replace(",",".").trim();
    if(!valor || isNaN(Number(valor))) valor="3.00";
    const efi = getEfiInstance();
    const chavePix = process.env.EFI_PIX_KEY || process.env.EFI_CHAVE_PIX;
    const body = { calendario:{expiracao:3600}, valor:{original: Number(valor).toFixed(2)}, chave: chavePix, solicitacaoPagador: `SLS WIFI ${ip} ${mac}` };
    const charge = await efi.pixCreateImmediateCharge([], body);
    const qr = await efi.pixGenerateQRCode({id: charge.loc.id});
    pagamentos[charge.txid] = {ip, mac, status:"pendente", txid: charge.txid, valor, criado: Date.now()};
    salvarFila();
    return res.json({ txid: charge.txid, pixCopiaECola: qr.qrcode, qrcode: qr.imagemQrcode });
  }catch(err){ return res.status(500).json({error: err.message}); }
}
app.post('/api/gerar-pix', handlerPix);
app.post('/api/criar-pix', handlerPix);
app.post('/api/pix', handlerPix);

async function handlerStatus(req,res){
  try{
    const id = (req.params.id || "").trim();
    const p = pagamentos[id];
    if(!p) return res.json({status:"pendente"});
    if(p.status === "pago") return res.json({status:"CONCLUIDA"});
    const efi = getEfiInstance();
    const d = await efi.pixDetailCharge({txid: p.txid});
    if(d.status === "CONCLUIDA"){
      p.status = "pago";
      if(!filaLiberacao.find(x=>x.ip===p.ip)){ filaLiberacao.push({ip:p.ip, mac:p.mac, valor:p.valor}); salvarFila(); }
      return res.json({status:"CONCLUIDA"});
    }
    return res.json({status: d.status || "pendente"});
  }catch(e){ return res.json({status:"pendente"}); }
}
app.get('/api/status/:id', handlerStatus);
app.get('/api/status-pix/:id', handlerStatus);

app.use(express.static(path.join(__dirname,'public')));
app.get('*', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log("SLS 10:21 FIX "+PORT));
