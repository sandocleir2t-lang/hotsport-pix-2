const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===== PERSISTENCIA /tmp (Render free zera disco) =====
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
  console.log(`GET LIBERACOES ${liberacoes.length}`);
} catch (e) {
  console.log('GET LIBERACOES 0');
  liberacoes = [];
}
function salvarLibs() {
  try {
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes, null, 2));
    fs.writeFileSync(LIB_FILE_SRC, JSON.stringify(liberacoes, null, 2));
  } catch {}
}

// ===== EFI / CERT =====
let efi = null;
try {
  const certDir = path.join(__dirname, 'certs');
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  // procura p12 no projeto e copia pra /tmp se precisar
  let certPath = null;
  const possible = fs.readdirSync(certDir).find(f => f.endsWith('.p12'));
  if (possible) {
    certPath = path.join('/tmp', possible);
    if (!fs.existsSync(certPath)) {
      fs.copyFileSync(path.join(certDir, possible), certPath);
    }
  }

  if (certPath && fs.existsSync(certPath)) {
    console.log('CERT OK');
    const options = {
      sandbox: false, // true = homologação, false = produção
      client_id: process.env.EFI_CLIENT_ID,
      client_secret: process.env.EFI_CLIENT_SECRET,
      certificate: certPath,
      cert_base64: false
    };
    // pix key vem da EFI também
    efi = new EfiPay(options);
  } else {
    console.log('CERT NOT FOUND em', certDir);
  }
} catch (err) {
  console.log('CERT ERROR', err.message);
}

console.log('SLS v12.1 /tmp PERSISTENTE OK PORT 10000');

// ===== ROTAS API QUE O MIKROTIK USA =====
app.get('/api/liberacoes', (req, res) => {
  console.log(`GET LIBERACOES ${liberacoes.length}`);
  res.json(liberacoes);
});

app.post('/api/liberacoes', (req, res) => {
  const { mac, ip, tempo } = req.body;
  if (!mac) return res.status(400).json({ error: 'mac required' });
  liberacoes = liberacoes.filter(l => l.mac !== mac);
  liberacoes.push({ mac, ip, tempo: tempo || '1h', data: Date.now() });
  salvarLibs();
  res.json({ ok: true });
});

app.get('/api/verifica/:mac', (req, res) => {
  const found = liberacoes.find(l => l.mac.toLowerCase() === req.params.mac.toLowerCase());
  res.json({ liberado: !!found, info: found || null });
});

app.delete('/api/liberacoes/:mac', (req, res) => {
  liberacoes = liberacoes.filter(l => l.mac.toLowerCase() !== req.params.mac.toLowerCase());
  salvarLibs();
  res.json({ ok: true });
});

// ===== PIX GERAR =====
app.post('/gerar', async (req, res) => {
  try {
    const { valor, tempo, mac, ip } = req.body;
    const valorNum = Number(valor);
    if (!valorNum) return res.status(400).json({ error: 'valor invalido' });

    if (!efi) {
      return res.status(500).json({ error: 'EFI não configurado - CERT ou ENV faltando' });
    }

    const txid = 'SLS' + Date.now().toString().slice(-10) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    // valor tem que ser string com 2 casas
    const valorStr = valorNum.toFixed(2);

    const body = {
      calendario: { expiracao: 3600 },
      devedor: { cpf: '12345678909', nome: 'Cliente SLS WIFI' }, // pode ser genérico
      valor: { original: valorStr },
      chave: process.env.EFI_PIX_KEY, // sua chave PIX cadastrada na EFI
      solicitacaoPagador: `SLS WIFI ${tempo || ''} - ${mac || ''}`,
      infoAdicionais: [{ nome: 'MAC', valor: mac || 'semmac' }, { nome: 'IP', valor: ip || '' }, { nome: 'TEMPO', valor: tempo || '' }]
    };

    const charge = await efi.pixCreateImmediateCharge({}, body);
    // gera qrcode
    const qrcode = await efi.pixGenerateQRCode({ id: charge.loc.id });

    // salva pendente pra liberar depois que pagar
    // quando o webhook ou verifica confirmar, libera
    // por enquanto só retornamos

    return res.json({
      txid: charge.txid || txid,
      locId: charge.loc.id,
      qrcode: qrcode.qrcode,
      copiaecola: qrcode.qrcode,
      imagem: qrcode.imagemQrcode, // base64
      expiracao: charge.calendario.expiracao
    });

  } catch (err) {
    console.error('ERRO /gerar', err);
    const msg = err?.mensagem || err?.message || JSON.stringify(err);
    return res.status(500).json({ error: 'ERRO GERAR PIX', detalhe: msg });
  }
});

// ===== PIX VERIFICA (polling) =====
app.get('/verifica/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    if (!efi) return res.json({ status: 'PENDENTE' });

    // lista pix por txid
    const detail = await efi.pixDetailCharge({ txid });
    const status = detail.status || 'ATIVA';

    if (status === 'CONCLUIDA') {
      // tenta achar mac nas infoAdicionais e libera
      const macInfo = detail.infoAdicionais?.find(i => i.nome === 'MAC')?.valor;
      const tempoInfo = detail.infoAdicionais?.find(i => i.nome === 'TEMPO')?.valor || '1h';
      const ipInfo = detail.infoAdicionais?.find(i => i.nome === 'IP')?.valor || '';

      if (macInfo && macInfo !== 'semmac') {
        liberacoes = liberacoes.filter(l => l.mac !== macInfo);
        liberacoes.push({ mac: macInfo, ip: ipInfo, tempo: tempoInfo, data: Date.now(), txid });
        salvarLibs();
        console.log(`LIBERADO ${macInfo} ${tempoInfo} via PIX ${txid}`);
      }
      return res.json({ status: 'CONCLUIDA', pago: true, detalhe: detail });
    }
    return res.json({ status, pago: false });
  } catch (err) {
    // se txid não encontrado, retorna pendente
    return res.json({ status: 'ATIVA', pago: false });
  }
});

// Webhook opcional da EFI
app.post('/webhook', (req, res) => {
  console.log('WEBHOOK PIX', JSON.stringify(req.body).slice(0, 500));
  res.status(200).end();
});

// ===== STATIC POR ULTIMO (IMPORTANTE PRA NÃO DAR 404 NO /gerar) =====
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`SLS RODANDO NA PORTA ${PORT}`));
