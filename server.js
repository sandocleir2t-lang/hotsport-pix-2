const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===== FIX v12.1: /tmp tem permissão no Render =====
const LIB_FILE_TMP = '/tmp/liberacoes.json';
const FILA_FILE_TMP = '/tmp/fila.json';
const LIB_FILE_SRC = path.join(__dirname, 'liberacoes.json');
let liberacoes = [];
let fila = [];

try {
  if (fs.existsSync(LIB_FILE_TMP)) {
    liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_TMP, 'utf8') || '[]');
    fila = [...liberacoes];
    console.log('FILA CARREGADA TMP', fila.length);
  } else if (fs.existsSync(FILA_FILE_TMP)) {
    fila = JSON.parse(fs.readFileSync(FILA_FILE_TMP, 'utf8') || '[]');
    liberacoes = [...fila];
    console.log('FILA CARREGADA FILA TMP', fila.length);
  } else if (fs.existsSync(LIB_FILE_SRC)) {
    liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_SRC, 'utf8') || '[]');
    fila = [...liberacoes];
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes));
    fs.writeFileSync(FILA_FILE_TMP, JSON.stringify(fila));
  }
} catch (e) { console.log('FILA VAZIA INICIAL', e.message); liberacoes=[]; fila=[]; }

function salvarLibs() {
  try {
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes, null, 2));
    fs.writeFileSync(FILA_FILE_TMP, JSON.stringify(fila, null, 2));
    fs.writeFileSync(LIB_FILE_SRC, JSON.stringify(liberacoes, null, 2));
    console.log('FILA SALVA', fila.length, 'LIBERACOES', liberacoes.length);
  } catch(e){ console.log('ERRO SALVAR', e.message); }
}

// ===== EFI CERT =====
const CERT_PATH_TMP = '/tmp/hotspot-producao.p12';
let efi = null;
function garanteCertificado(){
  try {
    // tenta base64 primeiro (v12.1)
    const b64 = process.env.EFI_CERTIFICADO_BASE64;
    if (b64) {
      fs.writeFileSync(CERT_PATH_TMP, Buffer.from(b64.replace(/\s/g,''),'base64'));
      console.log('CERT OK BASE64');
      return CERT_PATH_TMP;
    }
    // tenta pasta certs (v12.4)
    const certDir = path.join(__dirname, 'certs');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
    let certPath = null;
    const possible = fs.existsSync(certDir) ? fs.readdirSync(certDir).find(f => f.endsWith('.p12')) : null;
    if (possible) {
      const src = path.join(certDir, possible);
      certPath = path.join('/tmp', possible);
      if (!fs.existsSync(certPath)) fs.copyFileSync(src, certPath);
      console.log('CERT OK ARQUIVO', possible);
      return certPath;
    }
  } catch(err){ console.log('CERT ERROR', err.message); }
  return null;
}
const certFinal = garanteCertificado();
try {
  if (certFinal) {
    const options = { 
      sandbox: false, 
      client_id: process.env.EFI_CLIENT_ID, 
      client_secret: process.env.EFI_CLIENT_SECRET, 
      certificate: certFinal,
      certificado: certFinal,
      pixCert: certFinal,
      cert_base64: false 
    };
    efi = new EfiPay(options);
    console.log('EFI CONFIGURADO');
  } else {
    console.log('SEM CERTIFICADO - EFI NAO CONFIGURADO');
  }
} catch(err){ console.log('EFI INIT ERROR', err.message); }

console.log('SLS v12.5 FINAL MERGE - v12.1 TMP FIX + v12.4 MAC FIX');

// ===== ROTAS COMPATIBILIDADE =====
app.get('/api/liberacoes', (req, res) => { console.log('GET /api/liberacoes', fila.length); res.json(fila.filter(f=>f.status==='PAGO_LIBERAR' || f.mac) ); });
app.get('/fila', (req, res) => { console.log('GET /fila', fila.length); res.json(fila); });
app.get('/api/fila', (req, res) => { console.log('GET /api/fila', fila.length); res.json(fila); });

app.get('/api/liberacoes/limpar', (req, res) => {
  liberacoes = []; fila=[]; salvarLibs();
  res.send('LIBERACOES LIMPAS!');
});

// ===== FUNCAO SEGURA v12.4 - NAO CRIA LIXO NO HEX =====
function liberaPorTxid(detail) {
  try {
    const macInfo = detail.infoAdicionais?.find(i => i.nome === 'MAC' || i.nome === 'mac')?.valor;
    const tempoInfo = detail.infoAdicionais?.find(i => i.nome === 'TEMPO' || i.nome === 'tempo')?.valor || detail.tempo || 60;
    const ipInfo = detail.infoAdicionais?.find(i => i.nome === 'IP' || i.nome === 'ip')?.valor || '';
    
    // FIX v12.4: Se nao tem MAC valido, NAO libera, mas NAO quebra o QR
    if (!macInfo || macInfo === 'semmac' || macInfo.toLowerCase().includes('00:00:00') || macInfo.length > 18 || macInfo.length < 12) {
      console.log(`PIX PAGO MAS SEM MAC VALIDO - NAO LIBERANDO NA FILA (evita lixo). TXID ${detail.txid} mac=${macInfo}`);
      // ainda marca como pago na fila antiga pra debug, mas nao libera no mikrotik
      let it = fila.find(f=>f.txid===detail.txid);
      if(it) it.status='PAGO_SEM_MAC';
      salvarLibs();
      return null;
    }
    liberacoes = liberacoes.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase());
    fila = fila.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase() && l.txid !== detail.txid);
    
    const novo = { mac: macInfo, ip: ipInfo, tempo: tempoInfo, data: Date.now(), txid: detail.txid, status: 'PAGO_LIBERAR' };
    liberacoes.push(novo);
    fila.push(novo);
    salvarLibs();
    console.log(`PIX PAGO DETECTADO - LIBERADO ${macInfo} ${tempoInfo} via TXID ${detail.txid}`);
    return macInfo;
  } catch (e) { 
    console.log('ERRO liberaPorTxid', e.message);
    return null; 
  }
}

// ===== GERAR PIX - COMPATIVEL COM /gerar E /criar-pix =====
async function handlerGerarPix(req, res){
  try {
    const { valor, tempo, mac, ip } = req.body;
    console.log(`GERAR PIX valor=${valor} tempo=${tempo} mac=${mac} ip=${ip} rota=${req.path}`);
    const valorNum = Number(valor);
    if (!efi) {
      console.log('ERRO: EFI nao configurado - verifique certs/*.p12 e EFI_CLIENT_ID');
      return res.status(500).json({ erro: 'EFI nao configurado - sem certificado', error: 'EFI nao configurado' });
    }
    const body = {
      calendario: { expiracao: 3600 },
      devedor: { cpf: '12345678909', nome: 'Cliente SLS WIFI' },
      valor: { original: valorNum.toFixed(2) },
      chave: process.env.EFI_PIX_KEY || process.env.EFI_CHAVE_PIX,
      solicitacaoPagador: `SLS WIFI ${tempo} - ${mac}`,
      infoAdicionais: [
        { nome: 'MAC', valor: mac || 'semmac' }, 
        { nome: 'IP', valor: ip || '' }, 
        { nome: 'TEMPO', valor: String(tempo || '') }
      ]
    };
    const charge = await efi.pixCreateImmediateCharge({}, body);
    const qrcode = await efi.pixGenerateQRCode({ id: charge.loc.id });
    
    // salva na fila pra /fila nao ficar vazia (fix v12.1)
    fila.push({ txid: charge.txid, tempo: tempo, valor: valor, mac: mac||'semmac', status: 'AGUARDANDO', data: Date.now() });
    salvarLibs();
    
    console.log(`QR GERADO OK TXID ${charge.txid}`);
    return res.json({ 
      txid: charge.txid, 
      qrcode: qrcode.qrcode, 
      copiaecola: qrcode.qrcode, 
      copia_e_cola: qrcode.qrcode,
      imagem: qrcode.imagemQrcode,
      imagemQrcode: qrcode.imagemQrcode
    });
  } catch (err) {
    console.error('ERRO GERAR PIX', err);
    return res.status(500).json({ erro: err.message, error: 'ERRO GERAR PIX', detalhe: err.message });
  }
}
app.post('/gerar', handlerGerarPix);
app.post('/criar-pix', handlerGerarPix); // <-- compatibilidade com front v12.1

// ===== VOUCHER =====
app.post('/api/gerar-voucher', (req, res) => {
  try {
    const { tempo, qtd } = req.body;
    const quantidade = Number(qtd) || 1;
    const tempoFinal = tempo || 'EVENTO';
    const vouchers = [];
    for (let i = 0; i < quantidade; i++) {
      const codigo = 'SLS-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      vouchers.push({ user: codigo, senha: codigo, perfil: tempoFinal, codigo });
    }
    console.log(`VOUCHER GERADO ${quantidade}x ${tempoFinal}`);
    return res.json({ ok: true, vouchers });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== VERIFICA STATUS - COMPATIVEL =====
async function handlerVerifica(req,res){
  try {
    const { txid } = req.params;
    console.log('STATUS CHECK', txid, 'rota', req.path);
    const detail = await efi.pixDetailCharge({ txid });
    const status = detail.status || 'ATIVA';
    console.log(`STATUS TXID ${txid}: ${status}`);
    if (status === 'CONCLUIDA') {
      const macLiberado = liberaPorTxid(detail);
      return res.json({ status: 'CONCLUIDA', pago: true, mac: macLiberado, valor: detail.valor?.original });
    }
    return res.json({ status, pago: false });
  } catch (err) {
    console.log('ERRO STATUS', err.message);
    return res.json({ status: 'ATIVA', pago: false, erro: err.message });
  }
}
app.get('/verifica/:txid', handlerVerifica);
app.get('/status/:txid', handlerVerifica); // <-- compatibilidade

// ===== WEBHOOK =====
app.post('/webhook', async (req, res) => {
  console.log('WEBHOOK RECEBIDO', JSON.stringify(req.body).slice(0, 1000));
  try {
    const pixs = req.body.pix || [];
    for (const p of pixs) {
      if (p.txid && efi) {
        const detail = await efi.pixDetailCharge({ txid: p.txid });
        if (detail.status === 'CONCLUIDA') liberaPorTxid(detail);
      }
    }
  } catch (e) { console.log('WEBHOOK ERRO', e.message); }
  res.status(200).end();
});

// ===== LIBERADO =====
app.get('/liberado/:txid',(req,res)=>{ 
  console.log('LIBERADO', req.params.txid);
  fila=fila.filter(f=>f.txid!==req.params.txid); 
  liberacoes=liberacoes.filter(f=>f.txid!==req.params.txid);
  salvarLibs(); 
  res.json({ok:true}); 
});
app.get('/api/liberado/:txid',(req,res)=>{ 
  console.log('API LIBERADO', req.params.txid);
  fila=fila.filter(f=>f.txid!==req.params.txid); 
  liberacoes=liberacoes.filter(f=>f.txid!==req.params.txid);
  salvarLibs(); 
  res.json({ok:true}); 
});

app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`SLS v12.5 MERGE RODANDO PORTA ${PORT} - /tmp FIX + MAC FIX + DUAL ROUTES`));
