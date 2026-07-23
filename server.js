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

function garantirCertificado(){
  try{
    const base64 = (process.env.EFI_CERT_BASE64 || '').trim().replace(/\s/g,'');
    const pastaCert = path.join(__dirname, 'certificados');
    const certPath = path.join(pastaCert, 'hotspot-producao.p12');
    if(!fs.existsSync(pastaCert)) fs.mkdirSync(pastaCert, {recursive:true});
    if(base64 && base64.length > 100){
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(certPath, buffer);
      fs.writeFileSync(path.join(__dirname, 'certificado.p12'), buffer);
      console.log('[SLS] Certificado criado:', certPath, buffer.length);
      return certPath;
    }
    if(fs.existsSync(certPath)) return certPath;
  }catch(e){
    console.log('[SLS] Erro cert:', e.message);
  }
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
  res.send('OK '+ip);
});

app.post('/api/criar-pix', async (req,res)=>{
  try{
    const EfiPay = require('sdk-node-apis-efi');
    const valor = Number(req.body.valor)||2;
    const valorStr = valor.toFixed(2);
    const clientId = (process.env.EFI_CLIENT_ID||'').trim();
    const clientSecret = (process.env.EFI_CLIENT_SECRET||'').trim();
    const chavePix = (process.env.EFI_PIX_KEY||'50574099000103').trim();

    console.log('[SLS] Iniciando PIX REAL', valorStr, 'CERT:', CERT_FINAL);

    if(!CERT_FINAL || !fs.existsSync(CERT_FINAL)){
      throw new Error('Certificado nao encontrado');
    }
    if(!clientId.startsWith('Client_Id_')){
      throw new Error('CLIENT_ID tem que comecar com Client_Id_ completo');
    }

    const efipay = new EfiPay({
      sandbox: false,
      client_id: clientId,
      client_secret: clientSecret,
      certificate: CERT_FINAL
    });

    const pix = await efipay.pixCreateImmediateCharge([], {
      calendario:{expiracao:3600},
      devedor:{cpf:"12345678909", nome:"Cliente SLS WIFI"},
      valor:{original:valorStr},
      chave: chavePix,
      solicitacaoPagador:"SLS WIFI - R$ "+valorStr
    });

    const qr = await efipay.pixGenerateQRCode({id: pix.loc.id});
    console.log('[SLS] PIX REAL OK:', pix.txid);
    return res.json({txid: pix.txid, pixCopiaECola: qr.qrcode, qrcode: qr.qrcode, imagemQrcode: qr.imagemQrcode});

  }catch(e){
    console.log('[SLS] Erro PIX:', e.message);
    return res.status(500).json({error: e.message, detalhes: e.errors || null});
  }
});

app.post('/api/gerar-pix',(req,res)=>{
  req.url='/api/criar-pix';
  app.handle(req,res);
});

app.listen(PORT,'0.0.0.0',()=>console.log('SLS WIFI v6.2 FINAL CORRIGIDO - CERT: '+CERT_FINAL+' - PORTA '+PORT));