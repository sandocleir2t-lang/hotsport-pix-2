const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const EfiPay = require('sdk-node-apis-efi').default;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let filaLiberacao = [];
let pixDB = {};

// CARREGA FILA DO DISCO (pra não perder quando Render reinicia)
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

console.log("SLS 10:21 FIX FINAL REAL");

// CONFIG EFI - PEGA DO ENV DO RENDER
function getEfiInstance(){
  const certPath = process.env.EFI_CERT_PATH || './certs/certificado.p12';
  let certificate;
  try {
    if (fs.existsSync(certPath)) {
      certificate = fs.readFileSync(certPath);
    } else if (process.env.EFI_CERT_BASE64) {
      certificate = Buffer.from(process.env.EFI_CERT_BASE64, 'base64');
    }
  } catch(e){}

  const options = {
    sandbox: false,
    client_id: process.env.EFI_CLIENT_ID,
    client_secret: process.env.EFI_CLIENT_SECRET,
    certificate,
    cert_base64: false
  };
  return new EfiPay(options);
}

// 1. GERAR PIX REAL
app.all('/api/gerar-pix', async (req,res)=>{
  try{
    let {valor, ip, mac} = {...req.query,...req.body};
    valor = (valor || "2.00").toString().replace(',','.');
    ip = ip || "10.5.50.199";
    mac = mac || "58:04:4F:54:64:7C";

    const efi = getEfiInstance();
    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: valor },
      chave: process.env.EFI_PIX_KEY,
      solicitacaoPagador: `SLS WIFI - ${valor}`
    };

    const cob = await efi.pixCreateImmediateCharge([], body);
    const qrcode = await efi.pixGenerateQRCode({ id: cob.loc.id });

    pixDB[cob.txid] = { ip, mac, valor, status: "ATIVA", txid: cob.txid };
    salvarFila();

    res.json({
      txid: cob.txid,
      pixCopiaECola: qrcode.qrcode,
      qrcode: qrcode.imagemQrcode,
      status: "ATIVA",
      ip, mac
    });
  }catch(err){
    console.error(err);
    res.status(500).json({error: err.message || "Erro EFI"});
  }
});

// 2. STATUS - CHAMADO PELO BOTAO JA PAGUEI
app.get('/api/status/:txid', async (req,res)=>{
  try{
    const txid = req.params.txid;
    const dados = pixDB[txid];
    if(!dados) return res.json({status: "NAO_ENCONTRADO"});

    let consulta;
    try{
      const efi = getEfiInstance();
      consulta = await efi.pixDetailCharge({ txid });
    }catch(e){
      console.log("Erro consulta EFI", e.message);
      return res.json({status: dados.status});
    }

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
    res.status(500).json({error: err.message});
  }
});

// 3. WEBHOOK DA EFI (LIBERACAO AUTOMATICA SEM CLICAR)
app.post('/api/webhook-pix', async (req,res)=>{
  try{
    const pixs = req.body.pix || [];
    for(const p of pixs){
      const d = pixDB[p.txid];
      if(d &&!filaLiberacao.find(f=>f.mac===d.mac)){
        d.status = "CONCLUIDA";
        filaLiberacao.push({ip: d.ip, mac: d.mac, txid: p.txid});
        console.log("FILA ADD VIA WEBHOOK:", d.mac);
      }
    }
    salvarFila();
    res.json({ok:true});
  }catch(e){ res.json({ok:true}); }
});

// 4. ROTA QUE O MIKROTIK BUSCA A CADA 15s
app.get('/api/liberacoes', (req,res)=>{
  try{
    if(fs.existsSync('/tmp/fila.json')) filaLiberacao = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8'));
  }
