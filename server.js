const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(cors());
app.use(express.json());
const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado(){try{const b=process.env.EFI_CERTIFICADO_BASE64;if(!b)return;const buf=Buffer.from(b.replace(/\s/g,''),'base64');fs.writeFileSync(CERT_PATH,buf);console.log('CERT OK',buf.length);}catch(e){console.log('ERRO CERT',e.message);}}
garanteCertificado();
const efiOptions={sandbox:false,client_id:process.env.EFI_CLIENT_ID,client_secret:process.env.EFI_CLIENT_SECRET,certificate:CERT_PATH,certificado:CERT_PATH,pixCert:CERT_PATH};
let fila=[];
let fila = [];
try {
  if(fs.existsSync('/tmp/fila.json')){
    fila = JSON.parse(fs.readFileSync('/tmp/fila.json','utf8'));
  }
} catch(e){ fila=[] }

function salvaFila(){
  try{ fs.writeFileSync('/tmp/fila.json', JSON.stringify(fila)); }catch(e){}
}

// quando a EFI mandar webhook CONCLUIDA
app.post('/webhook', async (req,res)=>{
  const pix = req.body.pix || [];
  for(const p of pix){
    if(p.status === 'CONCLUIDA'){
      let txid = p.txid;
      let item = fila.find(f=> f.txid === txid);
      if(item){
        item.status = 'PAGO_LIBERAR';
        item.concluidoEm = new Date().toISOString();
      }
      salvaFila();
      console.log(`STATUS ${txid} -> CONCLUIDA virou PAGO_LIBERAR`);
    }
  }
  res.sendStatus(200);
});

app.get('/fila',(req,res)=>{
  res.json(fila.filter(f=> f.status === 'PAGO_LIBERAR'));
});

app.get('/confirma/:txid',(req,res)=>{
  fila = fila.filter(f=> f.txid !== req.params.txid);
  salvaFila();
  res.json({ok:true});
});
