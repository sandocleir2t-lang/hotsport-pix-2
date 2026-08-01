const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors({origin: '*'}));
app.use(express.json());
app.use(express.static('public'));

// ========== PARTE 1 - EFI USANDO ARQUIVO DA PASTA (NAO MEXER NA PASTA) ==========
let efi = null;
let efiErro = null;
try{
  const EfiPay = require('sdk-node-apis-efi');
  const certPath = path.join(__dirname, 'certs', 'hotspot-producao.p12');
  console.log("Certificado da pasta:", certPath, fs.existsSync(certPath) ? `OK ${fs.statSync(certPath).size} bytes` : "NAO ACHADO");
  efi = new EfiPay({
    sandbox: false,
    client_id: process.env.EFI_CLIENT_ID,
    client_secret: process.env.EFI_CLIENT_SECRET,
    certificate: certPath,
    cert_base64: false
  });
  console.log("EFI OK - PRODUCAO");
}catch(e){ efiErro = e.message; console.error("EFI erro:", e.message); }

// ========== PARTE 2 - PLANOS + VOUCHER ==========
const PLANOS = {
  "3.00": { tempo: "1h", profile: "1HORA", nome: "1 HORA" },
  "5.00": { tempo: "2h", profile: "2HORAS", nome: "2 HORAS" },
  "12.00": { tempo: "12h", profile: "EVENTO", nome: "EVENTO TODO" }
};

const VOUCHERS_VALIDOS = {
  "TESTE10": { senha: "1234", tempo: "1h", profile: "1HORA" },
  "EVENTO2024": { senha: "evento", tempo: "12h", profile: "EVENTO" }
};

function getPlano(valor){
  const v = Number(valor).toFixed(2);
  return PLANOS[v] || PLANOS["3.00"];
}

// ========== PARTE 3 - LIBERAR MIKROTIK JA PRONTO ==========
async function liberarMikrotik(mac, plano, obs="PIX"){
  if(!process.env.MIKROTIK_HOST){
    console.log("Mikrotik nao configurado - modo teste");
    return { usuario: "sls_"+Date.now().toString().slice(-4), senha: "1234", tempo: plano.tempo, profile: plano.profile, modo: "teste" };
  }
  try{
    const { RouterOSAPI } = require('node-routeros');
    const conn = new RouterOSAPI({
      host: process.env.MIKROTIK_HOST,
      user: process.env.MIKROTIK_USER || 'admin',
      password: process.env.MIKROTIK_PASS,
      port: 8728
    });
    await conn.connect();
    const usuario = `sls_${Date.now().toString().slice(-5)}`;
    const senha = Math.random().toString(36).slice(-4);
    await conn.write('/ip/hotspot/user/add', [
      `=name=${usuario}`,
      `=password=${senha}`,
      `=profile=${plano.profile}`,
      `=limit-uptime=${plano.tempo}`,
      `=comment=${obs} R$ ${plano.nome} ${new Date().toLocaleString()} MAC:${mac||''}`
    ]);
    await conn.close();
    console.log(`Mikrotik liberado: ${usuario} / ${senha} / ${plano.tempo}`);
    return { usuario, senha, tempo: plano.tempo, profile: plano.profile, modo: "mikrotik" };
  }catch(e){
    console.error("Erro Mikrotik:", e.message);
    return { usuario: "sls_"+Date.now().toString().slice(-4), senha: "1234", tempo: plano.tempo, profile: plano.profile, erro: e.message, modo: "fallback" };
  }
}

app.get('/', (req,res)=> res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/api/teste', (req,res)=> res.json({ok:true, efi: !!efi, erro: efiErro, planos: PLANOS}));

app.post('/api/criar-pix', async (req,res)=>{
  try{
    if(!efi) return res.status(500).json({ok:false, erro:"EFI: "+efiErro});
    const { valor, mac } = req.body;
    const plano = getPlano(valor || "3.00");
    const valorFinal = Number(valor || "3.00").toFixed(2);
    console.log(`PIX R$ ${valorFinal} -> ${plano.nome} -> ${plano.tempo} MAC:${mac}`);
    const charge = await efi.pixCreateImmediateCharge([],{
      calendario:{expiracao: 3600},
      valor:{original: valorFinal},
      chave: process.env.EFI_CHAVE_PIX,
      solicitacaoPagador: `SLS WIFI - ${plano.nome}`,
      infoAdicionais:[{nome:"Plano", valor: plano.nome},{nome:"Tempo", valor: plano.tempo}]
    });
    const qr = await efi.pixGenerateQRCode({id: charge.loc.id});
    return res.json({ok:true, txid: charge.txid, id: charge.loc.id, pixCopiaECola: qr.qrcode, qrcode: qr.qrcode, qrCodeImage: qr.imagemQrcode, valor: valorFinal, plano});
  }catch(e){ return res.status(500).json({ok:false, erro: e.message}); }
});

app.get('/api/status-pix/:txid', async (req,res)=>{
  try{
    if(!efi) return res.json({pago:false});
    const { mac } = req.query;
    const detalhe = await efi.pixDetailCharge({txid: req.params.txid});
    if(detalhe.status === 'CONCLUIDA'){
      const plano = getPlano(detalhe.valor.original);
      const liberacao = await liberarMikrotik(mac, plano, "PIX");
      return res.json({pago:true, status: detalhe.status, liberacao, plano});
    }
    return res.json({pago:false, status: detalhe.status});
  }catch(e){ return res.json({pago:false, erro:e.message}); }
});

// ========== VOUCHER FUNCIONANDO ==========
app.post('/api/validar-voucher', async (req,res)=>{
  const { codigo, senha, mac } = req.body;
  const codigoUpper = (codigo||"").toUpperCase().trim();
  const voucher = VOUCHERS_VALIDOS[codigoUpper];
  
  if(!voucher){
    return res.json({ok:false, erro:"Voucher invalido"});
  }
  if(voucher.senha !== (senha||"").trim()){
    return res.json({ok:false, erro:"Senha do voucher incorreta"});
  }
  
  const plano = { tempo: voucher.tempo, profile: voucher.profile, nome: codigoUpper };
  const liberacao = await liberarMikrotik(mac, plano, `VOUCHER ${codigoUpper}`);
  return res.json({ok:true, liberacao, plano, mensagem:"Voucher validado - internet liberada!"});
});

app.post('/api/gerar-voucher', async (req,res)=>{
  const { mac, valor } = req.body;
  const plano = getPlano(valor || "3.00");
  const lib = await liberarMikrotik(mac, plano, "VOUCHER MANUAL");
  res.json({ok:true, ...lib});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log(`SLS WIFI COMPLETO R$3/R$5/R$12 + VOUCHER rodando porta ${PORT}`));
