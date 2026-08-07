// hotspot-pix-2 - server.js v14 DEFINITIVO - UNIFICADO
// Base: seu v13.4 ANTI-500 + correções do histórico do dia
// - Mantém: QR real EFI + mock, brcode, copiaecola, pixCopiaECola, /api/criar-pix, /api/fila, /api/webhook/pix
// - Corrige: adiciona /api/gerar-qrcode (GET e POST) que faltava pro login.html/index.html
// - Corrige: /api/fila?txid= retorna {status} pro polling, sem limpar fila antes
// - Adiciona: /api/liberacoes (texto puro) + /api/liberacoes/limpar pro seu SLS-LIBERA-v11 do hEX não travar
// - Adiciona: persistência em disco fila.json + pagamentos.json (não perde SLS46069442D9 quando Render reinicia)
// - Anti-bug: timeout EFI, nunca retorna 500, Winbox não congela

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

// --- MEMÓRIA + DISCO ---
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

// --- HELPERS EFI ---
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

// Função central de criar PIX (usada por /criar-pix e /gerar-qrcode)
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
      // timeout de 8s pra não travar QR
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

// --- ROTAS COMPATIBILIDADE ---
app.get('/', (req, res) => {
  res.send(`SLS WIFI ONLINE v14 DEFINITIVO - ${new Date().toISOString()} - Pagamentos: ${pagamentos.size} - Fila: ${filaLiberar.length}`);
});
app.get('/api/health', (req, res) => res.json({ status:'ok', version:'v14 DEFINITIVO', time:new Date().toISOString(), totalPagamentos: pagamentos.size, fila: filaLiberar.length }));

// ROTA ORIGINAL v13.4
app.post('/api/criar-pix', async (req, res) => {
  try {
    const { valor, cliente, mac, ip, plano, tempo, plan, profile } = req.body || {};
    const pag = await criarPixCentral({ valor, cliente, mac, ip, plano: plano || plan || profile || tempo, tempo });
    return res.status(200).json({ ok:true, txid: pag.txid, brcode: pag.brcode, copiaecola: pag.brcode, pixCopiaECola: pag.brcode, qrcode: pag.brcode, qr: pag.brcode, valor: pag.valor, status:'AGUARDANDO' });
  } catch (e) {
    console.error('[CRIAR-PIX] erro', e.message);
    const txidFallback = `MOCK${Date.now()}`;
    const mock = gerarMockPix(txidFallback, 3.0);
    return res.status(200).json({ ok:true, txid: txidFallback, brcode: mock.brcode, copiaecola: mock.brcode, pixCopiaECola: mock.brcode, qrcode: mock.brcode, qr: mock.brcode, valor:3.0, status:'AGUARDANDO', aviso:'fallback' });
  }
});

// ROTA QUE SEU login.html e index.html CHAMAM - faltava!
app.post('/api/gerar-qrcode', async (req, res) => {
  try {
    // aceita tanto body do index.html quanto do login.html
    const { valor, mac, ip, plano, tempo, plan, profile, cliente } = req.body || {};
    const v = valor || req.body?.valor || 3;
    const p = plano || plan || profile || tempo || '1HORA';
    const pag = await criarPixCentral({ valor: v, cliente, mac, ip, plano: p, tempo });
    return res.status(200).json({ ok:true, txid: pag.txid, brcode: pag.brcode, copiaecola: pag.brcode, pixCopiaECola: pag.brcode, qrcode: pag.brcode, qr: pag.brcode, valor: pag.valor, status:'AGUARDANDO' });
  } catch (e) {
    console.error('[GERAR-QRCODE POST] erro', e.message);
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
  try {
    const pag = pagamentos.get(req.params.txid);
    if (!pag) return res.status(200).json({ ok:false, status:'NAO_ENCONTRADO' });
    return res.status(200).json({ ok:true, txid: pag.txid, status: pag.status, valor: pag.valor });
  } catch (e) { return res.status(200).json({ ok:false, status:'ERRO' }); }
});

app.get('/api/simular-pago/:txid', (req, res) => {
  const pag = pagamentos.get(req.params.txid);
  if (!pag) return res.status(200).json({ ok:false });
  pag.status = 'PAGO_LIBERAR';
  pagamentos.set(req.params.txid, pag);
  filaLiberar.push({ mac: pag.mac, ip: pag.ip, txid: pag.txid, cliente: pag.cliente, plano: pag.plano, data: new Date().toISOString() });
  salvarDisco();
  console.log(`[PAGO] Simulado ${pag.txid} MAC=${pag.mac}`);
  return res.status(200).json({ ok:true, fila: filaLiberar });
});

// FILA - Para frontend polling E para MikroTik
app.get('/api/fila', (req, res) => {
  try {
    const { txid } = req.query;
    if (txid) {
      // Polling do login.html/index.html - NÃO limpa fila aqui
      const pag = pagamentos.get(txid);
      if (!pag) return res.status(200).json({ status:'NAO_ENCONTRADO' });
      return res.status(200).json({ status: pag.status, ok: pag.status==='PAGO_LIBERAR', txid: pag.txid, valor: pag.valor });
    }
    // Sem txid = MikroTik ou debug - retorna array de pagos
    const apenasPagos = [...filaLiberar];
    // Só limpa se chamado com ?limpar=1 (compatibilidade)
    if (req.query.limpar === '1') { filaLiberar = []; salvarDisco(); }
    return res.status(200).json(apenasPagos);
  } catch (e) { return res.status(200).json([]); }
});

// COMPATIBILIDADE COM SEU SLS-LIBERA-v11 (texto puro)
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
    const pag = pagamentos.get(txid);
    if (pag) { pagamentos.delete(txid); }
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

// Webhooks EFI
app.post('/api/webhook/pix', (req, res) => {
  try {
    console.log('[WEBHOOK] recebido', JSON.stringify(req.body).substring(0,600));
    const pixs = req.body?.pix || [];
    for (const p of pixs) {
      const txid = p.txid;
      if (!txid) continue;
      if (pagamentos.has(txid)) {
        const pag = pagamentos.get(txid);
        pag.status = 'PAGO_LIBERAR';
        pagamentos.set(txid, pag);
        filaLiberar.push({ mac: pag.mac, ip: pag.ip, txid, cliente: pag.cliente, plano: pag.plano, data: new Date().toISOString() });
        console.log(`[PAGO] Webhook ${txid} -> PAGO_LIBERAR MAC=${pag.mac}`);
      } else {
        // Recupera pagamento perdido (caso SLS46069442D9)
        console.log(`[PAGO] TXID ${txid} NAO ENCONTRADO, criando recuperação`);
        filaLiberar.push({ mac: 'RECUPERAR_MANUAL', ip:'', txid, data: new Date().toISOString(), plano:'1HORA' });
        pagamentos.set(txid, { txid, status:'PAGO_LIBERAR', criadoEm: Date.now(), recuperado:true });
      }
    }
    salvarDisco();
    return res.status(200).json({ ok:true });
  } catch (e) { return res.status(200).json({ ok:true }); }
});
app.post('/api/webhook', (req, res) => { req.url='/api/webhook/pix'; app.handle(req,res); });

app.get('/api/status', (req,res)=> res.json({ versao:'v14 DEFINITIVO', total: pagamentos.size, pendentes: [...pagamentos.values()].filter(p=>p.status==='AGUARDANDO').length, pagos_para_liberar: filaLiberar.length, fila: filaLiberar }));

app.get('*', (req,res)=>{
  try {
    const indexPath = path.join(__dirname,'public','index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    return res.status(200).send(`SLS WIFI ONLINE v14 DEFINITIVO - ${new Date().toISOString()} - Fila: ${filaLiberar.length}`);
  } catch { return res.status(200).send('OK v14'); }
});

app.use((err,req,res,next)=>{ console.error('[EXPRESS-ERROR]',err.message); return res.status(200).json({ ok:false, erro:'capturado', msg:err.message }); });

app.listen(PORT, ()=>{ console.log(`[v14 DEFINITIVO] Rodando porta ${PORT}`); safeCertificado(); });

setInterval(()=>{
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
