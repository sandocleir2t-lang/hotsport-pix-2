// server.js v12.5.6 CLEAN LOG - SLS EVENTO
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FILA_PATH = path.join(__dirname, 'fila.json');

let fila = [];
try{
  if(fs.existsSync(FILA_PATH)){
    fila = JSON.parse(fs.readFileSync(FILA_PATH,'utf8') || '[]');
  }
}catch(e){
  fila = [];
}

// SALVA SEM FLOODAR LOG
function salvarFila(){
  try{
    fs.writeFileSync(FILA_PATH, JSON.stringify(fila,null,2));
    if(fila.length > 0){
      console.log(`FILA SALVA total=${fila.length} PAGO_LIBERAR=${fila.filter(f=>f.status==='PAGO_LIBERAR').length} AGUARDANDO=${fila.filter(f=>f.status==='AGUARDANDO').length}`);
    }
  }catch(e){
    console.log('ERRO SALVAR FILA', e.message);
  }
}

function gerarVoucher(){
  const n = Math.floor(1000 + Math.random()*9000);
  return `SLS-${n}`;
}

// EFÍ CONFIG
let EfiPay = null;
try{
  EfiPay = require('sdk-node-apis-efi').default;
}catch(e){
  try{
    EfiPay = require('sdk-node-apis-efi');
  }catch(e2){}
}

const EFI_CERT = process.env.EFI_CERT_BASE64? Buffer.from(process.env.EFI_CERT_BASE64, 'base64') : null;

function getEfiClient(){
  if(!EfiPay ||!EFI_CERT) return null;
  const options = {
    sandbox: false,
    client_id: process.env.EFI_CLIENT_ID,
    client_secret: process.env.EFI_CLIENT_SECRET,
    certificate: EFI_CERT,
    certBase64: false
  };
  return new EfiPay(options);
}

// 1. CRIAR PIX
app.post('/api/pix', async (req,res)=>{
  try{
    const { valor, plano, mac, ip, nome } = req.body;
    if(!valor) return res.status(400).json({error:'valor obrigatorio'});

    const client = getEfiClient();
    if(!client){
      console.log('EFI SEM CLIENT - MOCK');
      const voucher = gerarVoucher();
      const item = {
        id: Date.now().toString(),
        status: 'AGUARDANDO',
        valor: Number(valor),
        plano: plano || '1H',
        mac: (mac||'').toLowerCase(),
        ip: ip || '',
        nome: nome || '',
        voucher,
        criacao: new Date().toISOString()
      };
      fila.push(item);
      salvarFila();
      return res.json({ qrcode: '000201 MOCK', txid: item.id, voucher });
    }

    const valorStr = Number(valor).toFixed(2);
    const body = {
      calendario: { expiracao: 3600 },
      devedor: { nome: nome || 'Cliente SLS' },
      valor: { original: valorStr },
      chave: process.env.EFI_PIX_KEY,
      // FIX DO ERRO infoAdicionais[1].valor VAZIO
      infoAdicionais: [
        { nome: 'Plano', valor: String(plano||'1H') },
        { nome: 'Voucher', valor: gerarVoucher() },
        { nome: 'MAC', valor: String(mac||'').substring(0,20) || 'NAO_INFORMADO' }
      ].filter(i=>i.valor && i.valor.trim()!== '')
    };

    const cob = await client.pixCreateImmediateCharge({}, body);
    const qrcode = await client.pixGenerateQRCode({ id: cob.loc.id });

    const item = {
      id: String(cob.txid || cob.txid),
      locId: cob.loc.id,
      txid: cob.txid,
      status: 'AGUARDANDO',
      valor: Number(valor),
      plano: plano || '1H',
      mac: (mac||'').toLowerCase(),
      ip: ip || '',
      nome: nome || '',
      voucher: body.infoAdicionais.find(i=>i.nome==='Voucher')?.valor || gerarVoucher(),
      criacao: new Date().toISOString(),
      qrcode: qrcode.qrcode
    };

    fila.push(item);
    salvarFila();

    console.log(`PIX GERADO R$ ${valorStr} Plano ${plano} IP ${ip} MAC ${mac}`);

    return res.json({ qrcode: qrcode.qrcode, qrcodeImage: qrcode.imagemQrcode, txid: item.txid, voucher: item.voucher });

  }catch(err){
    console.error('ERRO /api/pix', err.message, err.stack);
    return res.status(500).json({error: err.message});
  }
});

// 2. VERIFICAR PAGAMENTO
app.get('/api/verificar/:txid', async (req,res)=>{
  try{
    const { txid } = req.params;
    const client = getEfiClient();
    let pago = false;

    if(client){
      try{
        const consulta = await client.pixDetailCharge({ txid });
        if(consulta.status === 'CONCLUIDA' || consulta.pix && consulta.pix.length > 0){
          pago = true;
        }
      }catch(e){
        // se falhar consulta, mantém AGUARDANDO
      }
    }

    const item = fila.find(f=>f.txid===txid || f.id===txid);
    if(item && pago){
      item.status = 'PAGO_LIBERAR';
      salvarFila();
      console.log(`✅ PAGO CONFIRMADO txid=${txid} voucher=${item.voucher} IP=${item.ip} MAC=${item.mac}`);
    }

    // MOCK pra teste se não tem EFI
    if(!client){
      if(item){
        // simula pago depois de 15s
        const diff = Date.now() - new Date(item.criacao).getTime();
        if(diff > 15000){
          item.status = 'PAGO_LIBERAR';
          salvarFila();
          pago = true;
        }
      }
    }

    return res.json({ pago, status: item?.status || 'NAO_ENCONTRADO', voucher: item?.voucher });
  }catch(err){
    return res.status(500).json({error: err.message});
  }
});

// 3. FILA PARA O MIKROTIK PUXAR
app.get('/api/fila', (req,res)=>{
  // ESSA ROTA ERA A QUE FLOODAVA - AGORA NÃO LOGA MAIS SE TOTAL=0
  res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));
});

app.get('/api/liberacoes', (req,res)=>{
  const liberados = fila.filter(f=>f.status==='PAGO_LIBERAR');
  res.json(liberados);
});

// 4. MIKROTIK AVISA QUE LIBEROU
app.post('/api/liberar', (req,res)=>{
  try{
    const { txid, mac, ip } = req.body;
    const idx = fila.findIndex(f=> (f.txid===txid || f.id===txid) || (mac && f.mac===mac.toLowerCase()));
    if(idx >= 0){
      console.log(`✅ LIBERADO RAPIDO ${fila[idx].voucher} ${fila[idx].ip} -> ${ip||''} ${fila[idx].mac}`);
      fila.splice(idx,1);
      salvarFila();
    }
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({error:e.message});
  }
});

app.get('/', (req,res)=> res.send('SLS API v12.5.6 CLEAN LOG ON'));

app.listen(PORT, ()=> console.log(`SLS API RODANDO PORTA ${PORT}`));
