const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(cors());
app.use(express.json());
const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado() {
  try {
    const base64 = process.env.EFI_CERTIFICADO_BASE64;
    if (!base64) return;
    const buf = Buffer.from(base64.replace(/\s/g, ''), 'base64');
    fs.writeFileSync(CERT_PATH, buf);
    console.log('CERT OK', buf.length);
  } catch(e){ console.log('ERRO CERT', e.message); }
}
garanteCertificado();
const efiOptions = { sandbox: false, client_id: process.env.EFI_CLIENT_ID, client_secret: process.env.EFI_CLIENT_SECRET, certificate: CERT_PATH, certificado: CERT_PATH, pixCert: CERT_PATH };
let fila = [];
app.get('/', (req, res) => {
area.innerHTML='<h3 style=color:green>PIX R$ '+plano.valor+' - 5/10/15 MEGA</h3><img src='+j.imagem+'><p style=margin:10px 0;font-weight:bold'>COPIA E COLA:</p><textarea id=codePix style=width:100%;height:90px;font-size:10px;padding:10px;border:2px dashed #ffeb3b>'+j.copia_e_cola+'</textarea><button onclick="navigator.clipboard.writeText(document.getElementById(\'codePix\').value);alert(\'PIX COPIADO!\')" style=background:#00c853;color:#fff;border:0;width:100%;padding:12px;border-radius:8px;font-weight:bold;margin-top:8px;font-size:14px'>📋 COPIAR CODIGO PIX</button><p id=statusMsg style=background:#ffeb3b;padding:10px;border-radius:8px;margin-top:10px;font-weight:bold">⏳ Aguardando pagamento...</p>';});
app.post('/criar-pix', async (req, res) => {
  try {
    if (!fs.existsSync(CERT_PATH)) garanteCertificado();
    const efipay = new EfiPay(efiOptions);
    const body = { calendario: { expiracao: 3600 }, valor: { original: req.body.valor.toString() }, chave: process.env.EFI_CHAVE_PIX };
    const cob = await efipay.pixCreateImmediateCharge([], body);
    const qrcode = await efipay.pixGenerateQRCode({ id: cob.loc.id });
    console.log('COB OK', cob.txid, 'QR OK');
    fila.push({ txid: cob.txid, tempo: req.body.tempo, valor: req.body.valor, status: 'AGUARDANDO', criado: new Date().toISOString() });
    res.json({ txid: cob.txid, imagem: qrcode.imagemQrcode, copia_e_cola: qrcode.qrcode });
  } catch (err) { console.log('ERRO CRIAR', err); res.status(500).json({ erro: err.message }); }
});
app.get('/status/:txid', async (req,res)=>{
  try{
    const efipay = new EfiPay(efiOptions);
    const consulta = await efipay.pixDetailCharge({ txid: req.params.txid });
    console.log('STATUS', req.params.txid, '->', consulta.status);
    if(consulta.status === 'CONCLUIDA'){
      console.log('PAGO CONFIRMADO', req.params.txid);
      let item = fila.find(f=>f.txid === req.params.txid);
      if(item) item.status = 'PAGO_LIBERAR';
    }
    res.json(consulta);
  }catch(e){ res.status(500).json({erro:e.message}) }
});
app.get('/fila',(req,res)=>{ console.log('Fila req', fila.length); res.json(fila); });
app.get('/api/liberacoes',(req,res)=>{
  const pagos = fila.filter(f=>f.status==='PAGO_LIBERAR');
  console.log('API liberacoes', pagos.length);
  res.json(pagos);
});
app.get('/liberado/:txid',(req,res)=>{
  console.log('Liberado chamado', req.params.txid);
  fila = fila.filter(f=>f.txid !== req.params.txid);
  res.json({ ok: true, fila: fila.length });
});
app.get('/limpa',(req,res)=>{ fila=[]; res.json({ok:true}); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('SLS ONLINE', PORT));
