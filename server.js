// server.js v18 FIX PAGAMENTO REAL + LOOP DEFINITIVO - SLS WIFI
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- PERSISTENCIA ---
let pagamentos = new Map();
let filaLiberar = [];
const ARQ_FILA = './fila.json';
const ARQ_PAG = './pagamentos.json';

function salvarFila() {
  try {
    fs.writeFileSync(ARQ_FILA, JSON.stringify(filaLiberar, null, 2));
    fs.writeFileSync(ARQ_PAG, JSON.stringify(Array.from(pagamentos.entries()), null, 2));
  } catch (e) { console.error('[SAVE ERRO]', e.message); }
}
function carregarFila() {
  try {
    if (fs.existsSync(ARQ_FILA)) filaLiberar = JSON.parse(fs.readFileSync(ARQ_FILA));
    if (fs.existsSync(ARQ_PAG)) pagamentos = new Map(JSON.parse(fs.readFileSync(ARQ_PAG)));
    console.log(`[INIT] Carregado: ${pagamentos.size} pagamentos, ${filaLiberar.length} para liberar`);
  } catch (e) { console.log('[INIT] Sem arquivos antigos, iniciando zerado'); }
}
carregarFila();

// --- MOCK / EFI CONFIG ---
let efipay = null;
try {
  const EfiPay = require('sdk-node-apis-efi');
  if (process.env.EFI_CERT_BASE64) {
    // Se usar certificado em base64 no Render
    const certPath = '/tmp/cert.p12';
    fs.writeFileSync(certPath, Buffer.from(process.env.EFI_CERT_BASE64, 'base64'));
    efipay = new EfiPay({
      sandbox: false,
      client_id: process.env.EFI_CLIENT_ID,
      client_secret: process.env.EFI_CLIENT_SECRET,
      certificate: certPath,
    });
    console.log('[EFI] Cliente EFI REAL configurado');
  }
} catch (e) { console.log('[EFI] Rodando em MOCK (sem certificado)', e.message); }

const VERSAO = "v18 FIX PAGAMENTO REAL + LOOP DEFINITIVO";

// --- CRIAR PIX ---
async function criarCobrancaPix({ mac, ip, plano, valor }) {
  const txid = 'SLS' + Date.now() + Math.floor(Math.random()*1000);
  const info = { txid, mac, ip, plano, valor: parseFloat(valor), status: 'PENDENTE', criado: new Date().toISOString() };

  let qrcode = `000201 MOCK PIX ${txid}`;
  let pixCopiaCola = qrcode;

  if (efipay) {
    try {
      const body = { calendario: { expiracao: 3600 }, devedor: { cpf: "00000000000", nome: "Cliente SLS" }, valor: { original: valor.toFixed(2) }, chave: process.env.CHAVE_PIX, solicitacaoPagador: `SLS ${plano} ${mac}` };
      const cob = await efipay.pixCreateImmediateCharge({}, body);
      qrcode = cob.qrcode;
      pixCopiaCola = cob.qrcode;
      console.log(`[EFI] PIX real OK ${txid}`);
    } catch (e) {
      console.error('[EFI ERRO]', e.message);
      // Continua no MOCK se falhar
    }
  } else {
    console.log(`[MOCK] PIX OK ${txid}`);
  }

  pagamentos.set(txid, info);
  console.log(`[FILA] Novo PENDENTE - TXID=${txid} MAC=${mac} IP=${ip} R$${valor} Plano=${plano} Total=${pagamentos.size}`);
  salvarFila();
  return { txid, qrcode, pixCopiaCola,...info };
}

app.post('/api/criar-pix', async (req,res)=>{ const r = await criarCobrancaPix(req.body); res.json(r); });
app.post('/api/gerar-qrcode', async (req,res)=>{ const r = await criarCobrancaPix(req.body); res.json(r); });

// --- WEBHOOK EFI CORRIGIDO - O CORAÇÃO DO FIX ---
app.post('/api/webhook/pix', (req, res) => {
  console.log('[WEBHOOK] Recebido EFI:', JSON.stringify(req.body).slice(0,800));
  try {
    // EFI manda { pix: [ {txid, endToEndId, valor...} ] }
    const listaPix = req.body.pix || req.body.pixRecebidos || [];
    const lista = Array.isArray(listaPix)? listaPix : [listaPix];

    lista.forEach(p => {
      if(!p.txid) return;
      const txidRecebido = p.txid;
      console.log(`[WEBHOOK] Pagamento detectado TXID=${txidRecebido} E2E=${p.endToEndId} Valor=${p.valor}`);

      const pag = pagamentos.get(txidRecebido);
      if (pag && pag.status!== 'CONCLUIDA') {
        pag.status = 'CONCLUIDA';
        pag.e2eId = p.endToEndId;
        pag.pagoEm = new Date().toISOString();
        pagamentos.set(txidRecebido, pag);

        const linha = `${pag.txid};${pag.mac};${pag.ip};${pag.plano}`;
        filaLiberar.push(linha);
        salvarFila();
        console.log(`[FILA] LIBERADO! TXID=${pag.txid} -> filaLiberar total=${filaLiberar.length} LINHA=${linha}`);
      } else if(!pag){
        console.log(`[WEBHOOK] TXID ${txidRecebido} não encontrado no Map (talvez já limpo)`);
      }
    });
  } catch (e) { console.error('[WEBHOOK ERRO]', e); }
  // SEMPRE retornar 200 pra EFI não ficar reenviando
  res.status(200).json({ ok: true });
});

// --- ENDPOINTS DO MIKROTIK ---
app.get('/api/liberacoes', (req,res)=>{
  if (filaLiberar.length === 0) {
    return res.type('text/plain').send('VAZIO\n'); // FIX LOOP v17
  }
  const linha = filaLiberar[0]; // Retorna 1 por vez
  console.log(`[SLS] Enviando para hEX: ${linha} | Restam: ${filaLiberar.length}`);
  res.type('text/plain').send(linha + '\n');
});

app.get('/api/liberacoes/limpar', (req,res)=>{
  const { txid } = req.query;
  if(!txid) return res.status(400).send('sem txid');
  const antes = filaLiberar.length;
  filaLiberar = filaLiberar.filter(l =>!l.startsWith(txid));
  // Também pode remover de pagamentos se quiser
  salvarFila();
  console.log(`[SLS] hEX confirmou TXID=${txid} | Antes:${antes} Agora:${filaLiberar.length}`);
  res.send(`OK limpo ${txid}`);
});

// --- DIAGNOSTICO E EMERGENCIA ---
app.get('/api/status', (req,res)=>{
  res.json({ versao: VERSAO, total: pagamentos.size, pendentes: Array.from(pagamentos.values()).filter(p=>p.status==='PENDENTE').length, pagos_para_liberar: filaLiberar.length, fila: filaLiberar });
});

app.get('/api/fila', (req,res)=>{
  res.json({ pagamentos: Array.from(pagamentos.values()), filaLiberar });
});

app.get('/api/limpar-fila', (req,res)=>{
  pagamentos.clear();
  filaLiberar = [];
  salvarFila();
  res.send('TUDO ZERADO - fila e pagamentos limpos');
});

app.get('/api/teste', (req,res)=>{
  const mac = req.query.mac || 'AA:BB:CC:DD:EE:99';
  const plano = req.query.plano || '1HORA';
  const txid = 'TESTE' + Date.now();
  const linha = `${txid};${mac};10.5.50.200;${plano}`;
  filaLiberar.push(linha);
  salvarFila();
  res.send(`Teste injetado: ${linha}`);
});

// NOVO: Forçar confirmação de um PIX que já foi pago mas ficou PENDENTE
app.get('/api/confirmar/:txid', (req,res)=>{
  const txid = req.params.txid;
  const pag = pagamentos.get(txid);
  if(!pag) return res.status(404).send(`TXID ${txid} não encontrado. Veja /api/fila`);
  if(pag.status === 'CONCLUIDA') return res.send(`Já está CONCLUIDA e na fila? fila=${JSON.stringify(filaLiberar)}`);
  pag.status = 'CONCLUIDA';
  pagamentos.set(txid, pag);
  const linha = `${pag.txid};${pag.mac};${pag.ip};${pag.plano}`;
  filaLiberar.push(linha);
  salvarFila();
  console.log(`[MANUAL] Forçado ${txid} para liberação`);
  res.send(`OK! Forçado ${txid} para fila. Linha: ${linha}. Aguarde 10s o hEX puxar.`);
});

app.get('/api/confirmar-todos', (req,res)=>{
  let qtd=0;
  for(let [txid, pag] of pagamentos.entries()){
    if(pag.status === 'PENDENTE'){
      pag.status = 'CONCLUIDA';
      filaLiberar.push(`${pag.txid};${pag.mac};${pag.ip};${pag.plano}`);
      qtd++;
    }
  }
  salvarFila();
  res.send(`Forçados ${qtd} pendentes para fila. Total agora: ${filaLiberar.length}`);
});

app.listen(PORT, ()=>{ console.log(`[SLS] ${VERSAO} rodando na porta ${PORT}`); });

// Loop de log a cada 20s
setInterval(()=>{ console.log(`[SLS] Processando fila... ${filaLiberar.length} para liberar | Total: ${pagamentos.size}`); }, 20000);
