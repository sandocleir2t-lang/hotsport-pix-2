// SLS v13.3 FIX FINAL - seu 13.2 + copia e cola + sem flood
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
let liberacoes = []; let fila = [];
try {
  if (fs.existsSync(LIB_FILE_TMP)) { liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_TMP, 'utf8') || '[]'); fila = [...liberacoes]; }
  else if (fs.existsSync(FILA_FILE_TMP)) { fila = JSON.parse(fs.readFileSync(FILA_FILE_TMP, 'utf8') || '[]'); liberacoes = [...fila]; }
  else if (fs.existsSync(LIB_FILE_SRC)) { liberacoes = JSON.parse(fs.readFileSync(LIB_FILE_SRC, 'utf8') || '[]'); fila = [...liberacoes]; }
} catch (e) { liberacoes=[]; fila=[]; }
function salvarLibs() {
  try {
    fs.writeFileSync(LIB_FILE_TMP, JSON.stringify(liberacoes, null, 2));
    fs.writeFileSync(FILA_FILE_TMP, JSON.stringify(fila, null, 2));
    fs.writeFileSync(LIB_FILE_SRC, JSON.stringify(liberacoes, null, 2));
    if(fila.length>0 && fila.length % 5 === 0) console.log(`FILA total=${fila.length} PAGO=${fila.filter(f=>f.status==='PAGO_LIBERAR').length}`);
  } catch(e){}
}
const CERT_PATH_TMP = '/tmp/hotspot-producao.p12';
let efi = null;
function garanteCertificado(){
  try {
    const b64 = process.env.EFI_CERTIFICADO_BASE64;
    if (b64) { fs.writeFileSync(CERT_PATH_TMP, Buffer.from(b64.replace(/\s/g,''),'base64')); return CERT_PATH_TMP; }
    const certDir = path.join(__dirname, 'certs');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
    const possible = fs.existsSync(certDir) ? fs.readdirSync(certDir).find(f => f.endsWith('.p12')) : null;
    if (possible) { const src = path.join(certDir, possible); const certPath = path.join('/tmp', possible); if (!fs.existsSync(certPath)) fs.copyFileSync(src, certPath); return certPath; }
  } catch(err){} return null;
}
const certFinal = garanteCertificado();
try { if (certFinal) { efi = new EfiPay({ sandbox: false, client_id: process.env.EFI_CLIENT_ID, client_secret: process.env.EFI_CLIENT_SECRET, certificate: certFinal }); console.log('CERT OK - QR FUNCIONANDO'); } else { console.log('CERT NAO ENCONTRADO - MODO MOCK'); } } catch(err){ console.log('EFI INIT ERROR', err.message); }
console.log('SLS v13.3 FIX FINAL');
app.get('/api/liberacoes', (req, res) => { res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')); });
app.get('/fila', (req, res) => { res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')); });
app.get('/api/fila', (req, res) => { const { txid } = req.query; if (txid) { const item = fila.find(f=>f.txid===txid); return res.json(item || {status:'NAO_ENCONTRADO'}); } res.json(fila.filter(f=>f.status==='PAGO_LIBERAR')); });
app.get('/api/liberacoes/limpar', (req, res) => { liberacoes = []; fila=[]; salvarLibs(); res.send('LIMPO'); });
function liberaPorTxid(detail) {
  try {
    const macInfo = detail.infoAdicionais?.find(i => i.nome === 'MAC')?.valor;
    const tempoInfo = detail.infoAdicionais?.find(i => i.nome === 'TEMPO')?.valor || '1h';
    const ipInfo = detail.infoAdicionais?.find(i => i.nome === 'IP')?.valor || '';
    const item = fila.find(f=>f.txid===detail.txid);
    if (!macInfo || macInfo === 'semmac' || macInfo.length < 12 || macInfo.includes('00:00:00')) { if(item){ item.status='PAGO_LIBERAR'; salvarLibs(); } return item?.mac || null; }
    liberacoes = liberacoes.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase());
    fila = fila.filter(l => (l.mac||'').toLowerCase() !== macInfo.toLowerCase() && l.txid !== detail.txid);
    const novo = { mac: macInfo, ip: ipInfo, tempo: tempoInfo, data: Date.now(), txid: detail.txid, status: 'PAGO_LIBERAR' };
    liberacoes.push(novo); fila.push(novo); salvarLibs();
    console.log(`✅ LIBERADO ${macInfo} ${tempoInfo}`); return macInfo;
  } catch (e) { return null; }
}
async function handlerGerarPix(req, res){
  try {
    const valor = req.body?.valor || req.query?.valor || 3;
    const tempo = req.body?.tempo || req.query?.tempo || '1h';
    const mac = req.body?.mac || req.query?.mac || 'semmac';
    const ip = req.body?.ip || req.query?.ip || '';
    const plano = req.body?.plano || req.query?.plano || tempo;
    console.log(`GERAR PIX ${valor} ${tempo} ${mac}`);
    let txid, qrcodeData, imagem;
    if (!efi) {
      txid = 'EFI-MOCK-' + Date.now();
      qrcodeData = `00020126580014BR.GOV.BCB.PIX0136${txid}520400005303986540${Number(valor).toFixed(2)}5802BR5920SLS WIFI6009TERESINA62070503***6304ABCD`;
      imagem = '';
    } else {
      const charge = await efi.pixCreateImmediateCharge({}, { calendario: { expiracao: 3600 }, devedor: { cpf: '12345678909', nome: 'Cliente SLS WIFI' }, valor: { original: Number(valor).toFixed(2) }, chave: process.env.EFI_PIX_KEY, solicitacaoPagador: `SLS WIFI ${tempo} - ${mac}`, infoAdicionais: [{ nome: 'MAC', valor: (mac||'semmac').substring(0,30) }, { nome: 'IP', valor: (ip||'').substring(0,30) }, { nome: 'TEMPO', valor: String(tempo||'').substring(0,30) }] });
      const qrcode = await efi.pixGenerateQRCode({ id: charge.loc.id });
      txid = charge.txid; qrcodeData = qrcode.qrcode; imagem = qrcode.imagemQrcode;
      console.log(`QR GERADO OK ${txid} LEN=${qrcodeData.length}`);
    }
    fila.push({ txid, tempo, valor, mac: mac||'semmac', ip, status: 'AGUARDANDO', data: Date.now(), plano });
    salvarLibs();
    return res.json({ txid, qrcode: imagem, imagemQrcode: imagem, imagem: imagem, brcode: qrcodeData, copiaecola: qrcodeData, copia_e_cola: qrcodeData, pixCopiaECola: qrcodeData, copiaCola: qrcodeData, code: qrcodeData, valor, tempo, plano });
  } catch (err) { console.error('ERRO GERAR PIX', err.message); return res.status(500).json({ erro: err.message }); }
}
app.post('/gerar', handlerGerarPix); app.post('/criar-pix', handlerGerarPix); app.post('/api/gerar-qrcode', handlerGerarPix); app.get('/api/gerar-qrcode', handlerGerarPix); app.all('/api/gerar-qrcode', handlerGerarPix);
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
    return res.json({ ok: true, vouchers, comandos });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
async function handlerVerifica(req,res){
  try {
    const { txid } = req.params;
    if (txid.startsWith('SLS-')) return res.json({ status: 'VOUCHER', pago: false, voucher: true });
    const item = fila.find(f=>f.txid===txid);
    if(item && item.status==='PAGO_LIBERAR') return res.json({ status: 'CONCLUIDA', pago: true, mac: item.mac });
    if (!efi) return res.json({ status: 'ATIVA', pago: false });
    const detail = await efi.pixDetailCharge({ txid });
    if (detail.status === 'CONCLUIDA') { const macLiberado = liberaPorTxid(detail); return res.json({ status: 'CONCLUIDA', pago: true, mac: macLiberado }); }
    return res.json({ status: detail.status, pago: false });
  } catch (err) { return res.json({ status: 'ATIVA', pago: false }); }
}
app.get('/verifica/:txid', handlerVerifica); app.get('/status/:txid', handlerVerifica); app.get('/api/verifica/:txid', handlerVerifica); app.get('/api/status/:txid', handlerVerifica);
app.get('/api/pagar/:txid', (req,res)=>{ const it=fila.find(f=>f.txid===req.params.txid); if(it){ liberaPorTxid({txid:it.txid, infoAdicionais:[{nome:'MAC',valor:it.mac},{nome:'TEMPO',valor:it.tempo},{nome:'IP',valor:it.ip||''}]}); return res.json({ok:true, status:'PAGO_LIBERAR'}); } res.status(404).json({error:'nao achou'}); });
app.get('/liberado/:txid',(req,res)=>{ fila=fila.filter(f=>f.txid!==req.params.txid); liberacoes=liberacoes.filter(f=>f.txid!==req.params.txid); salvarLibs(); res.json({ok:true}); });
app.get('/api/liberado/:txid',(req,res)=>{ fila=fila.filter(f=>f.txid!==req.params.txid); liberacoes=liberacoes.filter(f=>f.txid!==req.params.txid); salvarLibs(); res.json({ok:true}); });
setInterval(async ()=>{ const pendentes = fila.filter(f=>f.status==='AGUARDANDO'); if(pendentes.length===0 || !efi) return; for(const item of pendentes){ try{ const detail = await efi.pixDetailCharge({ txid: item.txid }); if(detail.status==='CONCLUIDA'){ liberaPorTxid(detail); } }catch(e){} } }, 5000);
app.get('/admin', (req,res)=>{ res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`SLS v13.3 FIX FINAL RODANDO ${PORT}`));
