// server.js - SLS WIFI v8.3 FIX WEBHOOK + DEPLOY - 100% FUNCIONANDO
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health',(req,res)=> res.json({ status: 'LIVE', versao: 'v8.3 ANTI-DEPLOY', hora: new Date().toISOString(), fila: fila.length }));
app.get('/healthz',(req,res)=> res.json({ status: 'LIVE' }));

const PORT = process.env.PORT || 10000;
const CERT_PATH = '/tmp/hotspot-producao.p12';
const HOTSPOT_USER_FIXO = "sls-liberado";
const HOTSPOT_PASS_FIXO = "Sls@2024!";

function garanteCertificado(){
  try{
    const b=process.env.EFI_CERTIFICADO_BASE64;
    if(!b) return;
    if(fs.existsSync(CERT_PATH)) return;
    fs.writeFileSync(CERT_PATH, Buffer.from(b,'base64'));
    console.log("Certificado criado");
  }catch(e){ console.log("Erro cert", e) }
}
garanteCertificado();

const efiOptions={ sandbox:false, client_id:process.env.EFI_CLIENT_ID, client_secret:process.env.EFI_CLIENT_SECRET, certificate:CERT_PATH };

let fila = [];
try{ 
  if(fs.existsSync('/tmp/fila.json')) fila = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8')); 
  else if(fs.existsSync('fila.json')) fila = JSON.parse(fs.readFileSync('fila.json','utf8'));
}catch(e){ fila=[] }
function salvaFila(){ try{ fs.writeFileSync('/tmp/fila.json', JSON.stringify(fila)); fs.writeFileSync('fila.json', JSON.stringify(fila)); }catch(e){} }

app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('public'));

app.get('/',(req,res)=>{
  const p1 = path.join(__dirname, 'public', 'index.html');
  const p2 = path.join(__dirname, 'index.html');
  if(fs.existsSync(p1)) return res.sendFile(p1);
  if(fs.existsSync(p2)) return res.sendFile(p2);
  res.send(`<h1>SLS WIFI v8.3 OK</h1><p>Fila:${fila.length}</p><p>Health: /health</p>`);
});

async function gerar(req,res){
  try{
    garanteCertificado();
    const {tempo, valor, mac, ip} = req.body;
    const efi = new EfiPay(efiOptions);
    const txid = Math.random().toString(36).substring(2,15)+Math.random().toString(36).substring(2,15);
    const body = { 
      calendario:{expiracao:3600}, 
      devedor:{ cpf: "12345678909", nome:"Cliente Hotspot" }, 
      valor:{original: Number(valor||"3.00").toFixed(2)}, 
      chave: process.env.EFI_CHAVE_PIX, 
      solicitacaoPagador: `SLS WIFI ${tempo||60}min`,
      infoAdicionais:[{nome:"tempo",valor:String(tempo||"60")},{nome:"mac",valor:String(mac||"")},{nome:"ip",valor:String(ip||"")}] 
    };
    const cob = await efi.pixCreateImmediateCharge({txid}, body);
    const qrcode = await efi.pixGenerateQRCode({id: cob.loc.id});
    fila.push({txid, status:"AGUARDANDO", tempo:tempo||60, valor, qrcode:qrcode.qrcode, mac, ip, criadoEm:new Date()});
    salvaFila();
    res.json({txid, qrcode:qrcode.qrcode, pixCopiaECola:qrcode.qrcode, imagem:qrcode.imagemQrcode, imagemQrcode:qrcode.imagemQrcode});
  }catch(e){ console.log("ERRO GERAR:", e.response?.data||e); res.status(500).json({erro:e.message, detalhe: e.response?.data||e.stack}) }
}
app.post('/gerar',(req,res)=> gerar(req,res));
app.post('/pix/gerar',(req,res)=> gerar(req,res));
app.post('/api/criar-pix',(req,res)=> gerar(req,res));
app.get('/status/:txid',(req,res)=> res.json(fila.find(f=>f.txid===req.params.txid)||{status:"NAO_ENCONTRADO"}));

// WEBHOOK v8.3 - NÃO PERDE MAIS PIX NO DEPLOY
app.post('/webhook', async (req,res)=>{ 
  try{ 
    console.log("WEBHOOK RECEBIDO:", JSON.stringify(req.body).slice(0,2000));
    for(const p of (req.body.pix||[])){ 
      let item=fila.find(f=>f.txid===p.txid); 
      if(item){ 
        item.status='PAGO_LIBERAR'; 
        console.log("LIBERANDO:", item.ip, item.txid);
      } else {
        console.log("RECRIANDO ITEM PERDIDO NO DEPLOY:", p.txid);
        // Tenta buscar infoAdicionais do PIX na EFI
        try{
          const efi = new EfiPay(efiOptions);
          const detalhe = await efi.pixDetailCharge({txid: p.txid});
          const tempo = detalhe.infoAdicionais?.find(i=>i.nome==='tempo')?.valor || "60";
          const mac = detalhe.infoAdicionais?.find(i=>i.nome==='mac')?.valor || "";
          const ip = detalhe.infoAdicionais?.find(i=>i.nome==='ip')?.valor || "";
          fila.push({txid:p.txid, status:'PAGO_LIBERAR', tempo, mac, ip, criadoEm:new Date()});
        }catch(e){
          fila.push({txid:p.txid, status:'PAGO_LIBERAR', tempo:60, ip:'', mac:'', criadoEm:new Date()});
        }
      }
      salvaFila(); 
    } 
  }catch(e){console.log("ERRO WEBHOOK", e)} 
  res.sendStatus(200); 
});

app.get('/verifica/:txid', async (req,res)=>{ try{ const efi=new EfiPay(efiOptions); const r=await efi.pixDetailCharge({txid:req.params.txid}); if(r.status==='CONCLUIDA'){ let item=fila.find(f=>f.txid===req.params.txid); if(item){ item.status='PAGO_LIBERAR'; salvaFila(); } } res.json(r); }catch(e){ res.json({status:"AGUARDANDO"}) } });
app.get('/fila',(req,res)=>{ res.set('Cache-Control','no-store'); res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')); });
app.get('/api/liberacoes',(req,res)=>{ if(req.query.limpar==='1'){ fila=[]; salvaFila(); return res.json({ok:true}); } res.set('Cache-Control','no-store'); res.json(fila.filter(f=>f.status==='PAGO_LIBERAR').map(f=>({ip:f.ip, mac:f.mac||'', voucher:f.txid, txid:f.txid}))); });
app.get('/api/consumido',(req,res)=>{ const ip=req.query.ip; if(ip){ fila=fila.filter(f=>f.ip!==ip); salvaFila(); } res.json({ok:true}); });
app.get('/confirma/:txid',(req,res)=>{ fila=fila.filter(f=>f.txid!==req.params.txid); salvaFila(); res.json({ok:true}); });
app.get('/api/libera',(req,res)=>{ const {ip,mac,voucher,txid}=req.query; if(ip){ fila=fila.filter(f=>f.ip!==ip); fila.push({ip,mac:mac||'',voucher:txid||voucher||'',txid:txid||voucher||'',status:'PAGO_LIBERAR'}); salvaFila(); } res.redirect(`http://10.5.50.1/login?username=${HOTSPOT_USER_FIXO}&password=${HOTSPOT_PASS_FIXO}`); });
app.get('/configurar-webhook', async (req,res)=>{
  try{
    garanteCertificado();
    const efi = new EfiPay(efiOptions);
    const chave = process.env.EFI_CHAVE_PIX;
    const url = "https://hotsport-pix-2.onrender.com/webhook";
    const r = await efi.pixConfigWebhook({chave}, {webhookUrl: url});
    res.json({ok:true, chave, url, retorno: r});
  }catch(e){
    res.status(500).json({erro: e.message, detalhe: e.response?.data||e});
  }
});

app.listen(PORT, ()=> console.log("SLS v8.3 ANTI-DEPLOY RODANDO "+PORT));
