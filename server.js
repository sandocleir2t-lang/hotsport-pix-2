const express = require('express');
const fs = require('fs');
const cors = require('cors');
const EfiPay = require('sdk-node-apis-efi');
const Efi = EfiPay.EfiPay || EfiPay.default || EfiPay;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let filaLiberacao = [];
let pixDB = {};

try {
  if (fs.existsSync('/tmp/fila.json')) filaLiberacao = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8'));
  if (fs.existsSync('/tmp/pix.json')) pixDB = JSON.parse(fs.readFileSync('/tmp/pix.json','utf8'));
} catch(e){}

function salvarFila(){
  try{
    fs.writeFileSync('/tmp/fila.json', JSON.stringify(filaLiberacao));
    fs.writeFileSync('/tmp/pix.json', JSON.stringify(pixDB));
  }catch(e){}
}

function getEfiInstance(){
  let certificate = null;
  try{
    const certPath = process.env.EFI_CERT_PATH || './certs/certificado.p12';
    if (fs.existsSync(certPath)) certificate = fs.readFileSync(certPath);
    else if (process.env.EFI_CERT_BASE64) certificate = Buffer.from(process.env.EFI_CERT_BASE64, 'base64');
  }catch(e){}
  const options = {
    sandbox: false,
    client_id: process.env.EFI_CLIENT_ID,
    client_secret: process.env.EFI_CLIENT_SECRET,
    certificate: certificate
  };
  return new EfiPay(options);
}

app.all('/api/gerar-pix', async (req,res)=>{
  try{
    let {valor, ip, mac} = {...req.query,...req.body};
    valor = String(valor || "2.00").replace(',','.');
    ip = ip || "10.5.50.199";
    mac = mac || "58:04:4F:54:64:7C";
    const efi = getEfiInstance();
    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: valor },
      chave: process.env.EFI_PIX_KEY,
      solicitacaoPagador: "SLS WIFI - R$ "+valor
    };
    const cob = await efi.pixCreateImmediateCharge([], body);
    const qrcode = await efi.pixGenerateQRCode({ id: cob.loc.id });
    pixDB[cob.txid] = { ip, mac, valor, status: "ATIVA" };
    salvarFila();
    res.json({ txid: cob.txid, pixCopiaECola: qrcode.qrcode, qrcode: qrcode.imagemQrcode, ip, mac });
  }catch(err){
    console.error(err);
    res.status(500).json({error: err.message});
  }
});

app.get('/api/status/:txid', async (req,res)=>{
  try{
    const txid = req.params.txid;
    const dados = pixDB[txid];
    if(!dados) return res.json({status: "NAO_ENCONTRADO"});
    const efi = getEfiInstance();
    const consulta = await efi.pixDetailCharge({ txid });
    if(consulta.status === "CONCLUIDA"){
      dados.status = "CONCLUIDA";
      if(!filaLiberacao.find(f=>f.mac===dados.mac)){
        filaLiberacao.push({ip: dados.ip, mac: dados.mac, txid});
        salvarFila();
        console.log("FILA ADD VIA STATUS:", dados.mac);
      }
      return res.json({status: "CONCLUIDA", ip: dados.ip, mac: dados.mac});
    }
    res.json({status: consulta.status});
  }catch(err){
    res.json({status: "ATIVA"});
  }
});

app.post('/api/webhook-pix', (req,res)=>{
  try{
    const pixs = req.body.pix || [];
    for(const p of pixs){
      const d = pixDB[p.txid];
      if(d &&!filaLiberacao.find(f=>f.mac===d.mac)){
        d.status = "CONCLUIDA";
        filaLiberacao.push({ip: d.ip, mac: d.mac, txid: p.txid});
      }
    }
    salvarFila();
    res.json({ok:true});
  }catch(e){ res.json({ok:true}); }
});

app.get('/api/liberacoes', (req,res)=>{
  try{
    if(fs.existsSync('/tmp/fila.json')) filaLiberacao = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8'));
  }catch(e){}
  if(req.query.rsc!== undefined){
    if(filaLiberacao.length === 0) return res.type('text/plain').send('/log info "SLS fila vazia"');
    let cmds = filaLiberacao.map(f=>`/ip hotspot user remove [find name="${f.mac}"]\n/ip hotspot user add name="${f.mac}" password="${f.mac}" profile=default limit-uptime=2h`).join('\n');
    return res.type('text/plain').send(cmds);
  }
  res.json({ok:true, fila: filaLiberacao});
});

app.get('/api/liberacoes/clear', (req,res)=>{
  filaLiberacao = [];
  salvarFila();
  res.type('text/plain').send('/log info "SLS fila limpa"');
});

app.get('/api/forcar/:ip/:mac', (req,res)=>{
  let {ip, mac} = req.params;
  if(!filaLiberacao.find(f=>f.mac===mac)){
    filaLiberacao.push({ip, mac, txid:"MANUAL"});
    salvarFila();
  }
  res.json({ok:true, fila: filaLiberacao});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log("SLS FINAL REAL RODANDO "+PORT));
