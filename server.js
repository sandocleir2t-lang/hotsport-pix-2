const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi').default;

const app = express();
app.use(cors());
app.use(express.json());

const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado() {
  const base64 = process.env.EFI_CERTIFICADO_BASE64;
  if (!base64) return;
  const limpo = base64.replace(/\s/g, '');
  fs.writeFileSync(CERT_PATH, Buffer.from(limpo, 'base64'));
}
garanteCertificado();

const efiOptions = {
  sandbox: false,
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificado: CERT_PATH,
  pixCert: CERT_PATH
};

let fila = [];

// ===== PÁGINA QUE O CLIENTE VAI VER =====
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SLS WIFI EVENTOS</title>
<style>
body{font-family:sans-serif;background:#111;color:#fff;text-align:center;padding:20px}
.card{background:#222;border-radius:15px;padding:20px;margin:15px 0}
button{background:#00ff88;color:#000;border:0;padding:15px 30px;border-radius:10px;font-size:18px;font-weight:bold;width:100%}
img{width:280px;background:#fff;padding:10px;border-radius:10px;margin-top:20px}
textarea{width:95%;height:80px}
</style>
</head>
<body>
<h1>🔥 SLS WIFI EVENTOS</h1>
<p>Escolha seu plano</p>

<div class="card">
<h2>1 Hora - R$ 5,00</h2>
<button onclick="gerar('5.00',60)">COMPRAR 1H</button>
</div>

<div class="card">
<h2>3 Horas - R$ 10,00</h2>
<button onclick="gerar('10.00',180)">COMPRAR 3H</button>
</div>

<div class="card">
<h2>Dia Todo - R$ 20,00</h2>
<button onclick="gerar('20.00',1440)">COMPRAR DIA</button>
</div>

<div id="pix" style="display:none">
<h2>✅ PIX REAL GERADO</h2>
<img id="qr">
<p>Copia e cola:</p>
<textarea id="copia"></textarea>
<p id="status">Aguardando pagamento...</p>
</div>

<script>
async function gerar(valor, tempo){
  document.getElementById('pix').style.display='block';
  document.getElementById('pix').innerHTML='<h2>Gerando PIX...</h2>';
  window.scrollTo(0,document.body.scrollHeight);
  const r = await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente Evento',valor,tempo})});
  const j = await r.json();
  if(j.imagem){
    document.getElementById('pix').innerHTML='<h2>✅ PIX REAL GERADO</h2><img id=qr src='+j.imagem+'><p>Copia e cola:</p><textarea id=copia>'+j.copia_e_cola+'</textarea><p id=status>Aguardando pagamento... TXID:'+j.txid+'</p>';
    checar(j.txid);
  } else {
    document.getElementById('pix').innerHTML='ERRO:'+JSON.stringify(j);
  }
}
async function checar(txid){
  setInterval(async()=>{
    const r = await fetch('/status/'+txid);
    const j = await r.json();
    if(j.status==='CONCLUIDA'){
      document.getElementById('status').innerHTML='✅ PAGO! LIBERADO!';
      document.getElementById('status').style.background='#00ff88';
      document.getElementById('status').style.color='#000';
      document.getElementById('status').style.padding='15px';
    }
  },5000);
}
</script>
</body>
</html>
  `);
});

app.post('/criar-pix', async (req, res) => {
  try {
    if (!fs.existsSync(CERT_PATH)) garanteCertificado();
    const { nome, valor, tempo } = req.body;
    const efipay = new EfiPay(efiOptions);
    const body = {
      calendario: { expiracao: 3600 },
      devedor: { nome: nome || 'Cliente' },
      valor: { original: valor.toString() },
      chave: process.env.EFI_CHAVE_PIX,
      infoAdicionais: [{ nome: 'Plano', valor: tempo+' min' }]
    };
    const cob = await efipay.pixCreateImmediateCharge([], body);
    const qrcode = await efipay.pixGenerateQRCode({ id: cob.loc.id });
    fila.push({ txid: cob.txid, tempo, status: 'AGUARDANDO', criadoEm: new Date() });
    res.json({ txid: cob.txid, imagem: qrcode.imagemQrcode, copia_e_cola: qrcode.qrcode });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get('/status/:txid', async (req, res) => {
  try {
    if (!fs.existsSync(CERT_PATH)) garanteCertificado();
    const efipay = new EfiPay(efiOptions);
    const consulta = await efipay.pixDetailCharge({ txid: req.params.txid });
    if (consulta.status === 'CONCLUIDA') {
      const item = fila.find(f => f.txid === req.params.txid);
      if (item) item.status = 'PAGO_LIBERAR';
    }
    res.json(consulta);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get('/fila', (req, res) => res.json(fila));

app.listen(process.env.PORT || 3000, () => console.log('SLS WIFI ONLINE'));
