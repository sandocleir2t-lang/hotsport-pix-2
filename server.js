const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const LIB_FILE_TMP = '/tmp/liberacoes.json';
const FILA_FILE_TMP = '/tmp/fila.json';
const LIB_FILE_SRC = path.join(__dirname, 'liberacoes.json');
let liberacoes = [];
let fila = [];

try {
  if (fs.existsSync(LIB_FILE_TMP)) {
    liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_TMP, 'utf8') || '[]');
    fila = [...liberacoes];
  } else if (fs.existsSync(FILA_FILE_TMP)) {
    fila = JSON.parse(fs.readFileSync(FILA_FILE_TMP, 'utf8') || '[]');
    liberacoes = [...fila];
  } else if (fs.existsSync(LIB_FILE_SRC)) {
    liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_SRC, 'utf8') || '[]');
    fila = [...liberacoes];
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes));
    fs.writeFileSync(FILA_FILE_TMP, JSON.stringify(fila));
  }
} catch (e) { liberacoes=[]; fila=[]; }

function salvarLibs() {
  try {
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes, null, 2));
    fs.writeFileSync(FILA_FILE_TMP, JSON.stringify(fila, null, 2));
    fs.writeFileSync(LIB_FILE_SRC, JSON.stringify(liberacoes, null, 2));
    console.log('FILA SALVA', fila.length, 'LIBERACOES', liberacoes.length);
  } catch(e){ console.log('ERRO SALVAR', e.message); }
}

const CERT_PATH_TMP = '/tmp/hotspot-producao.p12';
let efi = null;
function garanteCertificado(){
  try {
    const b64 = process.env.EFI_CERTIFICADO_BASE64;
    if (b64) {
      fs.writeFileSync(CERT_PATH_TMP, Buffer.from(b64.replace(/\s/g,''),'base64'));
      return CERT_PATH_TMP;
    }
    const certDir = path.join(__dirname, 'certs');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
    const possible = fs.existsSync(certDir) ? fs.readdirSync(certDir).find(f => f.endsWith('.p12')) : null;
    if (possible) {
      const src = path.join(certDir, possible);
      const certPath = path.join('/tmp', possible);
      if (!fs.existsSync(certPath)) fs.copyFileSync(src, certPath);
      return certPath;
    }
  } catch(err){ console.log('CERT ERROR', err.message); }
  return null;
}
const certFinal = garanteCertificado();
try {
  if (certFinal) {
    const options = { sandbox: false, client_id: process.env.EFI_CLIENT_ID, client_secret: process.env.EFI_CLIENT_SECRET, certificate: certFinal, certificado: certFinal, pixCert: certFinal, cert_base64: false };
    efi = new EfiPay(options);
    console.log('CERT OK - EFI CONFIGURADO');
  }
} catch(err){ console.log('EFI INIT ERROR', err.message); }

console.log('SLS v12.5.2 - ADMIN VOUCHER + FIX');

// ROTAS FILA
app.get('/api/liberacoes', (req, res) => { res.json(fila.filter(f=>f.status==='PAGO_LIBERAR' || f.mac) ); });
app.get('/fila', (req, res) => { res.json(fila); });
app.get('/api/fila', (req, res) => { res.json(fila); });
app.get('/api/liberacoes/limpar', (req, res) => { liberacoes = []; fila=[]; salvarLibs(); res.send('LIBERACOES LIMPAS!'); });

function liberaPorTxid(detail) {
  try {
    const macInfo = detail.infoAdicionais?.find(i => i.nome === 'MAC' || i.nome === 'mac')?.valor;
    const tempoInfo = detail.infoAdicionais?.find(i => i.nome === 'TEMPO' || i.nome === 'tempo')?.valor || '1h';
    const ipInfo = detail.infoAdicionais?.find(i => i.nome === 'IP' || i.nome === 'ip')?.valor || '';
    if (!macInfo || macInfo === 'semmac' || macInfo.toLowerCase().includes('00:00:00') || macInfo.length > 18 || macInfo.length < 12) {
      console.log(`PIX PAGO SEM MAC VALIDO - NAO LIBERANDO. TXID ${detail.txid} mac=${macInfo}`);
      let it = fila.find(f=>f.txid===detail.txid);
      if(it) it.status='PAGO_SEM_MAC';
      salvarLibs();
      return null;
    }
    liberacoes = liberacoes.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase());
    fila = fila.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase() && l.txid !== detail.txid);
    const novo = { mac: macInfo, ip: ipInfo, tempo: tempoInfo, data: Date.now(), txid: detail.txid, status: 'PAGO_LIBERAR' };
    liberacoes.push(novo); fila.push(novo); salvarLibs();
    console.log(`LIBERADO ${macInfo} ${tempoInfo} TXID ${detail.txid}`);
    return macInfo;
  } catch (e) { return null; }
}

async function handlerGerarPix(req, res){
  try {
    const { valor, tempo, mac, ip } = req.body;
    console.log(`GERAR PIX valor=${valor} tempo=${tempo} mac=${mac} ip=${ip}`);
    const valorNum = Number(valor);
    if (!efi) return res.status(500).json({ erro: 'EFI nao configurado' });
    const body = {
      calendario: { expiracao: 3600 },
      devedor: { cpf: '12345678909', nome: 'Cliente SLS WIFI' },
      valor: { original: valorNum.toFixed(2) },
      chave: process.env.EFI_PIX_KEY || process.env.EFI_CHAVE_PIX,
      solicitacaoPagador: `SLS WIFI ${tempo} - ${mac}`,
      infoAdicionais: [{ nome: 'MAC', valor: mac || 'semmac' }, { nome: 'IP', valor: ip || '' }, { nome: 'TEMPO', valor: String(tempo || '') }]
    };
    const charge = await efi.pixCreateImmediateCharge({}, body);
    const qrcode = await efi.pixGenerateQRCode({ id: charge.loc.id });
    fila.push({ txid: charge.txid, tempo: tempo, valor: valor, mac: mac||'semmac', status: 'AGUARDANDO', data: Date.now() });
    salvarLibs();
    console.log(`QR GERADO OK TXID ${charge.txid}`);
    return res.json({ txid: charge.txid, qrcode: qrcode.qrcode, copiaecola: qrcode.qrcode, copia_e_cola: qrcode.qrcode, imagem: qrcode.imagemQrcode, imagemQrcode: qrcode.imagemQrcode });
  } catch (err) {
    console.error('ERRO GERAR PIX', err);
    return res.status(500).json({ erro: err.message });
  }
}
app.post('/gerar', handlerGerarPix);
app.post('/criar-pix', handlerGerarPix);

// VOUCHER GERADOR - FORMATO EXATO DO TEU PRINT + PARAMS SERVER/UPTIME
app.post('/api/gerar-voucher', (req, res) => {
  try {
    const { tempo, qtd, perfil, evento, server, uptime } = req.body;
    const quantidade = Number(qtd) || 5;
    const tempoFinal = tempo || perfil || 'EVENTO';
    const eventoNome = evento || `SLS-V99-${tempoFinal} - ${new Date().toLocaleDateString('pt-BR')}`;
    const perfilMK = tempoFinal;
    const serverMK = server || 'hotspot1';
    const uptimeMK = uptime || '08:00:00';
    const vouchers = [];
    const comandos = [];
    for (let i = 0; i < quantidade; i++) {
      const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const pass = Math.random().toString(36).substring(2, 8).toUpperCase();
      const codigo = 'SLS-' + suffix;
      vouchers.push({ user: codigo, senha: pass, perfil: perfilMK, codigo, password: pass });
      comandos.push(`/ip hotspot user add name=${codigo} password=${pass} profile=${perfilMK} limit-uptime=${uptimeMK} server=${serverMK} comment="${eventoNome}"`);
    }
    console.log(`VOUCHER GERADO ${quantidade}x ${tempoFinal} server=${serverMK}`);
    return res.json({ ok: true, vouchers, comandos, evento: eventoNome, server: serverMK, uptime: uptimeMK });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

async function handlerVerifica(req,res){
  try {
    const { txid } = req.params;
    // FIX v12.5.2: se for voucher, nao mexe na fila
    if (txid.startsWith('SLS-')) {
      console.log('VOUCHER CHECK IGNORADO NA FILA', txid);
      return res.json({ status: 'VOUCHER', pago: false, voucher: true });
    }
    const detail = await efi.pixDetailCharge({ txid });
    const status = detail.status || 'ATIVA';
    if (status === 'CONCLUIDA') {
      const macLiberado = liberaPorTxid(detail);
      return res.json({ status: 'CONCLUIDA', pago: true, mac: macLiberado });
    }
    return res.json({ status, pago: false });
  } catch (err) {
    return res.json({ status: 'ATIVA', pago: false });
  }
}
app.get('/verifica/:txid', handlerVerifica);
app.get('/status/:txid', handlerVerifica);

app.post('/webhook', async (req, res) => {
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

// FIX v12.5.2 - NAO APAGA FILA SE FOR VOUCHER
app.get('/liberado/:txid',(req,res)=>{
  const txid = req.params.txid;
  if (txid.startsWith('SLS-')) {
    console.log('VOUCHER LOGIN - NAO LIMPA FILA', txid);
    return res.json({ok:true, voucher:true});
  }
  fila=fila.filter(f=>f.txid!==txid); liberacoes=liberacoes.filter(f=>f.txid!==txid); salvarLibs();
  console.log('LIBERADO REMOVIDO FILA', txid);
  res.json({ok:true});
});
app.get('/api/liberado/:txid',(req,res)=>{
  const txid = req.params.txid;
  if (txid.startsWith('SLS-')) {
    console.log('VOUCHER LOGIN - NAO LIMPA FILA', txid);
    return res.json({ok:true, voucher:true});
  }
  fila=fila.filter(f=>f.txid!==txid); liberacoes=liberacoes.filter(f=>f.txid!==txid); salvarLibs();
  console.log('API LIBERADO REMOVIDO FILA', txid);
  res.json({ok:true});
});

// ADMIN PAGE
app.get('/admin', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`SLS v12.5.2 ADMIN RODANDO PORTA ${PORT}`));
