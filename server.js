// server.js v12.5.7 FINAL - FIX LOG + FIX QR
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
  }
}catch(e){ fila=[]; }

// --- FIX 1: LOG SEM FLOOD ---
function salvarFila(){
  try{
    fs.writeFileSync(FILA_PATH, JSON.stringify(fila,null,2));
    // só loga se tiver alguém, se total=0 fica quieto
    if(fila.length>0){
      console.log(` FILA SALVA total=${fila.length} PAGO_LIBERAR=${fila.filter(f=>f.status==='PAGO_LIBERAR').length} AGUARDANDO=${fila.filter(f=>f.status==='AGUARDANDO').length}`);
    }
  }catch(e){
    console.log('ERRO SALVAR FILA', e.message);
  }
}

function gerarVoucher(){
  return `SLS-${Math.floor(1000+Math.random()*9000)}`;
}

// --- EFI ---
let EfiPay;
try{ EfiPay = require('sdk-node-apis-efi').default || require('sdk-node-apis-efi'); }catch(e){}

function getEfi(){
  if(!EfiPay) return null;
  // Suporta os 2 nomes de env que vc usa
  const certB64 = process.env.EFI_CERT_BASE64 || process.env.EFI_CERTIFICATE_BASE64 || process.env.EFI_CERT_P12_BASE64;
  if(!certB64) { console.log('SEM CERT B64'); return null; }
  try{
    const cert = Buffer.from(certB64,'base64');
    return new EfiPay({
      sandbox: false,
      client_id: process.env.EFI_CLIENT_ID,
      client_secret: process.env.EFI_CLIENT_SECRET,
      certificate: cert,
      certBase64: false
    });
  }catch(e){ console.log('ERRO EFI CLIENT', e.message); return null; }
}

// CRIAR PIX - FIX 2: QR VOLTANDO
app.post('/api/pix', async (req,res)=>{
  try{
    const { valor, plano, mac, ip, nome } = req.body;
    const client = getEfi();

    const voucher = gerarVoucher();
    const valorFmt = Number(valor).toFixed(2);

    // --- FIX QR: infoAdicionais nunca vazio e nunca maior que 2 itens ---
    const infoAdicionais = [
      { nome: 'Plano', valor: String(plano||'1H').substring(0,50) },
      { nome: 'Voucher', valor: voucher }
    ];

    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: valorFmt },
      chave: process.env.EFI_PIX_KEY || process.env.PIX_KEY,
      infoAdicionais,
      solicitacaoPagador: `SLS ${plano||'WIFI'} ${voucher}`
    };

    if(!client){
      console.log(`MOCK PIX R$ ${valorFmt} ${voucher} IP ${ip}`);
      const item = { id: Date.now().toString(), txid: Date.now().toString(), status:'AGUARDANDO', valor:Number(valor), plano, mac:(mac||'').toLowerCase(), ip: ip||'', nome: nome||'', voucher, criacao: new Date().toISOString(), qrcode: '00020101021226870014br.gov.bcb.pix MOCK' };
      fila.push(item);
      salvarFila();
      return res.json({ qrcode: item.qrcode, txid: item.txid, voucher });
    }

    const cob = await client.pixCreateImmediateCharge({}, body);
    const qr = await client.pixGenerateQRCode({ id: cob.loc.id });

    const item = {
      id: String(cob.txid),
      txid: String(cob.txid),
      locId: cob.loc.id,
      status: 'AGUARDANDO',
      valor: Number(valor),
      plano: plano||'1H',
      mac: (mac||'').toLowerCase(),
      ip: ip||'',
      nome: nome||'',
      voucher,
      criacao: new Date().toISOString(),
      qrcode: qr.qrcode
    };
    fila.push(item);
    salvarFila();

    console.log(`PIX GERADO R$ ${valorFmt} ${voucher} IP ${ip} MAC ${mac}`);
    return res.json({ qrcode: qr.qrcode, qrcodeImage: qr.imagemQrcode, txid: item.txid, voucher });

  }catch(err){
    console.error('ERRO /api/pix', err.message);
    if(err.errors) console.error(JSON.stringify(err.errors));
    return res.status(500).json({ error: err.message, details: err.errors || null });
  }
});

app.get('/api/verificar/:txid', async (req,res)=>{
  try{
    const { txid } = req.params;
    const client = getEfi();
    let pago = false;
    const item = fila.find(f=>f.txid===txid || f.id===txid);
    if(client && item){
      try{
        const det = await client.pixDetailCharge({ txid });
        if(det.status==='CONCLUIDA' || (det.pix && det.pix.length>0)) pago=true;
      }catch(e){}
    }
    // MOCK auto-paga em 15s pra teste
    if(!client && item){
      if(Date.now() - new Date(item.criacao).getTime() > 15000) pago=true;
    }
    if(item && pago){
      item.status='PAGO_LIBERAR';
      salvarFila();
      console.log(`✅ PAGO CONFIRMADO ${item.voucher} ${item.ip}`);
    }
    return res.json({ pago, status: item?.status||'NAO_ENCONTRADO', voucher: item?.voucher });
  }catch(e){ return res.status(500).json({error:e.message}); }
});

app.get('/api/fila', (req,res)=> res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')));
app.get('/api/liberacoes', (req,res)=> res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')));

app.post('/api/liberar', (req,res)=>{
  const { txid, mac } = req.body;
  const idx = fila.findIndex(f=> f.txid===txid || f.id===txid || (mac && f.mac===mac.toLowerCase()));
  if(idx>=0){
    console.log(`✅ LIBERADO RAPIDO ${fila[idx].voucher} ${fila[idx].ip} ${fila[idx].mac}`);
    fila.splice(idx,1);
    salvarFila();
  }
  res.json({ok:true});
});

app.get('/', (req,res)=> res.send('SLS v12.5.7 FINAL ON'));
app.listen(PORT, ()=> console.log(`SLS API RODANDO ${PORT}`));
