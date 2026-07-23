const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

let liberacoes = [];

// GARANTE QUE O CERTIFICADO EXISTA (decodifica do BASE64 do Render)
function garantirCertificado(){
  try{
    const base64 = process.env.EFI_CERT_BASE64;
    const certPath1 = path.join(__dirname, 'certificados', 'hotspot-producao.p12');
    const certPath2 = path.join(__dirname, 'certificado.p12');
    const pastaCert = path.join(__dirname, 'certificados');
    if(!fs.existsSync(pastaCert)) fs.mkdirSync(pastaCert, {recursive:true});
    
    if(base64 && base64.length > 100){
      // Se já existe e tem tamanho, não recria
      if(fs.existsSync(certPath1) && fs.statSync(certPath1).size > 1000) return certPath1;
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(certPath1, buffer);
      fs.writeFileSync(certPath2, buffer);
      console.log('Certificado criado do BASE64:', certPath1, buffer.length);
      return certPath1;
    }
    if(fs.existsSync(certPath1)) return certPath1;
    if(fs.existsSync(process.env.EFI_CERTIFICATE || '')) return process.env.EFI_CERTIFICATE;
    if(fs.existsSync(process.env.GN_CERT_PATH || '')) return process.env.GN_CERT_PATH;
  }catch(e){ console.log('Erro cert:', e.message); }
  return null;
}

const CERT_FINAL = garantirCertificado();

app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/api/liberacoes',(req,res)=> res.json(liberacoes));
app.get('/api/limpar-tudo',(req,res)=>{ liberacoes=[]; res.send('LIMPO'); });

app.get('/api/liberar',(req,res)=>{
  const ip=req.query.ip; const mac=req.query.mac||'TESTE';
  if(!ip) return res.status(400).send('Falta IP');
  if(!liberacoes.find(l=>l.ip===ip)) liberacoes.push({ip,mac,liberadoEm:new Date()});
  console.log(`[LIBERADO] ${ip}`);
  res.send(`OK ${ip}`);
});
app.post('/api/liberar',(req,res)=>{
  const ip=req.body.ip||req.query.ip||req.ip;
  const mac=req.body.mac||'TESTE';
  if(!liberacoes.find(l=>l.ip===ip)) liberacoes.push({ip,mac,liberadoEm:new Date()});
  res.json({sucesso:true});
});

// CRIAR PIX REAL
app.post('/api/criar-pix', async (req,res)=>{
  let {valor}=req.body;
  valor = Number(valor)||2;
  const valorStr = valor.toFixed(2);
  try{
    const EfiPay = require('sdk-node-apis-efi');
    const clientIdRaw = (process.env.EFI_CLIENT_ID||'').replace('Client_Id_','').trim();
    const clientSecretRaw = (process.env.EFI_CLIENT_SECRET||'').replace('Client_Secret_','').trim();
    const chavePix = (process.env.EFI_CHAVE_PIX || process.env.EFI_PIX_KEY || '50574099000103').trim();

    const options = {
      sandbox: false,
      client_id: clientIdRaw,
      client_secret: clientSecretRaw,
      certificate: CERT_FINAL || process.env.EFI_CERTIFICATE || process.env.GN_CERT_PATH,
    };
    console.log('Tentando EFI REAL com cert:', options.certificate, ' chave:', chavePix);
    if(!options.certificate || !fs.existsSync(options.certificate)) throw new Error('Cert não encontrado');
    
    const efipay = new EfiPay(options);
    const body = {
      calendario:{expiracao:3600},
      devedor:{cpf:"12345678909", nome:"Cliente SLS WIFI"},
      valor:{original:valorStr},
      chave: chavePix,
      solicitacaoPagador:`SLS WIFI - R$ ${valorStr}`
    };
    const pix = await efipay.pixCreateImmediateCharge([], body);
    const qr = await efipay.pixGenerateQRCode({id: pix.loc.id});
    console.log('PIX REAL GERADO:', pix.txid);
    return res.json({txid:pix.txid, pixCopiaECola:qr.qrcode, qrcode:qr.qrcode, imagemQrcode:qr.imagemQrcode});
  }catch(e){
    console.log('Falha EFI REAL:', e.message, e.errors || '');
    // fallback ainda mostra o erro pra vc ver
    return res.status(500).json({error:e.message, nome:"json_invalido", mensagem:JSON.stringify(e.errors||e), caminho:"body.devedor"});
  }
});

app.post('/api/gerar-pix',(req,res)=>{ req.url='/api/criar-pix'; app.handle(req,res); });

app.listen(PORT,'0.0.0.0',()=>console.log(`SLS WIFI v6 FINAL - CERT: ${CERT_FINAL} - PORTA ${PORT}`));