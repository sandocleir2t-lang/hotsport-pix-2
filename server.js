// SLS WIFI - v22 FIX SINCRONIA COM ROTEADOR
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

const CERT_B64 = process.env.EFI_CERT_BASE64 || process.env.EFI_CERTIFICADO_BASE64;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CHAVE_PIX = process.env.EFI_PIX_KEY || process.env.EFI_CHAVE_PIX || process.env.CHAVE_PIX || "50574099000103";
const VERSAO = "v22 FIX SINCRONIA";

let fila = {};
try { if (fs.existsSync(FILA_PATH)) fila = JSON.parse(fs.readFileSync(FILA_PATH,'utf8')); } catch(e){ fila={}; }
function salvar(){ try{ fs.writeFileSync(FILA_PATH, JSON.stringify(fila, null, 2)); }catch(e){} }

let efipay = null;
try {
  const EfiPay = require('sdk-node-apis-efi');
  const p = '/tmp/cert.p12';
  fs.writeFileSync(p, Buffer.from(CERT_B64,'base64'));
  efipay = new EfiPay({ sandbox:false, client_id:CLIENT_ID, client_secret:CLIENT_SECRET, certificate:p });
  console.log(`[EFI] REAL OK - Chave CNPJ ${CHAVE_PIX}`);
} catch(e){ console.log('[EFI] MOCK -', e.message); }

app.get('/', (req,res)=> res.send(`SLS ${VERSAO} - ${new Date().toISOString()} - Fila:${Object.keys(fila).length}`));

async function gerarPix({mac,ip,plano,valor}){
  const base = `SLS${Date.now()}${Math.random().toString(36).substring(2,12).toUpperCase()}${Math.random().toString(36).substring(2,12).toUpperCase()}`;
  const txidEnvio = base.substring(0,32);
  const valorFinal = (valor || (plano==='1HORA'?'3.00':'5.00')).toString();
  console.log(`[EFI] Gerando real TXID_ENVIO=${txidEnvio} TAM=${txidEnvio.length} VALOR=${valorFinal} MAC=${mac} PLANO=${plano}`);
  try {
    const cob = await efipay.pixCreateImmediateCharge({txid:txidEnvio}, {
      calendario:{expiracao:3600},
      devedor:{cpf:"11144477735", nome:"Cliente SLS WIFI"},
      valor:{original:parseFloat(valorFinal).toFixed(2)},
      chave:CHAVE_PIX,
      solicitacaoPagador:`SLS WIFI ${plano}`.slice(0,25)
    });
    const txidReal = cob.txid || txidEnvio;
    console.log(`[EFI] EFI RETORNOU txidReal=${txidReal} envio=${txidEnvio} loc.id=${cob.loc?.id}`);
    fila[txidReal] = { txid:txidReal, txidEnvio, mac:mac?.toUpperCase()||'SEM-MAC', ip:ip||'', plano:plano||'1HORA', valor:valorFinal, status:'PENDENTE', timestamp:Date.now(), locId:cob.loc?.id };
    salvar();
    const qrcode = await efipay.pixGenerateQRCode({id:cob.loc.id});
    console.log(`[EFI] OK real - ${txidReal} MAC=${mac}`);
    return { txid:txidReal, qrcode:qrcode.qrcode, qrcodeImagem:qrcode.imagemQrcode, valor:valorFinal };
  } catch(e){
    console.error('[EFI] Erro, fallback MOCK', e.message, e);
    const txidFallback = txidEnvio;
    fila[txidFallback] = { txid:txidFallback, mac:mac?.toUpperCase()||'SEM-MAC', ip:ip||'', plano:plano||'1HORA', valor:valorFinal, status:'PENDENTE', timestamp:Date.now() };
    salvar();
    return { txid:txidFallback, qrcode:`00020126580014BR.GOV.BCB.PIX0136${CHAVE_PIX}52040000530398654${valorFinal}5802BR5909SLS WIFI6009TERESINA62070503***6304`, valor:valorFinal, fallback:true };
  }
}

app.get('/api/gerar-qrcode', async (req,res)=>{ const r=await gerarPix(req.query); res.json(r); });
app.post('/api/criar-pix', async (req,res)=>{ const r=await gerarPix(req.body); res.json(r); });

app.post('/api/gerar-qrcode', async (req, res) => {
  try {
    const { mac, ip, valor, profile, plan } = req.body;
    const plano = profile || plan || req.body.plano || '1HORA';
    const valorFinal = (valor || 3).toString();
    const r = await gerarPix({ mac, ip, plano, valor: valorFinal });
    return res.json({ txid: r.txid, id: r.txid, brcode: r.qrcode, qrcode: r.qrcode, pixCopiaECola: r.qrcode, qrcodeImagem: r.qrcodeImagem, status: 'PENDENTE' });
  } catch (e) {
    console.error('[ERRO POST gerar-qrcode]', e.message);
    return res.status(500).json({ erro: e.message });
  }
});

// AGORA retorna também 'LIBERADO' quando o roteador ja confirmou de verdade
app.get('/api/fila', (req, res) => {
  const { txid } = req.query;
  if (txid && fila[txid]) return res.json({ txid, status: fila[txid].status, mac: fila[txid].mac, ip: fila[txid].ip, plano: fila[txid].plano });
  if (txid) return res.json({ txid, status: 'NAO_ENCONTRADO' });
  res.json(fila);
});

// O roteador so ve quem esta PAGO_LIBERAR (continua igual)
app.get('/api/liberacoes', (req,res)=>{
  const pagos = Object.values(fila).filter(f=>f.status==='PAGO_LIBERAR');
  console.log(`[SLS] Processando fila... ${pagos.length} para liberar | Total: ${Object.keys(fila).length}`);
  if(pagos.length===0) return res.type('text/plain').send('VAZIO\n');
  let txt=''; pagos.forEach(p=> txt+=`${p.txid};${p.mac};${p.ip};${p.plano}\n`);
  res.type('text/plain').send(txt);
});

// MUDANCA PRINCIPAL: em vez de apagar, marca como LIBERADO.
// O frontend fica perguntando ate ver esse status, em vez de contar tempo no escuro.
app.get('/api/liberacoes/limpar', (req,res)=>{
  const {txid}=req.query;
  if(txid && fila[txid]){
    fila[txid].status = 'LIBERADO';
    fila[txid].liberadoEm = Date.now();
    console.log(`[SLS] Confirmado LIBERADO pelo roteador TXID ${txid}`);
    salvar();
  }
  res.send('OK');
});

async function processaWebhook(req,res){
  try{
    console.log('[WEBHOOK] Body:', JSON.stringify(req.body).slice(0,800));
    let lista = req.body.pix || [];
    if(lista.length===0 && req.body.txid) lista.push(req.body);
    if(lista.length===0 && req.body.pix) lista = [req.body];
    lista.forEach(p=>{
      let txid = p.txid || p.id || '';
      console.log(`[PAGO WEBHOOK] Tentando TXID=${txid}`);
      let chave = txid;
      if(!fila[chave]){
        for(let k in fila){ if(txid && (k.includes(txid.slice(-8)) || txid.includes(k.slice(-8)))) { chave=k; break; } }
      }
      if(fila[chave]){ fila[chave].status='PAGO_LIBERAR'; console.log(`[PAGO] Marcado PAGO_LIBERAR fila ${chave}`); }
      else if(txid){ fila[txid]={txid, mac:'RECUPERADO', ip:'', plano:'1HORA', valor:'3.00', status:'PAGO_LIBERAR', timestamp:Date.now()}; }
    });
    salvar();
  }catch(e){ console.log('[WEBHOOK ERRO]', e.message); }
  res.sendStatus(200);
}

setInterval(async () => {
  try {
    const pendentes = Object.values(fila).filter(f => f.status === 'PENDENTE');
    if (pendentes.length === 0 ||!efipay) return;
    console.log(`[POLLING] Verificando ${pendentes.length} pendentes na EFI...`);
    for (const p of pendentes) {
      try {
        const detalhe = await efipay.pixDetailCharge({ txid: p.txid });
        const statusPix = detalhe.status || 'SEM_STATUS';
        const qtdPix = detalhe.pix? detalhe.pix.length : 0;
        console.log(`[POLLING] TXID=${p.txid} STATUS=${statusPix} QTD_PIX=${qtdPix}`);
        if (detalhe.status === 'CONCLUIDA' || (detalhe.pix && detalhe.pix.length > 0)) {
          console.log(`[POLLING] ACHOU PAGO! TXID=${p.txid}`);
          p.status = 'PAGO_LIBERAR';
          salvar();
        }
      } catch (e) {
        console.log(`[POLLING FALHA] TXID=${p.txid} ERRO=${e.message} | ${JSON.stringify(e).slice(0,300)}`);
      }
    }
  } catch (e) { console.log('[POLLING ERRO GERAL]', e.message); }
}, 5 * 1000);

app.post('/api/webhook', processaWebhook);
app.post('/api/webhook/pix', processaWebhook);
app.post('/webhook', processaWebhook);

app.get('/api/liberar-manual', (req,res)=>{ const {mac,ip,plano}=req.query; if(!mac) return res.status(400).send('mac'); const txid='MANUAL_'+Date.now(); fila[txid]={txid, mac:mac.toUpperCase(), ip:ip||'', plano:plano||'1HORA', valor:'3.00', status:'PAGO_LIBERAR', timestamp:Date.now()}; salvar(); res.send(`OK ${mac} vai liberar em 30s`); });
app.get('/api/status', (req,res)=>{ res.json({versao:VERSAO, total:Object.keys(fila).length, pendentes:Object.values(fila).filter(f=>f.status==='PENDENTE').length, pagos_para_liberar:Object.values(fila).filter(f=>f.status==='PAGO_LIBERAR').length, temEfi:!!efipay, temChavePix:!!CHAVE_PIX, chavePix:CHAVE_PIX, fila}); });
app.get('/api/limpar-fila', (req,res)=>{ fila={}; salvar(); res.send('ZERADO'); });
app.get('/api/teste', (req,res)=>{ const mac=req.query.mac||'AA:BB:CC:DD:EE:99'; const txid='TESTE'+Date.now()+Math.random().toString(36).substring(2,8).toUpperCase(); const txid32=txid.substring(0,32); fila={txid:txid32, mac, ip:'10.5.50.200', plano:req.query.plano||'1HORA', valor:'3.00', status:'PAGO_LIBERAR', timestamp:Date.now()}; salvar(); res.send(`${txid32};${mac};10.5.50.200;${req.query.plano||'1HORA'}`); });

app.listen(PORT, ()=> console.log(`[SLS] ${VERSAO} porta ${PORT}`));
// Limpeza agora tambem remove os LIBERADOS depois de 1h
setInterval(()=>{
  let r=0; const agora=Date.now();
  for(const k in fila){
    const f = fila[k];
    const limite = f.status==='LIBERADO' ? 60*60*1000 : 24*60*60*1000;
    const marca = f.liberadoEm || f.timestamp;
    if(agora-marca>limite){ delete fila[k]; r++; }
  }
  if(r){ salvar(); console.log(`[SLS] Limpeza ${r}`);}
}, 60*60*1000);
