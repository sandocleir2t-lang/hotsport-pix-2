const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const LIB_FILE_TMP = '/tmp/liberacoes.json';
const LIB_FILE_SRC = path.join(__dirname, 'liberacoes.json');
let liberacoes = [];
try {
  if (fs.existsSync(LIB_FILE_TMP)) {
    liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_TMP, 'utf8') || '[]');
  } else if (fs.existsSync(LIB_FILE_SRC)) {
    liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_SRC, 'utf8') || '[]');
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes));
  }
} catch (e) { liberacoes = []; }
function salvarLibs() {
  try {
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes, null, 2));
    fs.writeFileSync(LIB_FILE_SRC, JSON.stringify(liberacoes, null, 2));
  } catch {}
}

let efi = null;
try {
  const certDir = path.join(__dirname, 'certs');
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
  let certPath = null;
  const possible = fs.readdirSync(certDir).find(f => f.endsWith('.p12'));
  if (possible) {
    certPath = path.join('/tmp', possible);
    if (!fs.existsSync(certPath)) fs.copyFileSync(path.join(certDir, possible), certPath);
  }
  if (certPath) {
    const options = { sandbox: false, client_id: process.env.EFI_CLIENT_ID, client_secret: process.env.EFI_CLIENT_SECRET, certificate: certPath, cert_base64: false };
    efi = new EfiPay(options);
    console.log('CERT OK - EFI CONFIGURADO');
  }
} catch (err) { console.log('CERT ERROR', err.message); }

console.log('SLS v12.3 FINAL COM /fila + WEBHOOK');

app.get('/api/liberacoes', (req, res) => { res.json(liberacoes); });
app.get('/fila', (req, res) => { res.json(liberacoes); });
app.get('/api/fila', (req, res) => { res.json(liberacoes); });

app.get('/api/liberacoes/limpar', (req, res) => {
  liberacoes = []; salvarLibs();
  res.send('LIBERACOES LIMPAS!');
});

function liberaPorTxid(detail) {
  try {
    const macInfo = detail.infoAdicionais?.find(i => i.nome === 'MAC' || i.nome === 'mac')?.valor;
    const tempoInfo = detail.infoAdicionais?.find(i => i.nome === 'TEMPO' || i.nome === 'tempo')?.valor || '1h';
    const ipInfo = detail.infoAdicionais?.find(i => i.nome === 'IP' || i.nome === 'ip')?.valor || '';
    if (!macInfo || macInfo === 'semmac' || macInfo.includes('00:00:00:00')) return null;
    liberacoes = liberacoes.filter(l => l.mac.toLowerCase() !== macInfo.toLowerCase());
    liberacoes.push({ mac: macInfo, ip: ipInfo, tempo: tempoInfo, data: Date.now(), txid: detail.txid });
    salvarLibs();
    console.log(`PIX PAGO DETECTADO - LIBERADO ${macInfo} ${tempoInfo} via TXID ${detail.txid}`);
    return macInfo;
  } catch (e) { return null; }
}

app.post('/gerar', async (req, res) => {
  try {
    const { valor, tempo, mac, ip } = req.body;
    console.log(`GERAR PIX valor=${valor} tempo=${tempo} mac=${mac}`);
    const valorNum = Number(valor);
    if (!efi) return res.status(500).json({ error: 'EFI nao configurado' });
    const body = {
      calendario: { expiracao: 3600 },
      devedor: { cpf: '12345678909', nome: 'Cliente SLS WIFI' },
      valor: { original: valorNum.toFixed(2) },
      chave: process.env.EFI_PIX_KEY,
      solicitacaoPagador: `SLS WIFI ${tempo} - ${mac}`,
      infoAdicionais: [{ nome: 'MAC', valor: mac || 'semmac' }, { nome: 'IP', valor: ip || '' }, { nome: 'TEMPO', valor: tempo || '' }]
    };
    const charge = await efi.pixCreateImmediateCharge({}, body);
    const qrcode = await efi.pixGenerateQRCode({ id: charge.loc.id });
    return res.json({ txid: charge.txid, qrcode: qrcode.qrcode, copiaecola: qrcode.qrcode, imagem: qrcode.imagemQrcode });
  } catch (err) {
    return res.status(500).json({ error: 'ERRO GERAR PIX', detalhe: err.message });
  }
});

app.get('/verifica/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    const detail = await efi.pixDetailCharge({ txid });
    const status = detail.status || 'ATIVA';
    console.log(`STATUS TXID ${txid}: ${status}`);
    if (status === 'CONCLUIDA') {
      const macLiberado = liberaPorTxid(detail);
      return res.json({ status: 'CONCLUIDA', pago: true, mac: macLiberado });
    }
    return res.json({ status, pago: false });
  } catch (err) {
    return res.json({ status: 'ATIVA', pago: false });
  }
});

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
  } catch (e) {}
  res.status(200).end();
});

app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`SLS v12.3 RODANDO PORTA ${PORT}`));
