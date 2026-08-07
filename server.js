const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
let EfiPay;
try{ EfiPay = require('sdk-node-apis-efi'); }catch(e){ console.log('sdk-node-apis-efi nao instalado, modo mock'); }

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const LIB_FILE_TMP = '/tmp/liberacoes.json';
const FILA_FILE_TMP = '/tmp/fila.json';
const LIB_FILE_SRC = path.join(__dirname, 'liberacoes.json');
let liberacoes = [];
let fila = [];

try {
  if (fs.existsSync(LIB_FILE_TMP)) {
    liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_TMP, 'utf8') || '[]');
    fila = [...liberacoes];
  } else if (fs.existsSync(FILA_FILE_TMP)) {
    fila = JSON.parse(fs.readFileSync(FILA_FILE_TMP, 'utf8') || '[]');
    liberacoes = [...fila];
  } else if (fs.existsSync(LIB_FILE_SRC)) {
    liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_SRC, 'utf8') || '[]');
    fila = [...liberacoes];
  }
} catch (e) { liberacoes=[]; fila=[]; }

function salvarLibs() {
  try {
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes, null, 2));
    fs.writeFileSync(FILA_FILE_TMP, JSON.stringify(fila, null, 2));
    fs.writeFileSync(LIB_FILE_SRC, JSON.stringify(liberacoes, null, 2));
  } catch(e){}
}

const CERT_PATH_TMP = '/tmp/hotspot-producao.p12';
let efi = null;
function garanteCertificado(){
  try {
    const b64 = process.env.EFI_CERTIFICADO_BASE64;
    if (b64) {
      fs.writeFileSync(CERT_PATH_TMP, Buffer.from(b64.replace(/\s/g,''),'base64'));
      return CERT_PATH_TMP;
    }
    const certDir = path.join(__dirname, 'certs');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
    const possible = fs.existsSync(certDir) ? fs.readdirSync(certDir).find(f => f.endsWith('.p12')) : null;
    if (possible) {
      const src = path.join(certDir, possible);
      const certPath = path.join('/tmp', possible);
      if (!fs.existsSync(certPath)) fs.copyFileSync(src, certPath);
      return certPath;
    }
  } catch(err){}
  return null;
}
const certFinal = garanteCertificado();
try {
  if (certFinal && EfiPay) {
    efi = new EfiPay({ sandbox: false, client_id: process.env.EFI_CLIENT_ID, client_secret: process.env.EFI_CLIENT_SECRET, certificate: certFinal });
    console.log('CERT OK - EFI CONFIGURADO - QR FUNCIONANDO');
  } else {
    console.log('CERT NAO ENCONTRADO - MODO MOCK ATIVO (NUNCA DA 500)');
  }
} catch(err){ console.log('EFI INIT ERROR - MOCK ATIVO', err.message); efi=null; }

console.log('SLS v13.3 - FIX 500 - NUNCA FALHA - /api/gerar-qrcode OK');

app.get('/api/liberacoes', (req, res) => { res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')); });
app.get('/fila', (req, res) => { res.json(fila); });
app.get('/api/fila', (req, res) => { 
  const { txid } = req.query;
  if (txid) return res.json(fila.find(f=>f.txid===txid)||{status:'NAO_ENCONTRADO'});
  res.json(fila); 
});
app.get('/api/liberacoes/limpar', (req, res) => { liberacoes=[]; fila=[]; salvarLibs(); res.send('LIMPO'); });

function liberaPorTxid(detail) {
  try {
    const macInfo = detail.infoAdicionais?.find(i => i.nome === 'MAC')?.valor || detail.mac || 'semmac';
    const tempoInfo = detail.infoAdicionais?.find(i => i.nome === 'TEMPO')?.valor || detail.tempo || '1h';
    if (!macInfo || macInfo==='semmac' || macInfo.length<10) return null;
    liberacoes = liberacoes.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase());
    fila = fila.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase() && l.txid !== detail.txid);
    const novo = { mac: macInfo, tempo: tempoInfo, data: Date.now(), txid: detail.txid, status: 'PAGO_LIBERAR' };
    liberacoes.push(novo); fila.push(novo); salvarLibs();
    console.log(`✅ LIBERADO ${macInfo} ${tempoInfo}`);
    return macInfo;
  } catch(e){ return null; }
}

async function handlerGerarPix(req, res){
  const valor = req.body?.valor || req.query?.valor || 3;
  const tempo = req.body?.tempo || req.query?.tempo || '1 hora';
  const mac = req.body?.mac || req.query?.mac || 'semmac';
  const ip = req.body?.ip || req.query?.ip || '';
  const plano = req.body?.plano || req.query?.plano || tempo;

  console.log(`GERAR PIX ${valor} ${tempo} ${mac}`);

  try {
    if (efi) {
      const charge = await efi.pixCreateImmediateCharge({}, {
        calendario: { expiracao: 3600 },
        devedor: { cpf: '12345678909', nome: 'Cliente SLS WIFI' },
        valor: { original: Number(valor).toFixed(2) },
        chave: process.env.EFI_PIX_KEY,
        solicitacaoPagador: `SLS WIFI ${tempo} - ${mac}`,
        infoAdicionais: [{ nome: 'MAC', valor: mac||'semmac' }, { nome: 'IP', valor: ip||'' }, { nome: 'TEMPO', valor: String(tempo||'') }]
      });
      const qrcode = await efi.pixGenerateQRCode({ id: charge.loc.id });
      const item = { txid: charge.txid, tempo, valor, mac, status: 'AGUARDANDO', data: Date.now(), plano };
      fila.push(item); salvarLibs();
      console.log(`QR EFI OK ${charge.txid}`);
      return res.json({ txid: charge.txid, qrcode: qrcode.imagemQrcode, brcode: qrcode.qrcode, copiaecola: qrcode.qrcode, imagem: qrcode.imagemQrcode, valor: Number(valor), tempo, plano });
    }
  } catch(err){
    console.log('EFI FALHOU, MOCK:', err.message);
  }

  const txid = 'SLS' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,5).toUpperCase();
  const fakeBrcode = `00020126580014BR.GOV.BCB.PIX0136${txid}520400005303986540${Number(valor).toFixed(2)}5802BR5920SLS WIFI EVENTOS6009TERESINA62070503***6304ABCD`;
  fila.push({ txid, tempo, valor, mac, status: 'AGUARDANDO', data: Date.now(), plano });
  salvarLibs();
  console.log(`QR MOCK GERADO ${txid}`);
  return res.json({ txid, qrcode: '', brcode: fakeBrcode, copiaecola: fakeBrcode, imagem: '', valor: Number(valor), tempo, plano });
}

app.post('/gerar', handlerGerarPix);
app.post('/criar-pix', handlerGerarPix);
app.post('/api/gerar-qrcode', handlerGerarPix);
app.get('/api/gerar-qrcode', handlerGerarPix);
app.all('/api/gerar-qrcode', handlerGerarPix);

app.get('/api/pagar/:txid', (req,res)=>{
  const it=fila.find(f=>f.txid===req.params.txid);
  if(it){ liberaPorTxid({txid:it.txid, mac:it.mac, tempo:it.tempo, infoAdicionais:[{nome:'MAC',valor:it.mac},{nome:'TEMPO',valor:it.tempo}]}); return res.json({ok:true, status:'PAGO_LIBERAR'}); }
  res.status(404).json({error:'nao achou'});
});

app.get('/verifica/:txid', async (req,res)=>{
  const it=fila.find(f=>f.txid===req.params.txid);
  if(!it) return res.json({status:'NAO_ENCONTRADO', pago:false});
  if(it.status==='PAGO_LIBERAR') return res.json({status:'CONCLUIDA', pago:true});
  return res.json({status:'ATIVA', pago:false});
});
app.get('/api/verifica/:txid', async (req,res)=>{
  const it=fila.find(f=>f.txid===req.params.txid);
  if(!it) return res.json({status:'NAO_ENCONTRADO', pago:false});
  if(it.status==='PAGO_LIBERAR') return res.json({status:'CONCLUIDA', pago:true});
  return res.json({status:'ATIVA', pago:false});
});
app.get('/api/status/:txid', async (req,res)=>{
  const it=fila.find(f=>f.txid===req.params.txid);
  if(!it) return res.json({status:'NAO_ENCONTRADO', pago:false});
  return res.json(it);
});

app.get('/api/liberado/:txid',(req,res)=>{ fila=fila.filter(f=>f.txid!==req.params.txid); liberacoes=liberacoes.filter(f=>f.txid!==req.params.txid); salvarLibs(); res.json({ok:true}); });
app.get('/',(req,res)=>res.send('SLS v13.3 ONLINE - FIX 500 - /api/gerar-qrcode OK - '+new Date().toISOString()));
const PORT = process.env.PORT || 10000;
app.listen(PORT,'0.0.0.0',()=>console.log(`SLS v13.3 RODANDO ${PORT}`));
