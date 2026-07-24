const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
      console.log('[SLS] Certificado criado:', certPath, buffer.length);
      process.env.EFI_CERT_PATH = certPath;
      return certPath;
    }
    if(fs.existsSync(certPath)){
      process.env.EFI_CERT_PATH = certPath;
      return certPath;
    }
  }catch(e){ console.log('[SLS] Erro cert:', e.message); }
  return null;
}
const CERT_FINAL = garantirCertificado();
console.log('SLS WIFI v6.3 FIX - CERT:', CERT_FINAL, '- PORTA', PORT);

const { criarCobrancaPix } = require('./efi');

app.get('/api/liberacoes',(req,res)=> res.json(liberacoes));
app.get('/api/limpar-tudo',(req,res)=>{ liberacoes=[]; res.send('LIMPO'); });

app.get('/api/liberar',(req,res)=>{
  const ip=req.query.ip; 
  if(!ip) return res.status(400).send('Falta IP');
  if(!liberacoes.find(l=>l.ip===ip)) liberacoes.push({ip, liberadoEm:new Date()});
  res.send('OK '+ip);
});

async function handleCriarPix(req,res){
  try{
    const valor = Number(req.body?.valor || req.query.valor || 2);
    console.log('[SLS] Gerando PIX R$', valor);
    const result = await criarCobrancaPix(valor);
    return res.json(result);
  }catch(e){
    console.log('[SLS] Erro PIX:', e.message);
    return res.status(500).json({error: e.message});
  }
}

app.post('/api/criar-pix', handleCriarPix);
app.get('/api/criar-pix', handleCriarPix);
app.post('/api/gerar-pix', handleCriarPix);
app.get('/api/gerar-pix', handleCriarPix);
app.post('/api/pix', handleCriarPix);
app.get('/api/pix', handleCriarPix);

app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,'0.0.0.0',()=>console.log('SLS WIFI v6.3 FIX - ONLINE PORTA '+PORT));
