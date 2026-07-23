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
    const base64 = (process.env.EFI_CERT_BASE64 || '').trim();
    const certPath1 = path.join(__dirname, 'certificados', 'hotspot-producao.p12');
    const certPath2 = path.join(__dirname, 'certificado.p12');
    const pastaCert = path.join(__dirname, 'certificados');
    if(!fs.existsSync(pastaCert)) fs.mkdirSync(pastaCert, {recursive:true});
    
    if(base64 && base64.length > 100){
      // Limpa quebras de linha que o Render as vezes coloca
      const base64Limpo = base64.replace(/\s/g, '');
      const buffer = Buffer.from(base64Limpo, 'base64');
      fs.writeFileSync(certPath1, buffer);
      fs.writeFileSync(certPath2, buffer);
      console.log('[SLS] Certificado criado do BASE64:', certPath1, 'tamanho:', buffer.length);
      return certPath1;
    }
    if(fs.existsSync(certPath1)) return certPath1;
    if(fs.existsSync(certPath2)) return certPath2;
    if(fs.existsSync(process.env.EFI_CERTIFICATE || '')) return process.env.EFI_CERTIFICATE;
  }catch(e){ console.log('[SLS] Erro cert:', e.message); }
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

// CRIAR PIX REAL - CORRIGIDO
app.post('/api/criar-pix', async (req,res)=>{
  let {valor}=req.body;
  valor = Number(valor)||2;
  const valorStr = valor.toFixed(2);
  try{
    const EfiPay = require('sdk-node-apis-efi');
    
    // CORREÇÃO PRINCIPAL: NÃO REMOVE O Client_Id_ e Client_Secret_
    const clientId = (process.env.EFI_CLIENT_ID||'').trim();
    const clientSecret = (process.env.EFI_CLIENT_SECRET||'').trim();
    const chavePix = (process.env.EFI_CHAVE_PIX || process.env.EFI_PIX_KEY || '50574099000103').trim();

    const options = {
      sandbox: false,
      client_id: clientId,
      client_secret: clientSecret,
      certificate: CERT_FINAL,
    };
    
    console.log('[SLS] Tentando EFI REAL com cert:', options.certificate, ' | Client_Id:', clientId.substring(0,20)+'...', ' | chave:', chavePix);
    
    if(!options.certificate || !fs.existsSync(options.certificate)) throw new Error('Certificado P12 nao encontrado. Verifique EFI_CERT_BASE64 no Render');
    if(!clientId.startsWith('Client_Id_')) throw new Error('EFI_CLIENT_ID tem que comecar com Client_Id_');
    
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
    
    console.log('[SLS] PIX REAL GERADO:', pix.txid);
    return res.json({txid:pix.txid, pixCopiaECola:qr.qrcode, qrcode:qr.qrcode, imagemQrcode:qr.imagemQrcode});
    
  }catch(e){
    console.log('[SLS] Falha EFI REAL:', e.message, e.nome || '', JSON.stringify(e.errors||'').substring(0,500));
    return res.status(500).json({error: