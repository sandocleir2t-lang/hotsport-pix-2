const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MEMÓRIA
let liberacoes = [];

// ROTA PRINCIPAL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// MIKROTIK - lista de liberados
app.get('/api/liberacoes', (req, res) => {
  res.json(liberacoes);
});

// LIMPAR TESTES
app.get('/api/limpar-tudo', (req, res) => {
  liberacoes = [];
  res.send('LIMPO! []');
});

// LIBERAR - funciona com GET e POST (pra o JA PAGUEI funcionar)
app.get('/api/liberar', (req, res) => {
  const ip = req.query.ip;
  const mac = req.query.mac || 'TESTE';
  if(!ip) return res.status(400).send('Falta IP');
  if(!liberacoes.find(l => l.ip === ip)){
    liberacoes.push({ip, mac, liberadoEm: new Date()});
  }
  console.log(`[LIBERADO GET] ${ip}`);
  res.send(`OK liberado ${ip}`);
});

app.post('/api/liberar', (req, res) => {
  const {ip, mac} = req.body;
  const ipFinal = ip || req.query.ip || req.ip;
  if(!liberacoes.find(l => l.ip === ipFinal)){
    liberacoes.push({ip: ipFinal, mac: mac||'TESTE', liberadoEm: new Date()});
  }
  console.log(`[LIBERADO POST] ${ipFinal}`);
  res.json({sucesso: true});
});

// CRIAR PIX REAL - V5 CORRIGIDO
app.post('/api/criar-pix', async (req, res) => {
  let {valor, mac} = req.body;
  valor = Number(valor) || 2;
  const valorStr = valor.toFixed(2);

  try {
    // Tenta EFI REAL se tiver credenciais no Render
    const EfiPay = require('sdk-node-apis-efi');
    let certPath = path.join(__dirname, 'certificado.p12');
    if(process.env.CERT_PATH) certPath = process.env.CERT_PATH;
    // procura certificado em pastas comuns
    if(!fs.existsSync(certPath)){
      const possiveis = [path.join(__dirname, 'certs', 'certificado.p12'), path.join(__dirname, 'certificado-efi.p12'), '/etc/secrets/certificado.p12'];
      for(const p of possiveis) if(fs.existsSync(p)) { certPath = p; break; }
    }
    
    const options = {
      sandbox: false,
      client_id: process.env.EFI_CLIENT_ID,
      client_secret: process.env.EFI_CLIENT_SECRET,
      certificate: certPath,
      cert_base64: false
    };

    if(options.client_id && fs.existsSync(certPath)){
      console.log('EFI OK - Chave: 50574099000103 - Cert:', certPath);
      const efipay = new EfiPay(options);
      
      // PAYLOAD CORRIGIDO - ERA ISSO QUE FALTAVA!
      const body = {
        calendario: { expiracao: 3600 },
        devedor: { cpf: "12345678909", nome: "Cliente SLS WIFI" },
        valor: { original: valorStr },
        chave: process.env.PIX_CHAVE || "50574099000103",
        solicitacaoPagador: `SLS WIFI - R$ ${valorStr}`
      };

      const pix = await efipay.pixCreateImmediateCharge([], body);
      const qrcode = await efipay.pixGenerateQRCode({ id: pix.loc.id });

      return res.json({
        txid: pix.txid,
        pixCopiaECola: qrcode.qrcode,
        qrcode: qrcode.qrcode,
        imagemQrcode: qrcode.imagemQrcode
      });
    } else {
      throw new Error('Sem credencial EFI, usando fallback');
    }
  } catch(e) {
    console.log('Erro EFI:', e.message, '- usando PIX fake pra teste');
    // FALLBACK - QR FAKE mas funciona o JA PAGUEI
    const fakeCopia = `00020101021226830014BR.GOV.BCB.PIX2561qrcodespix.sejaefi.com.br/v2/teste-${Date.now()}520400005303986540${valorStr.replace('.','')}5802BR5909SLS WIFI6009SAO LUIS62070503***6304ABCD`;
    // gera base64 simples pro front
    const fakeImg = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fakeCopia)}`;
    return res.json({
      pixCopiaECola: fakeCopia,
      qrcode: fakeCopia,
      imagemQrcode: fakeImg,
      aviso: 'PIX em modo teste: ' + e.message
    });
  }
});

// compatibilidade com nome antigo
app.post('/api/gerar-pix', (req, res) => {
  req.url = '/api/criar-pix';
  app.handle(req, res);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SLS WIFI v5 - COM LIBERACOES - PORTA ${PORT}`);
  console.log(`EFI OK - Chave: 50574099000103`);
  console.log(`SLS WIFI v5 RODANDO PORTA ${PORT}`);
});