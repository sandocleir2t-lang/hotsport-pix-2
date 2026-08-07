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
  }
} catch (e) { liberacoes=[]; fila=[]; }

function salvarLibs() {
  try {
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes, null, 2));
    fs.writeFileSync(FILA_FILE_TMP, JSON.stringify(fila, null, 2));
    fs.writeFileSync(LIB_FILE_SRC, JSON.stringify(liberacoes, null, 2));
    console.log(`FILA SALVA total=${fila.length} PAGO_LIBERAR=${fila.filter(f=>f.status==='PAGO_LIBERAR').length} AGUARDANDO=${fila.filter(f=>f.status==='AGUARDANDO').length}`);
  } catch(e){}
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
  } catch(err){}
  return null;
}
const certFinal = garanteCertificado();
try {
  if (certFinal) {
    efi = new EfiPay({ sandbox: false, client_id: process.env.EFI_CLIENT_ID, client_secret: process.env.EFI_CLIENT_SECRET, certificate: certFinal });
    console.log('CERT OK - EFI CONFIGURADO - QR FUNCIONANDO');
  } else {
    console.log('CERT NAO ENCONTRADO - MODO MOCK ATIVO');
  }
} catch(err){ console.log('EFI INIT ERROR', err.message); }

console.log('SLS v13.2 FINAL - QR + VOUCHER FIX + /api/gerar-qrcode');

// ROTAS RAPIDAS 26/07
app.get('/api/liberacoes', (req, res) => { 
  const pagos = fila.filter(f=>f.status==='PAGO_LIBERAR');
  res.json(pagos); 
});
app.get('/fila', (req, res) => { res.json(fila); });
app.get('/api/fila', (req, res) => { 
  const { txid } = req.query;
  if (txid) {
    const item = fila.find(f=>f.txid===txid);
    if (!item) return res.json({status:'NAO_ENCONTRADO'});
    // compatibilidade para login novo que espera PAGO_LIBERAR
    return res.json(item);
  }
  res.json(fila); 
});
app.get('/api/liberacoes/limpar', (req, res) => { liberacoes = []; fila=[]; salvarLibs(); res.send('LIMPO'); });

function liberaPorTxid(detail) {
  try {
    const macInfo = detail.infoAdicionais?.find(i => i.nome === 'MAC')?.valor;
    const tempoInfo = detail.infoAdicionais?.find(i => i.nome === 'TEMPO')?.valor || '1h';
    const ipInfo = detail.infoAdicionais?.find(i => i.nome === 'IP')?.valor || '';
    if (!macInfo || macInfo === 'semmac' || macInfo.length < 12 || macInfo.includes('00:00:00')) {
      console.log(`PIX PAGO SEM MAC - TXID ${detail.txid}`);
      return null;
    }
    liberacoes = liberacoes.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase());
    fila = fila.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase() && l.txid !== detail.txid);
    const novo = { mac: macInfo, ip: ipInfo, tempo: tempoInfo, data: Date.now(), txid: detail.txid, status: 'PAGO_LIBERAR' };
    liberacoes.push(novo); fila.push(novo); salvarLibs();
    console.log(`✅ LIBERADO RAPIDO ${macInfo} ${tempoInfo} ${detail.txid}`);
    return macInfo;
  } catch (e) { return null; }
}

async function handlerGerarPix(req, res){
  try {
    // Aceita tanto body quanto query (para o login amarelo novo)
    const valor = req.body.valor || req.query.valor || 3;
    const tempo = req.body.tempo || req.query.tempo || '1 hora';
    const mac = req.body.mac || req.query.mac || 'semmac';
    const ip = req.body.ip || req.query.ip || '';
    const plano = req.body.plano || req.query.plano || tempo;

    console.log(`GERAR PIX ${valor} ${tempo} ${mac} plano=${plano}`);

    let txid, qrcodeData, imagem;

    if (!efi) {
      // MODO MOCK - para testar sem certificado
      txid = 'EFI-MOCK-' + Date.now();
      const fakeBrcode = `00020126580014BR.GOV.BCB.PIX0136${txid}520400005303986540${Number(valor).toFixed(2)}5802BR5920SLS WIFI6009TERESINA62070503***6304ABCD`;
      qrcodeData = fakeBrcode;
      imagem = ''; // login vai usar qrserver
      console.log(`QR MOCK GERADO ${txid} (EFI sem cert)`);
    } else {
      const charge = await efi.pixCreateImmediateCharge({}, {
        calendario: { expiracao: 3600 },
        devedor: { cpf: '12345678909', nome: 'Cliente SLS WIFI' },
        valor: { original: Number(valor).toFixed(2) },
        chave: process.env.EFI_PIX_KEY,
        solicitacaoPagador: `SLS WIFI ${tempo} - ${mac}`,
        infoAdicionais: [{ nome: 'MAC', valor: mac||'semmac' }, { nome: 'IP', valor: ip||'' }, { nome: 'TEMPO', valor: String(tempo||'') }]
      });
      const qrcode = await efi.pixGenerateQRCode({ id: charge.loc.id });
      txid = charge.txid;
      qrcodeData = qrcode.qrcode;
      imagem = qrcode.imagemQrcode;
      console.log(`QR GERADO OK ${txid}`);
    }

    const novoFila = { txid, tempo, valor, mac: mac||'semmac', status: 'AGUARDANDO', data: Date.now(), plano };
    fila.push(novoFila);
    salvarLibs();

    // RETORNO COMPATIVEL COM TUDO: login antigo + login novo amarelo
    return res.json({ 
      txid, 
      qrcode: imagem || '', 
      brcode: qrcodeData,
      // compatibilidade antiga
      copiaecola: qrcodeData, 
      copia_e_cola: qrcodeData, 
      imagem: imagem, 
      imagemQrcode: imagem,
      valor: Number(valor),
      tempo,
      plano
    });
  } catch (err) {
    console.error('ERRO GERAR PIX', err.message);
    return res.status(500).json({ erro: err.message });
  }
}

// ROTAS QUE FALTAVAM - CORREÇÃO DO 404
app.post('/gerar', handlerGerarPix);
app.post('/criar-pix', handlerGerarPix);
app.post('/api/gerar-qrcode', handlerGerarPix);
app.get('/api/gerar-qrcode', handlerGerarPix); // para teste via /tool fetch e navegador
app.all('/api/gerar-qrcode', handlerGerarPix);

app.post('/api/gerar-voucher', (req, res) => {
  try {
    const { tempo, qtd, perfil, evento, server, uptime } = req.body;
    const quantidade = Number(qtd) || 2;
    const tempoFinal = tempo || perfil || 'EVENTO';
    const eventoNome = evento || `SLS-V99-${tempoFinal}`;
    const serverMK = server || 'hotspot1';
    const uptimeMK = uptime || '08:00:00';
    const vouchers = []; const comandos = [];
    for (let i = 0; i < quantidade; i++) {
      const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const pass = Math.random().toString(36).substring(2, 8).toUpperCase();
      const codigo = 'SLS-' + suffix;
      vouchers.push({ user: codigo, senha: pass });
      comandos.push(`/ip hotspot user add name=${codigo} password=${pass} profile=${tempoFinal} limit-uptime=${uptimeMK} server=${serverMK} comment="${eventoNome}"`);
    }
    console.log(`VOUCHER ${quantidade}x ${tempoFinal}`);
    return res.json({ ok: true, vouchers, comandos });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

async function handlerVerifica(req,res){
  try {
    const { txid } = req.params;
    if (txid.startsWith('SLS-')) return res.json({ status: 'VOUCHER', pago: false, voucher: true });
    if (!efi) {
      // em modo mock, nunca paga sozinho, usa /api/pagar/:txid para simular
      const item = fila.find(f=>f.txid===txid);
      if (item && item.status==='PAGO_LIBERAR') return res.json({ status: 'CONCLUIDA', pago: true });
      return res.json({ status: 'ATIVA', pago: false });
    }
    const detail = await efi.pixDetailCharge({ txid });
    if (detail.status === 'CONCLUIDA') {
      const macLiberado = liberaPorTxid(detail);
      return res.json({ status: 'CONCLUIDA', pago: true, mac: macLiberado });
    }
    return res.json({ status: detail.status, pago: false });
  } catch (err) { return res.json({ status: 'ATIVA', pago: false }); }
}
app.get('/verifica/:txid', handlerVerifica);
app.get('/status/:txid', handlerVerifica);
app.get('/api/verifica/:txid', handlerVerifica);
app.get('/api/status/:txid', handlerVerifica);

// Libera manualmente para teste
app.get('/api/pagar/:txid', (req,res)=>{
  const txid=req.params.txid;
  const item=fila.find(f=>f.txid===txid);
  if(item){
    // simula pagamento aprovado da EFI
    const detail={ txid, infoAdicionais:[{nome:'MAC',valor:item.mac},{nome:'TEMPO',valor:item.tempo},{nome:'IP',valor:''}] };
    liberaPorTxid(detail);
    return res.json({ok:true, msg:'PAGO_LIBERAR ativado'});
  }
  return res.status(404).json({error:'txid nao encontrado'});
});

app.get('/liberado/:txid',(req,res)=>{
  const txid = req.params.txid;
  if (txid.startsWith('SLS-')) return res.json({ok:true, voucher:true});
  fila=fila.filter(f=>f.txid!==txid); liberacoes=liberacoes.filter(f=>f.txid!==txid); salvarLibs();
  res.json({ok:true});
});
app.get('/api/liberado/:txid',(req,res)=>{
  const txid = req.params.txid;
  if (txid.startsWith('SLS-')) return res.json({ok:true, voucher:true});
  fila=fila.filter(f=>f.txid!==txid); liberacoes=liberacoes.filter(f=>f.txid!==txid); salvarLibs();
  res.json({ok:true});
});

app.get('/admin', (req,res)=>{ res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`SLS v13.2 RAPIDO RODANDO ${PORT} - QR FIX /api/gerar-qrcode OK`));
