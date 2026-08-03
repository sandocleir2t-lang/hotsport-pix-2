const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let filaLiberacao = [];
let pixDB = {}; // txid -> {ip, mac, valor, status}

// CARREGA FILA DO DISCO
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

console.log("SLS 10:21 FIX FINAL");

// GERAR PIX
app.all('/api/gerar-pix', async (req,res)=>{
  try{
    let {valor, ip, mac} = {...req.query,...req.body};
    valor = valor || "2.00";
    ip = ip || req.query.ip;
    mac = mac || req.query.mac;
    if(!mac) mac = "58:04:4F:54:64:7C";
    if(!ip) ip = "10.5.50.199";

    // AQUI VAI SUA LOGICA DA EFI - vou deixar exemplo que já funciona pro teste
    const txid = "SLS" + Date.now();
    // Se você já tem getEfiInstance, use ela aqui. Por enquanto gera PIX FAKE pra testar fila:
    const pixCopiaECola = "00020101021226830014BR.GOV.BCB.PIX2561qrcodespix.sejaefi.com.br/v2/fake" + txid;

    pixDB[txid] = {ip, mac, valor, status: "ATIVA", pixCopiaECola, qrcode: ""};
    salvarFila();

    // SE TIVER EFI REAL, DESCOMENTA ISSO:
    /*
    const efi = getEfiInstance();
    let cob = await efi.pixCreateImmediateCharge([], {valor:{original:valor}, chave:"SUA_CHAVE", solicitacaoPagador:"SLS WIFI "+valor});
    pixDB[cob.txid] = {ip, mac, valor, status:"ATIVA",...};
    return res.json({txid: cob.txid, pixCopiaECola: cob.pixCopiaECola, qrcode: cob.imagemQrcode});
    */

    res.json({txid, pixCopiaECola, qrcode: "", status:"ATIVA", ip, mac});
  }catch(err){
    res.status(500).json({error: err.message});
  }
});

// STATUS - É ESSE QUE LIBERA QUANDO CLICA JA PAGUEI
app.get('/api/status/:txid', async (req,res)=>{
  try{
    let txid = req.params.txid;
    let dados = pixDB[txid];
    if(!dados) return res.json({status:"NAO_ENCONTRADO"});

    // TENTA CONSULTAR NA EFI SE TÁ PAGO - se não tiver EFI, considera PAGO quando clica
    let statusEfi = "CONCLUIDA"; // MOCK - troca por consulta real
    try{
      // const efi = getEfiInstance();
      // let consulta = await efi.pixDetailCharge({txid});
      // statusEfi = consulta.status;
    }catch(e){}

    // SE CLICOU NO JA PAGUEI, CONSIDERA PAGO E JOGA NA FILA
    if(statusEfi === "CONCLUIDA" || statusEfi === "pago" || req.query.force){
      dados.status = "CONCLUIDA";
      // Adiciona na fila se não existe
      if(!filaLiberacao.find(f=>f.mac===dados.mac)){
        filaLiberacao.push({ip:dados.ip, mac:dados.mac, txid});
        salvarFila();
        console.log("FILA ADD VIA STATUS:", dados.mac);
      }
      return res.json({status:"CONCLUIDA", ip:dados.ip, mac:dados.mac});
    }

    res.json({status: dados.status || "ATIVA"});
  }catch(err){
    res.status(500).json({error: err.message});
  }
});

// WEBHOOK DA EFI
app.post('/api/webhook-pix', (req,res)=>{
  try{
    let pixs = req.body.pix || [];
    pixs.forEach(p=>{
      let d = pixDB[p.txid];
      if(d){
        d.status = "CONCLUIDA";
        if(!filaLiberacao.find(f=>f.mac===d.mac)){
          filaLiberacao.push({ip:d.ip, mac:d.mac, txid:p.txid});
        }
      }
    });
    salvarFila();
    res.json({ok:true});
  }catch(e){ res.json({ok:true}); }
});

// LISTA FILA
app.get('/api/liberacoes', (req,res)=>{
  try{
    if(fs.existsSync('/tmp/fila.json')) filaLiberacao = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8'));
  }catch(e){}

  if(req.query.rsc!== undefined){
    if(filaLiberacao.length === 0){
      return res.type('text/plain').send('/log info "SLS fila vazia"');
    }
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
  }
  salvarFila();
  res.json({ok:true, fila: filaLiberacao});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log("RODANDO PORTA "+PORT));
