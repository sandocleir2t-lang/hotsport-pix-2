// server.js v12.5.3 SCHEDULER 5s - O QUE FUNCIONAVA
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FILA_PATH = path.join(__dirname, 'fila.json');

let fila = [];
try{
  if(fs.existsSync(FILA_PATH)){
    fila = JSON.parse(fs.readFileSync(FILA_PATH,'utf8')||'[]');
    console.log(`FILA CARREGADA total=${fila.length}`);
  }
}catch(e){ fila=[]; }

// --- CORREÇÃO DO LOG: só loga se tiver gente ---
function salvarFila(){
  try{
    fs.writeFileSync(FILA_PATH, JSON.stringify(fila,null,2));
    if(fila.length > 0){
      console.log(`FILA SALVA total=${fila.length} PAGO_LIBERAR=${fila.filter(f=>f.status==='PAGO_LIBERAR').length} AGUARDANDO=${fila.filter(f=>f.status==='AGUARDANDO').length}`);
    }
  }catch(e){
    console.log('ERRO SALVAR FILA', e.message);
  }
}

function gerarVoucher(){
  return `SLS-${Math.floor(1000+Math.random()*9000)}`;
}

// EFI
let EfiPay;
try{ EfiPay = require('sdk-node-apis-efi').default || require('sdk-node-apis-efi'); }catch(e){}
function getEfi(){
  if(!EfiPay) return null;
  const certB64 = process.env.EFI_CERT_BASE64 || process.env.EFI_CERTIFICATE_BASE64;
  if(!certB64) return null;
  try{
    return new EfiPay({
      sandbox: false,
      client_id: process.env.EFI_CLIENT_ID,
      client_secret: process.env.EFI_CLIENT_SECRET,
      certificate: Buffer.from(certB64,'base64'),
      certBase64: false
    });
  }catch(e){ console.log('ERRO EFI', e.message); return null; }
}

// CRIAR PIX
app.post('/api/pix', async (req,res)=>{
  try{
    const { valor, plano, mac, ip, nome } = req.body;
    const voucher = gerarVoucher();
    const valorFmt = Number(valor).toFixed(2);

    const client = getEfi();
    if(!client){
      const item = { id: Date.now().toString(), txid: Date.now().toString(), status:'AGUARDANDO', valor:Number(valor), plano, mac:(mac||'').toLowerCase(), ip: ip||'', nome: nome||'', voucher, criacao: new Date().toISOString(), qrcode: '000201 MOCK' };
      fila.push(item); salvarFila();
      return res.json({ qrcode: item.qrcode, txid: item.txid, voucher });
    }

    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: valorFmt },
      chave: process.env.EFI_PIX_KEY,
      infoAdicionais: [
        { nome: 'Plano', valor: String(plano||'1H') },
        { nome: 'Voucher', valor: voucher }
      ],
      solicitacaoPagador: `SLS ${plano} ${voucher}`
    };

    const cob = await client.pixCreateImmediateCharge({}, body);
    const qr = await client.pixGenerateQRCode({ id: cob.loc.id });

    const item = {
      id: String(cob.txid), txid: String(cob.txid), locId: cob.loc.id,
      status:'AGUARDANDO', valor:Number(valor), plano, mac:(mac||'').toLowerCase(), ip: ip||'',
      nome: nome||'', voucher, criacao: new Date().toISOString(), qrcode: qr.qrcode
    };
    fila.push(item); salvarFila();
    console.log(`PIX GERADO R$ ${valorFmt} ${voucher} IP ${ip}`);
    return res.json({ qrcode: qr.qrcode, qrcodeImage: qr.imagemQrcode, txid: item.txid, voucher });

  }catch(err){
    console.error('ERRO /api/pix', err.message);
    if(err.errors) console.error(err.errors);
    return res.status(500).json({error: err.message});
  }
});

app.get('/api/verificar/:txid', async (req,res)=>{
  const { txid } = req.params;
  const item = fila.find(f=>f.txid===txid);
  return res.json({ pago: item?.status==='PAGO_LIBERAR', status: item?.status||'NAO_ENCONTRADO', voucher: item?.voucher });
});

app.get('/api/fila', (req,res)=> res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')));
app.get('/api/liberacoes', (req,res)=> res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')));

app.post('/api/liberar', (req,res)=>{
  const { txid, mac } = req.body;
  const idx = fila.findIndex(f=> f.txid===txid || (mac && f.mac===mac.toLowerCase()));
  if(idx>=0){
    console.log(`✅ LIBERADO RAPIDO ${fila[idx].voucher} ${fila[idx].ip} ${fila[idx].mac}`);
    fila.splice(idx,1); salvarFila();
  }
  res.json({ok:true});
});

// --- SCHEDULER 5s - O RÁPIDO QUE FUNCIONAVA ---
setInterval(async ()=>{
  const pendentes = fila.filter(f=>f.status==='AGUARDANDO');
  if(pendentes.length===0) return; // NÃO LOGA NADA SE TOTAL=0, RESOLVE SEU PRINT

  const client = getEfi();
  if(!client) return;

  for(const item of pendentes){
    try{
      const det = await client.pixDetailCharge({ txid: item.txid });
      if(det.status==='CONCLUIDA' || (det.pix && det.pix.length>0)){
        item.status='PAGO_LIBERAR';
        salvarFila();
        console.log(`✅ PAGO CONFIRMADO SCHEDULER ${item.voucher}`);
      }
    }catch(e){}
  }
}, 5000); // 5 SEGUNDOS

app.get('/', (req,res)=> res.send('SLS v12.5.3 SCHEDULER 5s ON'));
app.listen(PORT, ()=> console.log(`SLS API RODANDO ${PORT} - SCHEDULER 5s`));
