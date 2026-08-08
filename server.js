// server.js v19 QR VALIDO + FIX PAGAMENTO REAL + FIX LOOP DEFINITIVO - SLS WIFI
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let pagamentos = new Map();
let filaLiberar = [];
const ARQ_FILA = './fila.json';
const ARQ_PAG = './pagamentos.json';

function salvarFila() {
  try {
    fs.writeFileSync(ARQ_FILA, JSON.stringify(filaLiberar, null, 2));
    fs.writeFileSync(ARQ_PAG, JSON.stringify(Array.from(pagamentos.entries()), null, 2));
  } catch (e) {}
}
function carregarFila() {
  try {
    if (fs.existsSync(ARQ_FILA)) filaLiberar = JSON.parse(fs.readFileSync(ARQ_FILA));
    if (fs.existsSync(ARQ_PAG)) pagamentos = new Map(JSON.parse(fs.readFileSync(ARQ_PAG)));
    console.log(`[INIT] Carregado: ${pagamentos.size} pagamentos, ${filaLiberar.length} p/ liberar`);
  } catch (e) {}
}
carregarFila();

// --- EFI SETUP ---
let efipay = null;
try {
  const EfiPay = require('sdk-node-apis-efi');
  if (process.env.EFI_CERT_BASE64 && process.env.EFI_CLIENT_ID) {
    const certPath = '/tmp/cert.p12';
    fs.writeFileSync(certPath, Buffer.from(process.env.EFI_CERT_BASE64, 'base64'));
    efipay = new EfiPay({
      sandbox: false,
      client_id: process.env.EFI_CLIENT_ID,
      client_secret: process.env.EFI_CLIENT_SECRET,
      certificate: certPath,
    });
    console.log('[EFI] Cliente EFI REAL configurado');
  } else {
    console.log('[EFI] Sem ENV EFI - Rodando em MOCK VALIDO');
  }
} catch (e) { console.log('[EFI] MOCK VALIDO - erro sdk', e.message); }

const VERSAO = "v19 QR VALIDO + FIX REAL + LOOP DEFINITIVO";

// --- GERADOR DE PIX VALIDO COM CRC16 - CORRIGE SEU ERRO DA CAIXA ---
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000)!== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function geraPixValido({ txid, valor, chave }) {
  const chavePix = (chave || process.env.CHAVE_PIX || '').replace(/[^a-zA-Z0-9@.\-]/g,'');
  const nome = "SLS WIFI";
  const cidade = "PICOS";
  const v = parseFloat(valor).toFixed(2);

  function tlv(id, value) { return id + String(value.length).padStart(2,'0') + value; }

  const gui = tlv("00","BR.GOV.BCB.PIX");
  const key = tlv("01", chavePix || "00000000000");
  const desc = tlv("02", `SLS ${txid.slice(-8)}`);
  const merchantAccount = tlv("26", gui + key + desc);

  let payload = "000201" + merchantAccount + tlv("52","0000") + tlv("53","986") + tlv("54", v) + tlv("58","BR") + tlv("59", nome) + tlv("60", cidade) + tlv("62", tlv("05", txid.slice(0,25))) + "6304";
  payload += crc16(payload);
  return payload;
}

async function criarCobrancaPix({ mac, ip, plano, valor }) {
  const txid = 'SLS' + Date.now() + Math.floor(Math.random()*1000);
  const val = parseFloat(valor) || 3.00;
  const info = { txid, mac, ip, plano, valor: val, status: 'PENDENTE', criado: new Date().toISOString() };
  let pixCopiaCola = '';

  if (efipay) {
    try {
      const body = {
        calendario: { expiracao: 3600 },
        devedor: { cpf: "12345678909", nome: "Cliente SLS" },
        valor: { original: val.toFixed(2) },
        chave: process.env.CHAVE_PIX,
        solicitacaoPagador: `${plano} ${mac}`.slice(0,25)
      };
      const cob = await efipay.pixCreateImmediateCharge({ txid: txid.substring(0,32) }, body);
      pixCopiaCola = cob.qrcode || cob.pixCopiaECola;
      console.log(`[EFI] PIX real OK ${txid}`);
    } catch (e) {
      console.error('[EFI ERRO]', e.message || e);
      pixCopiaCola = geraPixValido({ txid, valor: val, chave: process.env.CHAVE_PIX });
      console.log(`[MOCK VALIDO] Fallback gerado ${txid}`);
    }
  } else {
    pixCopiaCola = geraPixValido({ txid, valor: val, chave: process.env.CHAVE_PIX });
    console.log(`[MOCK VALIDO] PIX OK ${txid} CHAVE=${(process.env.CHAVE_PIX||'VAZIA').slice(0,10)}...`);
  }

  pagamentos.set(txid, info);
  console.log(`[FILA] Novo PENDENTE - TXID=${txid} MAC=${mac} IP=${ip} R$${val} Plano=${plano} Total=${pagamentos.size}`);
  salvarFila();
  return { txid, qrcode: pixCopiaCola, pixCopiaCola,...info };
}

app.post('/api/criar-pix', async (req,res)=>{ const r = await criarCobrancaPix(req.body); res.json(r); });
app.post('/api/gerar-qrcode', async (req,res)=>{ const r = await criarCobrancaPix(req.body); res.json(r); });

app.post('/api/webhook/pix', (req, res) => {
  console.log('[WEBHOOK] Recebido:', JSON.stringify(req.body).slice(0,800));
  try {
    const listaPix = req.body.pix || req.body.pixRecebidos || [];
    const lista = Array.isArray(listaPix)? listaPix : [listaPix];
    lista.forEach(p => {
      if(!p.txid) return;
      const pag = pagamentos.get(p.txid);
      if (pag && pag.status!== 'CONCLUIDA') {
        pag.status = 'CONCLUIDA';
        pag.e2eId = p.endToEndId;
        pagamentos.set(p.txid, pag);
        const linha = `${pag.txid};${pag.mac};${pag.ip};${pag.plano}`;
        filaLiberar.push(linha);
        salvarFila();
        console.log(`[FILA] LIBERADO! TXID=${pag.txid} -> fila=${filaLiberar.length}`);
      }
    });
  } catch (e) { console.error('[WEBHOOK ERRO]', e); }
  res.status(200).json({ ok: true });
});

app.get('/api/liberacoes', (req,res)=>{
  if (filaLiberar.length === 0) return res.type('text/plain').send('VAZIO\n');
  const linha = filaLiberar[0];
  console.log(`[SLS] Enviando p/ hEX: ${linha} | Restam:${filaLiberar.length}`);
  res.type('text/plain').send(linha + '\n');
});

app.get('/api/liberacoes/limpar', (req,res)=>{
  const { txid } = req.query;
  if(!txid) return res.status(400).send('sem txid');
  const antes = filaLiberar.length;
  filaLiberar = filaLiberar.filter(l =>!l.startsWith(txid));
  salvarFila();
  console.log(`[SLS] hEX confirmou TXID=${txid} Antes:${antes} Agora:${filaLiberar.length}`);
  res.send(`OK limpo ${txid}`);
});

app.get('/api/status', (req,res)=>{
  res.json({ versao: VERSAO, total: pagamentos.size, pendentes: Array.from(pagamentos.values()).filter(p=>p.status==='PENDENTE').length, pagos_para_liberar: filaLiberar.length, fila: filaLiberar, temEfi:!!efipay, temChavePix:!!process.env.CHAVE_PIX });
});

app.get('/api/fila', (req,res)=>{ res.json({ pagamentos: Array.from(pagamentos.values()), filaLiberar }); });
app.get('/api/limpar-fila', (req,res)=>{ pagamentos.clear(); filaLiberar=[]; salvarFila(); res.send('ZERADO'); });
app.get('/api/teste', (req,res)=>{ const mac=req.query.mac||'AA:BB:CC:DD:EE:99'; const plano=req.query.plano||'1HORA'; const txid='TESTE'+Date.now(); const linha=`${txid};${mac};10.5.50.200;${plano}`; filaLiberar.push(linha); salvarFila(); res.send(`Teste injetado: ${linha}`); });
app.get('/api/confirmar/:txid', (req,res)=>{ const txid=req.params.txid; const pag=pagamentos.get(txid); if(!pag) return res.status(404).send('TXID nao achado'); pag.status='CONCLUIDA'; pagamentos.set(txid,pag); const linha=`${pag.txid};${pag.mac};${pag.ip};${pag.plano}`; filaLiberar.push(linha); salvarFila(); res.send(`Forcado ${txid} -> ${linha}`); });
app.get('/api/confirmar-todos', (req,res)=>{ let qtd=0; for(let [txid,pag] of pagamentos.entries()){ if(pag.status==='PENDENTE'){ pag.status='CONCLUIDA'; filaLiberar.push(`${pag.txid};${pag.mac};${pag.ip};${pag.plano}`); qtd++; } } salvarFila(); res.send(`Forcados ${qtd} para fila. Total: ${filaLiberar.length}`); });

app.listen(PORT, ()=>{ console.log(`[SLS] ${VERSAO} rodando porta ${PORT}`); });
setInterval(()=>{ console.log(`[SLS] Processando fila... ${filaLiberar.length} para liberar | Total: ${pagamentos.size}`); }, 20000);
