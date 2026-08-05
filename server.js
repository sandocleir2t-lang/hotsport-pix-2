// server.js v9.4 SLS WIFI EVENTOS - DESIGN PREMIUM ORIGINAL + FIX CERT + POLLING
const express = require('express');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PLANOS = {
  "1H": { valor: 3.00, tempo: 60, vel: "5M/5M", nome: "1 HORA", desc: "Ideal para uso rápido", tag: "" },
  "3H": { valor: 5.00, tempo: 180, vel: "10M/10M", nome: "3 HORAS", desc: "Mais vendido", tag: "MAIS VENDIDO" },
  "24H": { valor: 10.00, tempo: 1440, vel: "10M/10M", nome: "24 HORAS", desc: "Conexão o dia todo", tag: "" }
};

let certPath = '';
try {
  if (process.env.EFI_CERT_P12) {
    const buffer = Buffer.from(process.env.EFI_CERT_P12, 'base64');
    fs.writeFileSync('/tmp/cert.p12', buffer);
    certPath = '/tmp/cert.p12';
    console.log('Certificado /tmp/cert.p12');
  } else if (fs.existsSync('./certs/hotspot-producao.p12')) {
    certPath = './certs/hotspot-producao.p12';
  } else if (fs.existsSync('./certs/certificado.p12')) {
    certPath = './certs/certificado.p12';
  } else {
    certPath = './certs/hotspot-producao.p12';
  }
} catch(e){}

let fila = [];
const FILA_PATH = '/tmp/fila.json';
try { if(fs.existsSync(FILA_PATH)) fila = JSON.parse(fs.readFileSync(FILA_PATH)); } catch(e){}
const salvar = () => { try{fs.writeFileSync(FILA_PATH, JSON.stringify(fila))}catch(e){} };

const efipay = new EfiPay({
  sandbox: false,
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificate: certPath,
  passphrase: process.env.CERT_PASSWORD || ''
});

const getExp = (min) => Date.now() + (min * 60 * 1000);

function htmlLogin(planoSel, mac, ip){
return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{background:#0a0a12;color:#fff;font-family:Inter,Arial;margin:0;padding:15px}
.top{background:#15151f;border-radius:20px;padding:12px;text-align:center;margin-bottom:15px;border:1px solid #222}
.online{color:#8b8fa3;font-size:12px;letter-spacing:1px}
.dot{display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-right:6px;box-shadow:0 0 8px #22c55e}
.logo{display:flex;align-items:center;justify-content:center;gap:10px;margin:10px 0}
.ic{width:38px;height:38px;background:#7c3aed;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
.sls{font-size:28px;font-weight:800}.wifi{font-weight:300}
.sub{color:#8b8fa3;font-size:13px}
.card{background:#15151f;border-radius:20px;padding:16px;border:1px solid #222}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.badge{background:#2a2250;color:#a78bfa;font-size:11px;padding:6px 10px;border-radius:20px;border:1px solid #3b2f6e}
.plano{border:1.5px solid #2a2a3a;border-radius:16px;padding:14px;margin-bottom:10px;position:relative;cursor:pointer}
.plano.active{border-color:#7c3aed;box-shadow:0 0 15px rgba(124,58,237,.3);background:#1d1633}
.tag{position:absolute;top:-9px;right:15px;background:#7c3aed;font-size:10px;padding:3px 8px;border-radius:10px;font-weight:700}
.row{display:flex;justify-content:space-between;align-items:center}
.left{display:flex;gap:10px;align-items:center}
.ico{width:32px;height:32px;background:#1e1e2d;border-radius:50%;display:flex;align-items:center;justify-content:center}
.price{font-size:20px;font-weight:800}
.small{font-size:12px;color:#8b8fa3}
.btn{width:100%;background:#7c3aed;color:#fff;border:none;padding:16px;border-radius:14px;font-size:16px;font-weight:800;margin-top:15px}
</style></head><body>
<div class="top"><div class="online"><span class="dot"></span>ONLINE • 247 CLIENTES CONECTADOS</div>
<div class="logo"><div class="ic">📶</div><div class="sls">SLS<span class="wifi">WIFI</span></div></div>
<div class="sub">Internet rápida • Pagamento instantâneo via PIX</div></div>

<div class="card">
<div class="head"><b>ESCOLHA SEU PLANO</b><span class="badge">⚡ Ativação imediata</span></div>

<div id="p1" class="plano active" onclick="sel('1H')">${PLANOS["1H"].tag?`<div class="tag">${PLANOS["1H"].tag}</div>`:''}
<div class="row"><div class="left"><div class="ico">🕐</div><div><div><b>1 HORA</b></div><div class="small">${PLANOS["1H"].desc}</div></div></div><div style="text-align:right"><div class="price">R$ ${PLANOS["1H"].valor}</div><div class="small">1h de acesso</div></div></div></div>

<div id="p2" class="plano" onclick="sel('3H')"><div class="tag">MAIS VENDIDO</div>
<div class="row"><div class="left"><div class="ico">🕒</div><div><div><b>3 HORAS</b></div><div class="small">Mais vendido</div></div></div><div style="text-align:right"><div class="price">R$ ${PLANOS["3H"].valor}</div><div class="small">3h de acesso</div></div></div></div>

<div id="p3" class="plano" onclick="sel('24H')">
<div class="row"><div class="left"><div class="ico">📅</div><div><div><b>24 HORAS</b></div><div class="small">Conexão o dia todo</div></div></div><div style="text-align:right"><div class="price">R$ ${PLANOS["24H"].valor}</div><div class="small">24h de acesso</div></div></div></div>

<form id="f" action="/" method="get"><input type="hidden" name="plano" id="plano" value="1H"><input type="hidden" name="mac" value="${mac||''}"><input type="hidden" name="ip" value="${ip||''}"><button class="btn" type="submit">GERAR PIX E CONECTAR</button></form>
</div>
<script>function sel(p){document.getElementById('plano').value=p;document.querySelectorAll('.plano').forEach(e=>e.classList.remove('active'));document.getElementById(p=='1H'?'p1':p=='3H'?'p2':'p3').classList.add('active')}</script>
</body></html>`;
}

app.get('/', async (req, res) => {
  const { plano, mac, ip } = req.query;
  if(plano && PLANOS[plano]){
     try{
       const p = PLANOS[plano];
       const body = {
         calendario: { expiracao: 600 },
         valor: { original: p.valor.toFixed(2) },
         chave: process.env.EFI_PIX_KEY,
         infoAdicionais: [
           { nome: "plano", valor: plano },
           { nome: "mac", valor: mac || "00:00:00:00" },
           { nome: "ip", valor: ip || "0.0.0.0" },
           { nome: "tempo", valor: String(p.tempo) },
           { nome: "velocidade", valor: p.vel }
         ]
       };
       const cob = await efipay.pixCreateImmediateCharge({}, body);
       const qr = await efipay.pixGenerateQRCode({ id: cob.loc.id });
       const item = { txid: cob.txid, plano, mac, ip, tempoMin: p.tempo, velocidade: p.vel, status: 'ATIVA', expiraEm: getExp(p.tempo), criadoEm: Date.now() };
       fila = fila.filter(f=>f.txid!==cob.txid); fila.push(item); salvar();
       return res.send(`
         <html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0a0a12;color:#fff;font-family:Arial;text-align:center;padding:20px}.qr{background:#fff;padding:15px;border-radius:15px;width:280px;margin:20px auto}h1{color:#7c3aed}</style></head><body>
         <h1>SLS WIFI - ${p.nome} R$ ${p.valor.toFixed(2)}</h1>
         <div class="qr"><img src="${qr.imagemQrcode}" style="width:100%"><p style="color:#000;font-size:10px;word-break:break-all">${qr.qrcode}</p></div>
         <p id="status">Aguardando pagamento...</p>
         <script>
           let txid="${cob.txid}";
           setInterval(async()=>{ let r=await fetch('/status/'+txid); let d=await r.json(); if(d.status==='CONCLUIDA'){ document.getElementById('status').innerHTML='<h2 style=color:#22c55e>✅ PAGO! LIBERADO!</h2>'; setTimeout(()=>{ window.location.href='http://10.5.50.1'; },2000); } },3000);
         </script></body></html>`);
     }catch(e){ return res.send('Erro PIX: '+e.message); }
  }
  res.send(htmlLogin(PLANOS["1H"], req.query.mac, req.query.ip));
});

app.post('/webhook', async (req, res) => {
  const pixList = req.body.pix || [];
  for(let p of pixList){
    let idx = fila.findIndex(f=>f.txid===p.txid);
    if(idx>=0){ fila[idx].status='CONCLUIDA'; fila[idx].expiraEm=getExp(fila[idx].tempoMin); salvar(); }
  }
  res.json({ok:true});
});
app.get('/api/liberacoes', (req,res)=>{ const ativos = fila.filter(f=> f.status==='CONCLUIDA' && f.expiraEm > Date.now()); res.json(ativos); });
app.get('/api/consumido/:ip', (req,res)=>{ fila = fila.filter(f=>f.ip!==req.params.ip); salvar(); res.json({ok:true}); });
app.get('/status/:txid', (req,res)=> res.json(fila.find(f=>f.txid===req.params.txid) || {status:'NAO_ENCONTRADO'}));
app.get('/configurar-webhook', async (req,res)=>{ try{ const r = await efipay.pixConfigWebhook({chave: process.env.EFI_PIX_KEY}, {webhookUrl: 'https://hotsport-pix-2.onrender.com/webhook'}); res.json(r); }catch(e){res.json(e)} });

setInterval(async ()=>{
  const pendentes = fila.filter(f=>f.status==='ATIVA');
  for(const f of pendentes){
    try{ const det = await efipay.pixDetailCharge({txid:f.txid}); if(det.status==='CONCLUIDA'){ f.status='CONCLUIDA'; f.expiraEm=getExp(f.tempoMin); salvar(); } }catch(e){}
  }
}, 30000);

app.listen(process.env.PORT || 3000, ()=> console.log('SLS v9.4 DESIGN PREMIUM RODANDO PATH:'+certPath));
