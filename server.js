// SLS WIFI - v18 MESCLADO - v13 (fila boa) + v17 (EFI REAL com cert)
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const FILA_PATH = path.join(__dirname, 'fila.json');
const PORT = process.env.PORT || 10000;

// --- LEITURA ENV COMPATIVEL COM SUA PRINT ---
const CERT_B64 = process.env.EFI_CERT_BASE64 || process.env.EFI_CERTIFICADO_BASE64 || process.env.EFI_CERTIFICADO_BASE64;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CHAVE_PIX = process.env.EFI_PIX_KEY || process.env.EFI_CHAVE_PIX || process.env.CHAVE_PIX || "50574099000103";
const VERSAO = "v18 MESCLADO CNPJ FIX";

let fila = {};
try { if (fs.existsSync(FILA_PATH)) fila = JSON.parse(fs.readFileSync(FILA_PATH,'utf8')); } catch(e){ fila={}; }
function salvar(){ fs.writeFileSync(FILA_PATH, JSON.stringify(fila, null, 2)); }

// --- EFI REAL COM CERTIFICADO ---
let efipay = null;
try {
  const EfiPay = require('sdk-node-apis-efi');
  const p = '/tmp/cert.p12';
  fs.writeFileSync(p, Buffer.from(CERT_B64,'base64'));
  efipay = new EfiPay({ sandbox:false, client_id:CLIENT_ID, client_secret:CLIENT_SECRET, certificate:p });
  console.log(`[EFI] REAL OK - Chave CNPJ ${CHAVE_PIX}`);
} catch(e){ console.log('[EFI] MOCK -', e.message); }

app.get('/', (req,res)=> res.send(`SLS ${VERSAO} - ${new Date().toISOString()} - Fila:${Object.keys(fila).length}`));

// COMPATIVEL COM SEU LOGIN ATUAL (GET e POST)
async function gerarPix({mac,ip,plano,valor}){
  const txid = 'SLS'+Date.now()+Math.random().toString(36).substring(2,6).toUpperCase();
  const valorFinal = (valor || (plano==='1HORA'?'3.00':'5.00')).toString();
  fila[txid] = { txid, mac:mac?.toUpperCase()||'SEM-MAC', ip:ip||'', plano:plano||'1HORA', valor:valorFinal, status:'PENDENTE', timestamp:Date.now() };
  salvar();
  console.log(`[EFI] Gerando real TXID=${txid} VALOR=${valorFinal} MAC=${mac} PLANO=${plano}`);
  try {
    const cob = await efipay.pixCreateImmediateCharge({txid:txid.slice(0,32)}, {
      calendario:{expiracao:3600},
      devedor:{cpf:"11144477735", nome:"Cliente SLS WIFI"}, // CPF VALIDO FIX
      valor:{original:parseFloat(valorFinal).toFixed(2)},
      chave:CHAVE_PIX,
      solicitacaoPagador:`SLS WIFI ${plano}`.slice(0,25)
    });
    const qrcode = await efipay.pixGenerateQRCode({id:cob.loc.id});
    console.log(`[EFI] OK real - ${txid} MAC=${mac}`);
    return { txid, qrcode:qrcode.qrcode, qrcodeImagem:qrcode.imagemQrcode, valor:valorFinal };
  } catch(e){
    console.error('[EFI] Erro, fallback MOCK', e.message);
    return { txid, qrcode:`00020126580014BR.GOV.BCB.PIX0136${CHAVE_PIX}52040000530398654${valorFinal}5802BR5909SLS WIFI6009TERESINA62070503***6304ERRO:${e.message}`, valor:valorFinal, fallback:true };
  }
}

app.get('/api/gerar-qrcode', async (req,res)=>{ const r=await gerarPix(req.query); res.json(r); });
app.post('/api/criar-pix', async (req,res)=>{ const r=await gerarPix(req.body); res.json(r); });
app.post('/api/gerar-qrcode', async (req,res)=>{ const r=await gerarPix(req.body); res.json(r); });

// hEX consome
app.get('/api/liberacoes', (req,res)=>{
  const pagos = Object.values(fila).filter(f=>f.status==='PAGO_LIBERAR');
  console.log(`[SLS] Processando fila... ${pagos.length} para liberar | Total: ${Object.keys(fila).length}`);
  if(pagos.length===0) return res.type('text/plain').send('VAZIO\n');
  let txt=''; pagos.forEach(p=> txt+=`${p.txid};${p.mac};${p.ip};${p.plano}\n`);
  res.type('text/plain').send(txt);
});
app.get('/api/liberacoes/limpar', (req,res)=>{ const {txid}=req.query; if(txid && fila[txid]){ console.log(`[SLS] Liberado e limpo TXID ${txid}`); delete fila[txid]; salvar(); } res.send('OK'); });

// WEBHOOK
app.post('/api/webhook', (req,res)=>{ app.post('/api/webhook/pix', req, res); });
app.post('/api/webhook/pix', (req,res)=>{
  try{
    const lista = req.body.pix || []; if(lista.length===0 && req.body.txid) lista.push({txid:req.body.txid});
    lista.forEach(p=>{ const txid=p.txid; console.log(`[PAGO] Webhook TXID=${txid}`); if(fila[txid]){ fila[txid].status='PAGO_LIBERAR'; } else { fila[txid]={txid, mac:'RECUPERADO', ip:'', plano:'1HORA', valor:'3.00', status:'PAGO_LIBERAR', timestamp:Date.now()}; } });
    salvar();
  }catch(e){}
  res.sendStatus(200);
});

app.get('/api/liberar-manual', (req,res)=>{ const {mac,ip,plano}=req.query; if(!mac) return res.status(400).send('mac'); const txid='MANUAL_'+Date.now(); fila[txid]={txid, mac:mac.toUpperCase(), ip:ip||'', plano:plano||'1HORA', valor:'3.00', status:'PAGO_LIBERAR', timestamp:Date.now()}; salvar(); res.send(`OK ${mac} vai liberar em 30s`); });
app.get('/api/status', (req,res)=>{ res.json({versao:VERSAO, total:Object.keys(fila).length, pendentes:Object.values(fila).filter(f=>f.status==='PENDENTE').length, pagos_para_liberar:Object.values(fila).filter(f=>f.status==='PAGO_LIBERAR').length, temEfi:!!efipay, temChavePix:!!CHAVE_PIX, chavePix:CHAVE_PIX, fila}); });
app.get('/api/limpar-fila', (req,res)=>{ fila={}; salvar(); res.send('ZERADO'); });
app.get('/api/teste', (req,res)=>{ const mac=req.query.mac||'AA:BB:CC:DD:EE:99'; const txid='TESTE'+Date.now(); fila[txid]={txid, mac, ip:'10.5.50.200', plano:req.query.plano||'1HORA', valor:'3.00', status:'PAGO_LIBERAR', timestamp:Date.now()}; salvar(); res.send(`${txid};${mac};10.5.50.200;${req.query.plano||'1HORA'}`); });

app.listen(PORT, ()=> console.log(`[SLS] ${VERSAO} porta ${PORT}`));
setInterval(()=>{ let r=0; const agora=Date.now(); for(const k in fila) if(agora-fila[k].timestamp>24*60*60*1000){ delete fila[k]; r++; } if(r){ salvar(); console.log(`[SLS] Limpeza ${r}`);} }, 60*60*1000);
