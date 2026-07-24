// server.js - SLS WIFI v6.4 FIX - HOTSPOT PIX + EFI
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getEfiInstance } = require('./efi');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

console.log('=== SLS WIFI v6.4 FIX - Iniciando ===');
console.log('EFI_CERT_PATH:', process.env.EFI_CERT_PATH);
console.log('EFI_CERT_BASE64 existe?', !!process.env.EFI_CERT_BASE64);
console.log('EFI_CLIENT_ID existe?', !!process.env.EFI_CLIENT_ID);

// Rota principal - serve o index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ROTA QUE O INDEX.HTML CHAMA - CRIAR PIX
app.post('/api/criar-pix', async (req, res) => {
  try {
    const { mac, ip, valor } = req.body;
    const valorCentavos = valor || 300; // R$3,00 padrão
    const valorReais = (valorCentavos / 100).toFixed(2);

    console.log(`[PIX] Gerando PIX de R$${valorReais} para MAC: ${mac} IP: ${ip}`);

    const efipay = getEfiInstance();

    // 1. Cria a cobrança imediata
    const bodyCharge = {
      calendario: { expiracao: 3600 }, // 1 hora pra pagar
      devedor: { nome: `Cliente SLS WIFI ${mac || 'anon'}`.substring(0, 30) },
      valor: { original: valorReais },
      chave: process.env.EFI_PIX_KEY, // sua chave PIX da Efí
      solicitacaoPagador: 'SLS WIFI - Acesso 3 horas',
      infoAdicionais: [
        { nome: 'MAC', valor: mac || 'nao-informado' },
        { nome: 'IP', valor: ip || 'nao-informado' }
      ]
    };

    const charge = await efipay.pixCreateImmediateCharge([], bodyCharge);
    console.log('[PIX] Cobrança criada:', charge.txid);

    // 2. Gera o QRCode (aqui vem a imagemQrcode)
    const qrcode = await efipay.pixGenerateQRCode({ id: charge.loc.id });
    console.log('[PIX] QRCode gerado');

    // 3. Retorna no formato que o front novo espera
    return res.json({
      txid: charge.txid,
      locId: charge.loc.id,
      qrcode: qrcode.qrcode, // copia e cola
      pixCopiaECola: qrcode.qrcode,
      imagemQrcode: qrcode.imagemQrcode, // <-- ESSENCIAL PRO FRONT
      valor: valorReais
    });

  } catch (err) {
    console.error('[ERRO /api/criar-pix]', err);
    return res.status(500).json({ 
      erro: err.message, 
      detalhes: err.stack,
      response: err.response?.data || null
    });
  }
});

// Alias antigo que seu index antigo chamava
app.post('/api/gerar-pix', (req, res) => {
  // redireciona pra nova rota
  req.url = '/api/criar-pix';
  app.handle(req, res);
});

// CHECK DE PAGAMENTO - o front chama a cada 4s
app.get('/api/pix', async (req, res) => {
  try {
    const { txid } = req.query;
    if (!txid) return res.status(400).json({ erro: 'txid obrigatório' });

    const efipay = getEfiInstance();
    const result = await efipay.pixDetailCharge({ txid });

    console.log(`[CHECK] ${txid} status: ${result.status}`);

    // Se pago, aqui você pode liberar no MikroTik via API se quiser
    if (result.status === 'CONCLUIDA') {
      return res.json({ status: 'CONCLUIDA', pago: true, dados: result });
    }

    return res.json({ status: result.status, pago: false });

  } catch (err) {
    console.error('[ERRO /api/pix]', err.message);
    // se txid não existe ainda, retorna pendente
    return res.json({ status: 'ATIVA', pago: false });
  }
});

app.get('/api/pix/:txid', async (req, res) => {
  req.query.txid = req.params.txid;
  return app._router.handle({ ...req, url: `/api/pix?txid=${req.params.txid}`, query: { txid: req.params.txid }, method: 'GET' }, res, () => {});
});

// Webhook da Efí (opcional, mas recomendado)
app.post('/api/webhook-pix', express.json(), (req, res) => {
  console.log('[WEBHOOK] Recebido:', JSON.stringify(req.body));
  // Aqui você pode validar e liberar o cliente
  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`🚀 SLS WIFI v6.4 rodando na porta ${PORT}`);
});
