const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi'); // SEM .default

const app = express();
app.use(cors());
app.use(express.json());

const CERT_PATH = '/tmp/hotspot-producao.p12';
const FILA_PATH = './fila.json';

function garanteCertificado() {
  const base64 = process.env.EFI_CERTIFICADO_BASE64;
  if (!base64) return;
  try {
    const limpo = base64.replace(/\s/g, '');
    fs.writeFileSync(CERT_PATH, Buffer.from(limpo, 'base64'));
  } catch(e){ console.log("Erro cert", e.message) }
}
garanteCertificado();

// --- PERSISTÊNCIA ---
let fila = {};
function carregarFila(){
  try {
    if(fs.existsSync(FILA_PATH)){
      fila = JSON.parse(fs.readFileSync(FILA_PATH, 'utf8'));
    }
  } catch(e){ fila = {} }
}
function salvarFila(){
  try { fs.writeFileSync(FILA_PATH, JSON.stringify(fila)); } catch(e){}
}
carregarFila();

const efiOptions = {
  sandbox: false,
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificado: CERT_PATH,
  pixCert: CERT_PATH
};

// ===== PÁGINA CLIENTE =====
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
button{background:#00ff88;color:#000;border:0;padding:15px 30px;border-radius:10px;font-size:18px;font-weight:bold;width:100%;cursor:pointer}
button:disabled{opacity:0.5}
img{width:280px;background:#fff;padding:10px;border-radius:10px;margin-top:20px}
textarea{width:95%;height:80px}
#statusPaga{background:#00ff88;color:#000;padding:15px;border-radius:10px;font-weight:bold;font-size:20px;margin-top:15px;display:block;text-decoration:none}
</style>
</head>
<body>
<h1>🔥 SLS WIFI EVENTOS</h1>
<p>Escolha seu plano para liberar</p>

<div class="card"><h2>1 Hora - R$ 3,00</h2><button onclick="gerar('3.00',60)">COMPRAR 1H</button></div>
<div class="card"><h2>3 Horas - R$ 6,00</h2><button onclick="gerar('6.00',180)">COMPRAR 3H</button></div>
<div class="card"><h2>Dia Todo - R$ 10,00</h2><button onclick="gerar('10.00',1440)">COMPRAR DIA</button></div>

<div id="pix" style="display:none"></div>

<script>
let txidAtual = null;
async function gerar(valor, tempo){
  document.getElementById('pix').style.display='block';
  document.getElementById('pix').innerHTML='<h2>Gerando PIX REAL...</h2>';
  window.scrollTo(0,document.body.scrollHeight);
  const r = await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente Evento',valor,tempo})});
  const j = await r.json();
  if(j.imagem){
    txidAtual = j.txid;
    document.getElementById('pix').innerHTML='<h2>✅ PIX REAL GERADO</h2><img src="'+j.imagem+'"><p>Copia e cola:</p><textarea>'+j.copia_e_cola+'</textarea><p id="status">Aguardando pagamento...<br>TXID:'+j.txid+'</p>';
    checar(j.txid);
  } else {
    document.getElementById('pix').innerHTML='ERRO:'+JSON.stringify(j);
  }
}
async function checar(txid){
  const intervalo = setInterval(async()=>{
    const r = await fetch('/status/'+txid);
    const j = await r.json();
    if(j.status==='CONCLUIDA' || j.status==='PAGO'){
      clearInterval(intervalo);
      document.getElementById('pix').innerHTML += '<a id="statusPaga" href="#" onclick="liberar(\\''+txid+'\\')">✅ PAGO! CLIQUE PARA LIBERAR</a>';
    }
  },4000);
}
async function liberar(txid){
  await fetch('/api/liberado/'+txid);
  document.getElementById('pix').innerHTML = '<h1>✅ LIBERADO!</h1><p>Pode voltar para o WiFi e navegar.</p><a id="statusPaga" href="http://10.5.50.1/login">ENTRAR NA INTERNET</a>';
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
    
    fila[cob.txid] = { txid: cob.txid, valor, tempo, status: 'AGUARDANDO', criadoEm: new Date().toISOString() };
    salvarFila();

    res.json({ txid: cob.txid, imagem: qrcode.imagemQrcode, copia_e_cola: qrcode.qrcode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message, stack: err });
  }
});

app.get('/status/:txid', async (req, res) => {
  try {
    if (!fs.existsSync(CERT_PATH)) garanteCertificado();
    const efipay = new EfiPay(efiOptions);
    const consulta = await efipay.pixDetailCharge({ txid: req.params.txid });
    
    if (consulta.status === 'CONCLUIDA') {
      if(fila[req.params.txid]){
        fila[req.params.txid].status = 'PAGO';
        fila[req.params.txid].pagoEm = new Date().toISOString();
        salvarFila();
      } else {
        // Se reiniciou e não tem na fila, recria
        fila[req.params.txid] = { txid: req.params.txid, status: 'PAGO', pagoEm: new Date().toISOString() };
        salvarFila();
      }
      return res.json({ status: 'CONCLUIDA', txid: req.params.txid });
    }
    res.json(consulta);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ===== ROTA DEFINITIVA QUE O MIKROTIK LÊ =====
app.get('/api/liberacoes', async (req, res) => {
  try {
    carregarFila();
    // Se tiver algo PAGO na fila local, já devolve (resolve seu bug do Render reiniciar? não, mas não quebra)
    const pagasLocal = Object.values(fila).filter(f => f.status === 'PAGO');
    if(pagasLocal.length > 0){
      return res.json(pagasLocal);
    }
    
    // Tenta buscar na Efí só se a fila local estiver vazia
    try {
      if (!fs.existsSync(CERT_PATH)) garanteCertificado();
      const efipay = new EfiPay(efiOptions);
      const agora = new Date();
      const inicio = new Date(agora.getTime() - 3*60*60*1000);
      const params = {
        inicio: inicio.toISOString().substring(0,19) + 'Z',
        fim: agora.toISOString().substring(0,19) + 'Z'
      };
      const lista = await efipay.pixListCharges(params);
      const pagas = (lista.cobs || []).filter(c => c.status === 'CONCLUIDA');
      if(pagas.length > 0){
        const resultado = pagas.map(c => ({ txid: c.txid, valor: c.valor.original, status: 'PAGO' }));
        return res.json(resultado);
      }
    } catch(eListar){
      console.log("Listar Efí falhou, usando fila local:", eListar.message);
    }

    return res.json(pagasLocal); // vai ser [] se não tiver nada mesmo

  } catch (err) {
    res.json(Object.values(fila).filter(f => f.status === 'PAGO'));
  }
});

app.get('/api/liberado/:txid', (req, res) => {
  if(fila[req.params.txid]){
    delete fila[req.params.txid];
    salvarFila();
  }
  res.json({ ok: true, removido: req.params.txid });
});

app.get('/fila', (req, res) => res.json(fila));

app.listen(process.env.PORT || 3000, () => console.log('SLS WIFI v10 ONLINE PERSISTENTE'));
