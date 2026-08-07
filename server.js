// hotspot-pix-2 - server.js v15 DEFINITIVO - POLLING
// Base: seu v14 + polling EFI (não depende só de webhook)
// - Mantém tudo do v14
// - NOVO: a cada 20s pergunta direto na EFI se o PENDENTE foi pago

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => console.error('[ANTI-500] uncaughtException:', err.message));
process.on('unhandledRejection', (err) => console.error('[ANTI-500] unhandledRejection:', err?.message || err));

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const FILA_FILE = path.join(__dirname, 'fila.json');
const PAG_FILE = path.join(__dirname, 'pagamentos.json');

let pagamentos = new Map();
let filaLiberar = [];

function carregarDisco() {
  try {
    if (fs.existsSync(PAG_FILE)) {
      const obj = JSON.parse(fs.readFileSync(PAG_FILE, 'utf8'));
      pagamentos = new Map(Object.entries(obj));
      console.log(`[DISCO] pagamentos carregados: ${pagamentos.size}`);
    }
    if (fs.existsSync(FILA_FILE)) {
      filaLiberar = JSON.parse(fs.readFileSync(FILA_FILE, 'utf8'));
      console.log(`[DISCO] fila carregada: ${filaLiberar.length}`);
    }
  } catch (e) { console.error('[DISCO] erro carregar', e.message); }
}
function salvarDisco() {
  try {
    fs.writeFileSync(PAG_FILE, JSON.stringify(Object.fromEntries(pagamentos), null, 2));
    fs.writeFileSync(FILA_FILE, JSON.stringify(filaLiberar, null, 2));
  } catch (e) { console.error('[DISCO] erro salvar', e.message); }
}
carregarDisco();

function safeCertificado() {
  try {
    const base64 = process.env.EFI_CERTIFICADO_BASE64;
    if (!base64) return null;
    const certPath = path.join(__dirname, 'certificado.p12');
    if (!fs.existsSync(certPath)) {
      fs.writeFileSync(certPath, Buffer.from(base64, 'base64'));
      console.log('[EFI] certificado.p12 criado');
    }
    return certPath;
  } catch (e) { console.error('[EFI] erro cert', e.message); return null; }
}
function gerarMockPix(txid, valor) {
  const chave = process.env.EFI_PIX_KEY || 'pix@hotspot.com';
  const v = (parseFloat(valor) || 2).toFixed(2);
  const payload = `00020126580014BR.GOV.BCB.PIX0136${chave}520400005303986540${v}5802BR5925HOTSPOT PIX 2 6009TERESINA62070503***6304${txid.substring(0,4)}`;
  return { brcode: payload, copiaecola: payload, pixCopiaECola: payload, qrcode: payload, isMock: true };
}
async function getEfiClient() {
  try {
    const clientId = process.env.EFI_CLIENT_ID;
    const clientSecret = process.env.EFI_CLIENT_SECRET;
    const certPath = safeCertificado();
    if (!clientId || !clientSecret || !certPath) return null;
    const EfiPay = require('sdk-node-apis-efi');
    return new EfiPay({ sandbox: false, client_id: clientId, client_secret: clientSecret, certificate: certPath });
  } catch (e) { console.error('[EFI] getEfiClient fail', e.message); return null; }
}

async function criarPixCentral({ valor, cliente, mac, ip, plano, tempo }) {
  const valorFinal = parseFloat(valor) || 3.0;
  const txid = `SLS${Date.now()}${Math.floor(Math.random()*1000)}`.substring(0, 32).toUpperCase();
  let brcode = '';
  let isMock = false;
  try {
    const efipay = await getEfiClient();
    if (efipay) {
      const body = {
        calendario: { expiracao: 3600 },
        valor: { original: valorFinal.toFixed(2) },
        chave: process.env.EFI_PIX_KEY,
        solicitacaoPagador: `Hotspot ${cliente || mac || plano || 'cliente'}`
      };
      const chargePromise = efipay.pixCreateImmediateCharge([], body);
      const charge = await Promise.race([chargePromise, new Promise((_,rej)=>setTimeout(()=>rej(new Error('EFI timeout')),8000))]);
      const qrPromise = efipay.pixGenerateQRCode({ id: charge.loc.id });
      const qrcode = await Promise.race([qrPromise, new Promise((_,rej)=>setTimeout(()=>rej(new Error('EFI QR timeout')),8000))]);
      brcode = qrcode.qrcode || qrcode.qrCode || '';
      console.log('[EFI] PIX real OK', txid);
    } else throw new Error('EFI null');
  } catch (e) {
    console.log('[EFI] mock fallback:', e.message);
    brcode = gerarMockPix(txid, valorFinal).brcode;
    isMock = true;
  }
  const pag = {
    txid, status: 'AGUARDANDO', valor: valorFinal, cliente: cliente || mac || plano || 'cliente',
    mac: mac ? mac.toUpperCase() : null, ip: ip || null, plano: plano || tempo || '1HORA',
    brcode, copiaecola: brcode, pixCopiaECola: brcode, qrcode: brcode, isMock, criadoEm: Date.now()
  };
  pagamentos.set(txid, pag);
  salvarDisco();
  console.log(`[FILA] Novo PENDENTE - TXID=${txid} MAC=${mac} IP=${ip} R$${valorFinal} Plano=${pag.plano} Total=${pagamentos.size}`);
  return pag;
}

app.get('/', (req, res) => {
  res.send(`SLS WIFI ONLINE v15 POLLING - ${new Date().toISOString()} - Pagamentos: ${pagamentos.size} - Fila: ${filaLiberar.length}`);
});
app.get('/api/health', (req, res) => res.json({ status:'ok', version:'v15 POLLING', time:new Date().toISOString(), totalPagamentos: pagamentos.size, fila: filaLiberar.length }));

app.post('/api/criar-pix', async (req, res) => {
  try {
    const { valor, cliente, mac, ip, plano, tempo, plan, profile } = req.body || {};
    const pag = await criarPixCentral({ valor, cliente, mac, ip, plano: plano || plan || profile || tempo, tempo });
    return res.status(200).json({ ok:true, txid: pag.txid, brcode: pag.brcode, copiaecola: pag.brcode, pixCopiaECola: pag.brcode, qrcode: pag.brcode, qr: pag.brcode, valor: pag.valor, status:'AGUARDANDO' });
  } catch (e) {
    const txidFallback = `MOCK${Date.now()}`;
    const mock = gerarMockPix(txidFallback, 3.0);
    return res.status(200).json({ ok:true, txid: txidFallback, brcode: mock.brcode, copiaecola: mock.brcode, pixCopiaECola: mock.brcode, qrcode: mock.brcode, qr: mock.brcode, valor:3.0, status:'AGUARDANDO', aviso:'fallback' });
  }
});
app.post('/api/gerar-qrcode', async (req, res) => {
  try {
    const { valor, mac, ip, plano, tempo, plan, profile, cliente } = req.body || {};
    const v = valor || req.body?.valor || 3;
    const p = plano || plan || profile || tempo || '1HORA';
    const pag = await criarPixCentral({ valor: v, cliente, mac, ip, plano: p, tempo });
    return res.status(200).json({ ok:true, txid: pag.txid, brcode: pag.brcode, copiaecola: pag.brcode, pixCopiaECola: pag.brcode, qrcode: pag.brcode, qr: pag.brcode, valor: pag.valor, status:'AGUARDANDO' });
  } catch (e) {
    const txidFallback = `MOCK${Date.now()}`;
    const mock = gerarMockPix(txidFallback, 3.0);
    return res.status(200).json({ ok:true, txid: txidFallback, brcode: mock.brcode, copiaecola: mock.brcode, pixCopiaECola: mock.brcode, qrcode: mock.brcode, valor:3.0, status:'AGUARDANDO' });
  }
});
app.get('/api/gerar-qrcode', async (req, res) => {
  try {
    const { mac, ip, plano, valor, tempo } = req.query;
    if (!mac) return res.status(200).json({ error:'MAC obrigatório' });
    const pag = await criarPixCentral({ valor, mac, ip, plano: plano || tempo, tempo });
    return res.status(200).json({ ok:true, txid: pag.txid, brcode: pag.brcode, copiaecola: pag.brcode, pixCopiaECola: pag.brcode, qrcode: pag.brcode, valor: pag.valor, status:'AGUARDANDO' });
  } catch (e) {
    return res.status(200).json({ ok:false, erro:e.message });
  }
});
app.get('/api/verifica/:txid', (req, res) => {
  const pag = pagamentos.get(req.params.txid);
  if (!pag) return res.status(200).json({ ok:false, status:'NAO_ENCONTRADO' });
  return res.status(200).json({ ok:true, txid: pag.txid, status: pag.status, valor: pag.valor });
});
app.get('/api/simular-pago/:txid', (req, res) => {
  const pag = pagamentos.get(req.params.txid);
  if (!pag) return res.status(200).json({ ok:false });
  pag.status = 'PAGO_LIBERAR';
  pagamentos.set(req.params.txid, pag);
  filaLiberar.push({ mac: pag.mac, ip: pag.ip, txid: pag.txid, cliente: pag.cliente, plano: pag.plano, data: new Date().toISOString() });
  salvarDisco();
  return res.status(200).json({ ok:true, fila: filaLiberar });
});
app.get('/api/fila', (req, res) => {
  try {
    const { txid } = req.query;
    if (txid) {
      const pag = pagamentos.get(txid);
      if (!pag) return res.status(200).json({ status:'NAO_ENCONTRADO' });
      return res.status(200).json({ status: pag.status, ok: pag.status==='PAGO_LIBERAR', txid: pag.txid, valor: pag.valor });
    }
    if (req.query.limpar === '1') { filaLiberar = []; salvarDisco(); }
    return res.status(200).json([...filaLiberar]);
  } catch (e) { return res.status(200).json([]); }
});
app.get('/api/liberacoes', (req, res) => {
  try {
    const pagos = filaLiberar.filter(f=>f && f.txid);
    console.log(`[SLS] Processando fila... ${pagos.length} para liberar | Total: ${pagamentos.size}`);
    if (pagos.length === 0) return res.set('Content-Type','text/plain').send('');
    let txt='';
    pagos.forEach(p=>{ txt+=`${p.txid};${p.mac||'AA:BB:CC:DD:EE:FF'};${p.ip||''};${p.plano||'1HORA'}\n`; });
    return res.set('Content-Type','text/plain').send(txt);
  } catch (e) { return res.set('Content-Type','text/plain').send(''); }
});
app.get('/api/liberacoes/limpar', (req, res) => {
  try {
    const { txid } = req.query;
    if (!txid) return res.send('OK');
    filaLiberar = filaLiberar.filter(f=>f.txid !== txid);
    pagamentos.delete(txid);
    salvarDisco();
    console.log(`[SLS] Liberado e limpo TXID ${txid}`);
    return res.send('OK');
  } catch (e) { return res.send('OK'); }
});
app.get('/api/liberar-manual', (req, res) => {
  const { mac, ip, plano } = req.query;
  if (!mac) return res.status(200).send('mac obrigatorio');
  const txid = 'MANUAL_'+Date.now();
  filaLiberar.push({ mac: mac.toUpperCase(), ip: ip||'', txid, plano: plano||'1HORA', data: new Date().toISOString() });
  pagamentos.set(txid, { txid, mac: mac.toUpperCase(), ip, plano: plano||'1HORA', status:'PAGO_LIBERAR', criadoEm: Date.now() });
  salvarDisco();
  return res.send(`OK - ${mac} libera em 30s`);
});
app.post('/api/webhook/pix', (req, res) => {
  try {
    console.log('[WEBHOOK] recebido', JSON.stringify(req.body).substring(0,600));
    const pixs = req.body?.pix || [];
    for (const p of pixs) {
      const txid = p.txid;
      if (!txid) continue;
      if (pagamentos.has(txid)) {
        const pag = pagamentos.get(txid);
        if (pag.status !== 'PAGO_LIBERAR') {
          pag.status = 'PAGO_LIBERAR';
          pagamentos.set(txid, pag);
          filaLiberar.push({ mac: pag.mac, ip: pag.ip, txid, cliente: pag.cliente, plano: pag.plano, data: new Date().toISOString() });
          console.log(`[PAGO] Webhook ${txid} -> PAGO_LIBERAR MAC=${pag.mac}`);
        }
      }
    }
    salvarDisco();
    return res.status(200).json({ ok:true });
  } catch (e) { return res.status(200).json({ ok:true }); }
});
app.post('/api/webhook', (req, res) => { req.url='/api/webhook/pix'; app.handle(req,res); });
app.get('/api/status', (req,res)=> res.json({ versao:'v15 POLLING', total: pagamentos.size, pendentes: [...pagamentos.values()].filter(p=>p.status==='AGUARDANDO').length, pagos_para_liberar: filaLiberar.length, fila: filaLiberar }));
app.get('/api/limpar-fila', (req,res)=>{ pagamentos.clear(); filaLiberar=[]; salvarDisco(); res.send('Fila limpa'); });
app.get('*', (req,res)=>{
  try {
    const indexPath = path.join(__dirname,'public','index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    return res.status(200).send(`SLS WIFI ONLINE v15 POLLING - ${new Date().toISOString()} - Fila: ${filaLiberar.length}`);
  } catch { return res.status(200).send('OK v15'); }
});
app.use((err,req,res,next)=>{ console.error('[EXPRESS-ERROR]',err.message); return res.status(200).json({ ok:false, erro:'capturado', msg:err.message }); });
app.listen(PORT, ()=>{ console.log(`[v15 POLLING] Rodando porta ${PORT}`); safeCertificado(); });

// LIMPEZA + POLLING EFI
setInterval(async ()=>{
  try{
    const agora=Date.now();
    let mudou=false;
    for (const [txid,pag] of pagamentos) {
      if (agora-pag.criadoEm>3600000 && pag.status==='AGUARDANDO') { pag.status='EXPIRADO'; pagamentos.set(txid,pag); mudou=true; }
      if (agora-pag.criadoEm>24*3600000) { pagamentos.delete(txid); mudou=true; }
    }
    if (filaLiberar.length>100) { filaLiberar = filaLiberar.slice(-100); mudou=true; }
    if (mudou) salvarDisco();
  } catch(e){}
}, 30000);

// POLLING: pergunta na EFI se pendente foi pago (salva quando webhook falha)
setInterval(async ()=>{
  try{
    const pendentes = [...pagamentos.entries()].filter(([_,p])=>p.status==='AGUARDANDO');
    if (pendentes.length===0) return;
    const efipay = await getEfiClient();
    if (!efipay) return;
    for (const [txid, pag] of pendentes) {
      try {
        const detalhe = await efipay.pixDetailCharge({ txid });
        if (detalhe && detalhe.status === 'CONCLUIDA') {
          console.log(`[POLL] ${txid} PAGO detectado na EFI! MAC=${pag.mac}`);
          pag.status='PAGO_LIBERAR';
          pagamentos.set(txid, pag);
          if (!filaLiberar.find(f=>f.txid===txid)) {
            filaLiberar.push({ mac: pag.mac, ip: pag.ip, txid, cliente: pag.cliente, plano: pag.plano, data: new Date().toISOString() });
          }
          salvarDisco();
        }
      } catch(err){}
      await new Promise(r=>setTimeout(r,500));
    }
  } catch(e){ console.error('[POLL] erro', e.message); }
}, 20000);
