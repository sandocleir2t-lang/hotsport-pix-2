const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi').default;

const app = express();
app.use(cors());
app.use(express.json());

// ===== FIX DEFINITIVO CERTIFICADO - hotspot-producao.p12 =====
const CERT_PATH = '/tmp/hotspot-producao.p12';

function garanteCertificado() {
  try {
    const base64 = process.env.EFI_CERTIFICADO_BASE64;
    if (!base64) throw new Error('EFI_CERTIFICADO_BASE64 não definida no Render');

    // Limpa quebras de linha e espaços que o Render adiciona
    const limpo = base64.replace(/\s/g, '');
    const buffer = Buffer.from(limpo, 'base64');
    
    fs.writeFileSync(CERT_PATH, buffer);
    console.log('✅ CERTIFICADO SALVO:', CERT_PATH, '| Tamanho:', buffer.length, 'bytes');
  } catch (e) {
    console.error('❌ ERRO AO SALVAR CERTIFICADO:', e.message);
  }
}
garanteCertificado();

const efiOptions = {
  sandbox: false, // false = PRODUÇÃO / LIVE
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificado: CERT_PATH,
  pixCert: CERT_PATH
};

// ===== FILA VIA STATUS =====
let fila = [];

app.get('/', (req, res) => res.send('SLS WIFI - ONLINE - PIX REAL'));

app.post('/criar-pix', async (req, res) => {
  try {
    const { nome, valor, tempo } = req.body;
    
    // Garante que o cert existe antes de cada chamada
    if (!fs.existsSync(CERT_PATH)) garanteCertificado();

    const efipay = new EfiPay(efiOptions);

    const body = {
      calendario: { expiracao: 3600 },
      devedor: { nome: nome || 'Cliente SLS WIFI' },
      valor: { original: (valor || '5.00').toString() },
      chave: process.env.EFI_CHAVE_PIX,
      infoAdicionais: [{ nome: 'Plano', valor: `${tempo || 60} min` }]
    };

    const cob = await efipay.pixCreateImmediateCharge([], body);
    const qrcode = await efipay.pixGenerateQRCode({ id: cob.loc.id });

    // FILA ADD VIA STATUS
    fila.push({
      txid: cob.txid,
      nome: nome || 'Cliente',
      tempo: parseInt(tempo) || 60,
      valor: valor || '5.00',
      status: 'AGUARDANDO',
      criadoEm: new Date()
    });

    console.log('✅ QR REAL GERADO:', cob.txid);

    res.json({
      txid: cob.txid,
      qr_code: qrcode.qrcode,
      imagem: qrcode.imagemQrcode,
      copia_e_cola: qrcode.qrcode,
      loc: cob.loc
    });

  } catch (err) {
    console.error('❌ ERRO PIX:', err.message);
    console.error(err);
    res.status(500).json({ 
      erro: 'Falha ao gerar PIX real', 
      detalhes: err.message,
      stack: err.stack 
    });
  }
});

app.get('/status/:txid', async (req, res) => {
  try {
    if (!fs.existsSync(CERT_PATH)) garanteCertificado();
    const efipay = new EfiPay(efiOptions);
    const consulta = await efipay.pixDetailCharge({ txid: req.params.txid });
    
    // FILA ADD VIA STATUS - quando paga libera
    if (consulta.status === 'CONCLUIDA') {
      const item = fila.find(f => f.txid === req.params.txid);
      if (item) {
        item.status = 'PAGO_LIBERAR';
        console.log('✅ PAGO - LIBERAR WIFI:', item.txid);
      }
    }

    res.json(consulta);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get('/fila', (req, res) => res.json(fila));

app.delete('/fila/:txid', (req, res) => {
  fila = fila.filter(f => f.txid !== req.params.txid);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🔥 SLS WIFI RODANDO na porta', PORT);
  console.log('📁 Certificado:', CERT_PATH, 'Existe?', fs.existsSync(CERT_PATH));
});
