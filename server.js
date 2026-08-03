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
    if (!base64) {
      console.log('❌ EFI_CERTIFICADO_BASE64 VAZIA!');
      return;
    }
    const limpo = base64.replace(/\s/g, '');
    const buf = Buffer.from(limpo, 'base64');
    fs.writeFileSync(CERT_PATH, buf);
    console.log('✅ CERT SALVO:', CERT_PATH, 'Bytes:', buf.length);
  } catch(e){
    console.log('❌ ERRO CERT:', e.message);
  }
}
garanteCertificado();

const efiOptions = {
  sandbox: false,
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificate: CERT_PATH,
  certificado: CERT_PATH,
  pixCert: CERT_PATH
};

let fila = [];

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>SLS WIFI</title><style>*{box-sizing:border-box;margin:0;padding:0;font-family:Arial}body{background:#0b1c3d;display:flex;justify-content:center;min-height:100vh}.container{width:100%;max-width:380px;background:#0e224a;padding:20px 15px;text-align:center}.logo{color:#fff;font-weight:900;font-size:22px}.logo span{font-size:12px;display:block;font-weight:400;color:#a0b4d0;letter-spacing:2px}.aviso{background:#ffeb3b;color:#000;padding:10px;border-radius:12px;font-size:12px;font-weight:bold;margin:15px 0}.plano{background:#1a335f;border:2px solid #2a4a85;border-radius:12px;padding:12px 15px;margin:10px 0;display:flex;justify-content:space-between;color:#fff;cursor:pointer}.plano.ativo{background:#ffeb3b;color:#000;border-color:#ffeb3b;font-weight:bold}.btn-gerar{background:#ffeb3b;color:#000;border:0;width:100%;padding:15px;border-radius:12px;font-size:16px;font-weight:900;margin:20px 0 10px;cursor:pointer}#pixArea{display:none;background:#fff;color:#000;border-radius:15px;padding:20px;margin-top:20px}#pixArea img{width:100%;max-width:280px}.input{width:100%;padding:12px;border-radius:8px;border:1px solid #334a78;background:#0a1933;color:#fff;margin:6px 0}.btn-voucher{background:#1e3a6e;color:#fff;border:0;width:100%;padding:12px;border-radius:8px;font-weight:bold;margin-top:10px}.footer{color:#5a7198;font-size:10px;margin-top:20px}</style></head><body><div class="container"><div class="logo">SLS WIFI<br><span>INTERNET RAPIDA AQUI</span></div><div class="aviso">NAO FECHE ESTA TELA ATE PAGAR! Deixe aberta para liberar automatico!</div><div class="plano ativo" onclick="sel(this,'2.00',60)"><span>1 HORA</span><b>R$ 2,00</b></div><div class="plano" onclick="sel(this,'5.00',120)"><span>2 HORAS</span><b>R$ 5,00</b></div><div class="plano" onclick="sel(this,'12.00',1440)"><span>EVENTO TODO</span><b>R$ 12,00</b></div><button class="btn-gerar" onclick="gerar()">GERAR PIX - PAGAR AGORA</button><div id="pixArea"></div><span style="color:#fff;font-size:12px">TEM VOUCHER?</span><input class="input" placeholder="CODIGO VOUCHER"><input class="input" placeholder="SENHA" type="password"><button class="btn-voucher">ENTRAR COM VOUCHER</button><div class="footer">SLS WIFI v6.0 - Liberacao Automatica</div></div><script>let plano={valor:'2.00',tempo:60};function sel(el,v,t){document.querySelectorAll('.plano').forEach(p=>p.classList.remove('ativo'));el.classList.add('ativo');plano={valor:v,tempo:t};}async function gerar(){const area=document.getElementById('pixArea');area.style.display='block';area.innerHTML='<h3>Gerando PIX Real...</h3>';try{const r=await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'Cliente SLS',valor:plano.valor,tempo:plano.tempo})});const j=await r.json();console.log(j);if(j.imagem){area.innerHTML='<h3 style=color:green>PIX REAL GERADO</h3><img src='+j.imagem+'><textarea style=width:100%;height:70px;font-size:10px;margin-top:10px>'+j.copia_e_cola+'</textarea><p id=status style=background:#ffeb3b;padding:10px;border-radius:8px;margin-top:10px> Aguardando pagamento...</p>';}else{area.innerHTML='<p style=color:red>ERRO:<br>'+JSON.stringify(j)+'</p>';}}catch(e){area.innerHTML='ERRO JS: '+e.message}}</script></body></html>`);
});

app.post('/criar-pix', async (req, res) => {
  try {
    console.log('=== CRIAR PIX ===', req.body);
    if (!fs.existsSync(CERT_PATH)) garanteCertificado();
    const efipay = new EfiPay(efiOptions);
    // FIX: SEM devedor para nao pedir CPF - conforme erro que voce mandou
    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: req.body.valor.toString() },
      chave: process.env.EFI_CHAVE_PIX
    };
    console.log('Body Efí (sem devedor):', body);
    const cob = await efipay.pixCreateImmediateCharge([], body);
    console.log('COB OK:', cob.txid);
    const qrcode = await efipay.pixGenerateQRCode({ id: cob.loc.id });
    console.log('QR OK');
    fila.push({ txid: cob.txid, tempo: req.body.tempo });
    res.json({ txid: cob.txid, imagem: qrcode.imagemQrcode, copia_e_cola: qrcode.qrcode });
  } catch (err) {
    console.log('===== ERRO COMPLETO =====');
    console.log('Message:', err.message);
    console.log('Full:', JSON.stringify(err, null, 2));
    if(err.response) console.log('Response:', err.response.data);
    console.log('=========================');
    res.status(500).json({ erro: err.message || 'erro', full: err });
  }
});

app.get('/status/:txid', async (req,res)=>{
  try{
    const efipay = new EfiPay(efiOptions);
    const consulta = await efipay.pixDetailCharge({ txid: req.params.txid });
    res.json(consulta);
  }catch(e){
    console.log('ERRO STATUS:', e.message);
    res.status(500).json({erro:e.message})
  }
});

app.get('/fila',(req,res)=>res.json(fila));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('SLS WIFI ONLINE NA PORTA', PORT));
