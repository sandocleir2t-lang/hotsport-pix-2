const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi'); // FIX - sem .default

const app = express();
app.use(cors());
app.use(express.json());

const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado() {
  const base64 = process.env.EFI_CERTIFICADO_BASE64;
  if (!base64) return;
  const limpo = base64.replace(/\s/g, '');
  fs.writeFileSync(CERT_PATH, Buffer.from(limpo, 'base64'));
  console.log('✅ hotspot-producao.p12 salvo:', Buffer.from(limpo, 'base64').length);
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
let planoSelecionado = { valor: '2.00', tempo: 60, nome: '1 HORA' };

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>SLS WIFI</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
body{background:#0b1c3d;display:flex;justify-content:center;min-height:100vh}
.container{width:100%;max-width:380px;background:#0e224a;padding:20px 15px;text-align:center}
.logo{color:#fff;font-weight:900;font-size:22px;margin-bottom:5px}
.logo span{font-size:12px;display:block;font-weight:400;color:#a0b4d0;letter-spacing:2px}
.aviso{background:#ffeb3b;color:#000;padding:10px;border-radius:12px;font-size:12px;font-weight:bold;margin:15px 0}
.plano{background:#1a335f;border:2px solid #2a4a85;border-radius:12px;padding:12px 15px;margin:10px 0;display:flex;justify-content:space-between;align-items:center;color:#fff;cursor:pointer}
.plano.ativo{background:#ffeb3b;color:#000;border-color:#ffeb3b;font-weight:bold}
.plano b{font-size:16px}
.btn-gerar{background:#ffeb3b;color:#000;border:0;width:100%;padding:15px;border-radius:12px;font-size:16px;font-weight:900;margin:20px 0 10px;cursor:pointer}
.voucher-label{color:#fff;font-size:12px;margin-top:15px;display:block}
.input{width:100%;padding:12px;border-radius:8px;border:1px solid #334a78;background:#0a1933;color:#fff;margin:6px 0}
.btn-voucher{background:#1e3a6e;color:#fff;border:0;width:100%;padding:12px;border-radius:8px;font-weight:bold;margin-top:10px}
#pixArea{display:none;background:#fff;color:#000;border-radius:15px;padding:20px;margin-top:20px}
#pixArea img{width:100%;max-width:280px}
.footer{color:#5a7198;font-size:10px;margin-top:20px}
</style>
</head>
<body>
<div class="container">
<div class="logo">🚀 SLS WIFI<br><span>INTERNET RAPIDA AQUI</span></div>

<div class="aviso">NÃO FECHE ESTA TELA ATÉ PAGAR! Deixe aberta para liberar automático!</div>

<div class="plano ativo" onclick="sel(this,'2.00',60,'1 HORA')"><span>1 HORA</span><b>R$ 2,00</b></div>
<div class="plano" onclick="sel(this,'5.00',120,'2 HORAS')"><span>2 HORAS</span><b>R$ 5,00</b></div>
<div class="plano" onclick="sel(this,'12.00',1440,'EVENTO TODO')"><span>EVENTO TODO</span><b>R$ 12,00</b></div>

<button class="btn-gerar" onclick="gerar()">GERAR PIX - PAGAR AGORA</button>

<div id="pixArea"></div>

<span class="voucher-label">TEM VOUCHER?</span>
<input class="input" placeholder="CODIGO VOUCHER">
<input class="input" placeholder="SENHA" type="password">
<button class="btn-voucher">ENTRAR COM VOUCHER</button>

<div class="footer">SLS WIFI v6.0 - Liberação Automática</div>
</div>

<script>
let plano = {valor:'2.00',tempo:60,nome:'1 HORA'};
function sel(el,v,t,n){
  document.querySelectorAll('.plano').forEach(p=>p.classList.remove('ativo'));
  el.classList.add('ativo');
  plano={valor:v,tempo:t,nome:n};
}
async function gerar(){
  const area=document.getElementById('pixArea');
  area.style.display='block';
  area.innerHTML='<h3>Gerando PIX Real...</h3><p>Aguarde</p>';
  window.scrollTo(0,document.body.scrollHeight);
  try{
    const r=await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente SLS',valor:plano.valor,tempo:plano.tempo})});
    const j=await r.json();
    if(j.imagem){
      area.innerHTML='<h3 style=color:green>✅ PIX REAL - '+plano.nome+'</h3><img src='+j.imagem+'><p style=font-size:12px;margin:10px 0>Pix copia e cola:</p><textarea style=width:100%;height:70px;font-size:10px>'+j.copia_e_cola+'</textarea><p id=status style=margin-top:15px;font-weight:bold;background:#ffeb3b;padding:10px;border-radius:8px>⏳ Aguardando pagamento...</p><p style=font-size:11px;margin-top:10px>TXID: '+j.txid+'</p>';
      checar(j.txid);
    } else {
      area.innerHTML='<p style=color:red>ERRO: '+JSON.stringify(j)+'</p>';
    }
  }catch(e){area.innerHTML='ERRO: '+e.message}
}
function checar(txid){
  const int=setInterval(async()=>{
    const r=await fetch('/status/'+txid);
    const j=await r.json();
    if(j.status==='CONCLUIDA'){
      document.getElementById('status').innerHTML='✅ PAGO! LIBERANDO WIFI...';
      document.getElementById('status').style.background='#00ff88';
      clearInterval(int);
      // Aqui entra sua liberação automática do Mikrotik
    }
  },4000);
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
    console.log('✅ QR REAL:', cob.txid);
    res.json({ txid: cob.txid, imagem: qrcode.imagemQrcode, copia_e_cola: qrcode.qrcode });
  } catch (err) {
    console.error('ERRO:', err.message);
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
app.listen(process.env.PORT || 3000, () => console.log('SLS WIFI - SEU LAYOUT + PIX REAL ONLINE'));
