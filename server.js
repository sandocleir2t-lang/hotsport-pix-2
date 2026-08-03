/**
 * SLS WIFI - server.js v8.4 COM VOUCHER
 * Coloque este arquivo no GitHub substituindo o server.js
 */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// CONFIG - ALTERE AQUI
const MIKROTIK_HOST = process.env.MK_HOST || 'http://SEU_IP:8728'; // ou use API
const MK_USER = process.env.MK_USER || 'admin';
const MK_PASS = process.env.MK_PASS || 'SUA_SENHA';
const MERCADO_PAGO_TOKEN = process.env.MP_TOKEN || 'SEU_TOKEN';

let pagamentos = {}; // txid -> {pago, ip, plano}

app.get('/', (req,res)=> res.send('SLS WIFI v8.4 - ONLINE COM VOUCHER'));

// GERAR PIX - usado pelo login.html em http://10.5.50.1/login
app.post('/api/gerar-pix', async (req,res)=>{
  try{
    const { plano, valor, ip, mac } = req.body;
    const txid = crypto.randomBytes(8).toString('hex');
    
    // Aqui entra sua lógica Mercado Pago que você já tem
    // Simulação - substitua pela sua chamada real
    const qr_base64 = ""; // sua base64 do QR
    const pix_code = "00020126...COPIA E COLA AQUI...";
    
    // Exemplo real Mercado Pago:
    // const mp = await axios.post('https://api.mercadopago.com/v1/payments', {...}, {headers:{Authorization:'Bearer '+MERCADO_PAGO_TOKEN}})
    
    pagamentos[txid] = { pago:false, ip, mac, plano, valor, criado: Date.now() };

    res.json({ txid, qr_base64, pix_code, copia_cola: pix_code });
  }catch(e){
    console.error(e);
    res.status(500).json({erro:e.message});
  }
});

app.get('/api/status/:txid', (req,res)=>{
  const p = pagamentos[req.params.txid];
  if(!p) return res.json({pago:false});
  // Aqui você verifica no MP se pagou, se sim libera no MikroTik
  // Se pagou: chama função liberar()
  res.json({pago: p.pago});
});

// ADMIN - GERADOR DE VOUCHERS - https://hotsport-pix-2.onrender.com/admin
app.get('/admin', (req,res)=>{
  res.send(`
  <html><head><meta name="viewport" content="width=device-width"><title>Admin SLS WIFI</title>
  <style>body{font-family:Arial;background:#0a0e1a;color:#fff;display:flex;justify-content:center;padding:20px}
  .card{background:#111827;padding:20px;border-radius:12px;width:100%;max-width:400px}
  input,select,button{width:100%;padding:12px;margin:6px 0;border-radius:8px;border:1px solid #333}
  button{background:#00ff88;color:#000;font-weight:900;border:0;cursor:pointer}
  .v{margin-top:10px;background:#1f2937;padding:10px;border-radius:8px;font-family:monospace;font-size:12px}
  </style></head><body><div class="card">
  <h2>GERADOR DE VOUCHERS</h2>
  <label>Plano</label>
  <select id="plano"><option value="1HORA">1HORA</option><option value="2HORAS">2HORAS</option><option value="3horas">3HORAS</option><option value="DIARIA">DIARIA</option></select>
  <label>Quantidade</label><input id="qtd" type="number" value="5">
  <button onclick="gerar()">GERAR VOUCHERS</button>
  <div id="out"></div>
  <script>
  async function gerar(){
    let plano=document.getElementById('plano').value;
    let qtd=document.getElementById('qtd').value;
    let r=await fetch('/api/gerar-vouchers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plano,qtd})});
    let j=await r.json();
    document.getElementById('out').innerHTML=j.vouchers.map(v=>'<div class=v>USER: '+v.user+'<br>SENHA: '+v.pass+'<br>PLANO: '+v.plano+'</div>').join('');
  }
  </script></div></body></html>
  `);
});

app.post('/api/gerar-vouchers', async (req,res)=>{
  const { plano, qtd } = req.body;
  let vouchers = [];
  for(let i=0;i<qtd;i++){
    const user = 'SLS'+crypto.randomBytes(2).toString('hex').toUpperCase();
    const pass = crypto.randomBytes(2).toString('hex').toUpperCase();
    vouchers.push({user, pass, plano});
    // Aqui você criaria no MikroTik via API:
    // await mikrotikApi('/ip/hotspot/user/add', {name:user, password:pass, profile:plano})
    // Por enquanto só loga
    console.log('Criar voucher:', user, pass, plano);
  }
  res.json({vouchers});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log('SLS WIFI v8.4 rodando na porta '+PORT));
