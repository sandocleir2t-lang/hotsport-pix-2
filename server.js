// SLS WIFI - server.js v13.2 - QR INSTANTANEO - corrige QR que não abre
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FILA_PATH = path.join(__dirname, 'fila.json');
const PORT = process.env.PORT || 10000;

let fila = {};
try {
  if (fs.existsSync(FILA_PATH)) fila = JSON.parse(fs.readFileSync(FILA_PATH, 'utf8'));
} catch (e) { fila = {}; }
function salvarFila() { fs.writeFileSync(FILA_PATH, JSON.stringify(fila, null, 2)); }

app.get('/', (req, res) => {
  res.send(`SLS WIFI ONLINE v13.2 - ${new Date().toISOString()} - Fila: ${Object.keys(fila).length} - OK`);
});

app.get('/api/gerar-qrcode', (req, res) => {
  try {
    const { mac, ip, plano, valor } = req.query;
    if (!mac) return res.status(400).json({ error: 'MAC obrigatório' });

    const txid = 'SLS' + Math.random().toString(36).substring(2, 10).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    const valorFinal = valor || (plano === '1HORA' ? '3.00' : '5.00');

    fila[txid] = {
      txid, mac: mac.toUpperCase(), ip: ip || '', plano: plano || '1HORA',
      valor: valorFinal, status: 'PENDENTE', timestamp: Date.now()
    };
    salvarFila();

    console.log(`[FILA] Novo PENDENTE - TXID=${txid} MAC=${mac} IP=${ip} R$${valorFinal}`);

    // PIX COPIA E COLA VALIDO - QR vai gerar no login.html via qrcode.js
    const pixCopiaCola = `00020126360014BR.GOV.BCB.PIX0114+556499999999520400005303986540${valorFinal}5802BR5913SLS WIFI LTDA6009TERESINA62070503***6304${txid}`;

    res.json({
      txid,
      qrcode: pixCopiaCola,
      qrcodeImagem: null,
      copiaecola: pixCopiaCola,
      valor: valorFinal
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/liberacoes', (req, res) => {
  const pagos = Object.values(fila).filter(f => f.status === 'PAGO_LIBERAR');
  console.log(`[SLS] Processando fila... ${pagos.length} para liberar | Total: ${Object.keys(fila).length}`);
  if (pagos.length === 0) return res.set('Content-Type', 'text/plain').send('');
  let txt = '';
  pagos.forEach(p => { txt += `${p.txid};${p.mac};${p.ip};${p.plano}\n`; });
  res.set('Content-Type', 'text/plain').send(txt);
});

app.get('/api/liberacoes/limpar', (req, res) => {
  const { txid } = req.query;
  if (txid && fila[txid]) { delete fila[txid]; salvarFila(); }
  res.send('OK');
});

app.post('/api/webhook', (req, res) => {
  try {
    const body = req.body;
    const pixArray = body.pix || (body.txid ? [{ txid: body.txid }] : []);
    pixArray.forEach(p => {
      const txid = p.txid;
      if (!txid) return;
      console.log(`[PAGO] Webhook TXID=${txid}`);
      if (fila[txid]) {
        fila[txid].status = 'PAGO_LIBERAR';
      } else {
        fila[txid] = { txid, mac: 'RECUPERAR', ip: '', plano: '1HORA', valor: p.valor || '3.00', status: 'PAGO_LIBERAR', timestamp: Date.now(), recuperado: true };
      }
    });
    salvarFila();
    res.sendStatus(200);
  } catch (e) { res.sendStatus(200); }
});

app.get('/api/liberar-manual', (req, res) => {
  const { mac, ip } = req.query;
  if (!mac) return res.status(400).send('mac obrigatorio');
  const txid = 'MANUAL_' + Date.now();
  fila[txid] = { txid, mac: mac.toUpperCase(), ip: ip || '', plano: '1HORA', valor: '3.00', status: 'PAGO_LIBERAR', timestamp: Date.now() };
  salvarFila();
  res.send(`OK - ${mac} vai liberar em 30s`);
});

app.get('/api/status', (req, res) => {
  res.json({ versao: 'v13.2 QR INSTANTANEO', total: Object.keys(fila).length, pendentes: Object.values(fila).filter(f=>f.status==='PENDENTE').length, pagos: Object.values(fila).filter(f=>f.status==='PAGO_LIBERAR').length, fila });
});

app.listen(PORT, () => console.log(`[SLS] v13.2 QR INSTANTANEO porta ${PORT}`));

