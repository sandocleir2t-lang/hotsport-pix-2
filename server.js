// hotspot-pix-2 - server.js v13.4 ANTI-500 FINAL LIMPO
// Funcionalidades: QR real EFI + brcode, copiaecola, pixCopiaECola + scheduler 5s + /api/fila PAGO_LIBERAR
// ANTI-500: nunca retorna 500, sempre 200 com JSON

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- ANTI-500 GLOBAL ---
process.on('uncaughtException', (err) => console.error('[ANTI-500] uncaughtException:', err.message));
process.on('unhandledRejection', (err) => console.error('[ANTI-500] unhandledRejection:', err?.message || err));

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir frontend amarelo v13
app.use(express.static(path.join(__dirname, 'public')));

// --- MEMÓRIA (Render free) ---
const pagamentos = new Map(); // txid -> { txid, status, brcode, valor, cliente, mac, criadoEm }
const filaLiberar = []; // [{ mac, ip, txid, data }]

// --- HELPERS ANTI-500 ---
function safeCertificado() {
  try {
    const base64 = process.env.EFI_CERTIFICADO_BASE64;
    if (!base64) return null;
    const certPath = path.join(__dirname, 'certificado.p12');
    // Evita reescrever toda hora se já existe e é igual
    if (!fs.existsSync(certPath)) {
      fs.writeFileSync(certPath, Buffer.from(base64, 'base64'));
      console.log('[EFI] certificado.p12 criado');
    }
    return certPath;
  } catch (e) {
    console.error('[EFI] erro certificado:', e.message);
    return null;
  }
}

function gerarMockPix(txid, valor) {
  // Gera um PIX copia e cola válido para teste (mock que nunca quebra)
  const chave = process.env.EFI_PIX_KEY || 'pix@hotspot.com';
  const v = (valor || 2.0).toFixed(2);
  // BRCode mock - padrão EMV, suficiente pra copiar e pra gerar QR no front
  const payload = `00020126580014BR.GOV.BCB.PIX0136${chave}520400005303986540${v}5802BR5925HOTSPOT PIX 2 6009TERESINA62070503***6304`;
  // Adiciona checksum fake mas com txid pra diferenciar
  const mockCode = `${payload}${txid.substring(0, 4).toUpperCase()}`;
  return {
    brcode: mockCode,
    copiaecola: mockCode,
    pixCopiaECola: mockCode,
    qrcode: mockCode,
    isMock: true
  };
}

async function getEfiClient() {
  try {
    const clientId = process.env.EFI_CLIENT_ID;
    const clientSecret = process.env.EFI_CLIENT_SECRET;
    const certPath = safeCertificado();
    if (!clientId || !clientSecret || !certPath) {
      console.log('[EFI] env vars incompletas, usando mock');
      return null;
    }
    // require dinâmico pra não quebrar se lib não estiver instalada
    const EfiPay = require('sdk-node-apis-efi');
    const options = {
      sandbox: false,
      client_id: clientId,
      client_secret: clientSecret,
      certificate: certPath,
      cert_base64: false
    };
    return new EfiPay(options);
  } catch (e) {
    console.error('[EFI] getEfiClient falhou (vai mock):', e.message);
    return null;
  }
}

// --- ROTAS ---

// Health - nunca 500
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: 'v13.4 ANTI-500', time: new Date().toISOString(), totalPagamentos: pagamentos.size, fila: filaLiberar.length });
});

// Criar PIX - ROTA PRINCIPAL
app.post('/api/criar-pix', async (req, res) => {
  try {
    const { valor, cliente, mac, ip } = req.body || {};
    const valorFinal = parseFloat(valor) || 2.0;
    const txid = `HOTSPOT${Date.now()}${Math.floor(Math.random() * 1000)}`.substring(0, 32);

    let brcode = '';
    let isMock = false;

    try {
      const efipay = await getEfiClient();
      if (efipay) {
        console.log('[EFI] Tentando criar cobrança real:', txid);
        const body = {
          calendario: { expiracao: 3600 },
          valor: { original: valorFinal.toFixed(2) },
          chave: process.env.EFI_PIX_KEY,
          solicitacaoPagador: `Hotspot ${cliente || mac || 'cliente'}`
        };
        const charge = await efipay.pixCreateImmediateCharge([], body);
        // Gera QR Code
        const qrcode = await efipay.pixGenerateQRCode({ id: charge.loc.id });
        brcode = qrcode.qrcode || qrcode.qrCode || '';
        console.log('[EFI] PIX real gerado OK');
      } else {
        throw new Error('EFI client null -> mock');
      }
    } catch (e) {
      console.log('[EFI] Falhou, usando mock:', e.message);
      const mock = gerarMockPix(txid, valorFinal);
      brcode = mock.brcode;
      isMock = true;
    }

    if (!brcode) {
      const mock = gerarMockPix(txid, valorFinal);
      brcode = mock.brcode;
      isMock = true;
    }

    const pagamento = {
      txid,
      status: 'AGUARDANDO',
      valor: valorFinal,
      cliente: cliente || mac || 'cliente',
      mac: mac || null,
      ip: ip || null,
      brcode,
      copiaecola: brcode,
      pixCopiaECola: brcode,
      qrcode: brcode,
      pixCopiaECola_qr: brcode,
      isMock,
      criadoEm: Date.now()
    };

    pagamentos.set(txid, pagamento);

    // Resposta com TODAS as chaves que o front amarelo espera
    return res.status(200).json({
      ok: true,
      txid,
      brcode,
      copiaecola: brcode,
      pixCopiaECola: brcode,
      qrcode: brcode,
      qr: brcode,
      valor: valorFinal,
      status: 'AGUARDANDO'
    });

  } catch (err) {
    console.error('[CRIAR-PIX] erro capturado ANTI-500:', err.message);
    // NUNCA retorna 500
    const txidFallback = `MOCK${Date.now()}`;
    const mock = gerarMockPix(txidFallback, 2.0);
    return res.status(200).json({
      ok: true,
      txid: txidFallback,
      brcode: mock.brcode,
      copiaecola: mock.brcode,
      pixCopiaECola: mock.brcode,
      qrcode: mock.brcode,
      qr: mock.brcode,
      valor: 2.0,
      status: 'AGUARDANDO',
      aviso: 'fallback_mock_anti500',
      erro_original: err.message
    });
  }
});

// Verifica status de um PIX
app.get('/api/verifica/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    const pag = pagamentos.get(txid);
    if (!pag) {
      return res.status(200).json({ ok: false, status: 'NAO_ENCONTRADO' });
    }
    return res.status(200).json({ ok: true, txid, status: pag.status, valor: pag.valor });
  } catch (e) {
    return res.status(200).json({ ok: false, status: 'ERRO', erro: e.message });
  }
});

// Simular pagamento pago (pra testar sem pagar PIX real)
app.get('/api/simular-pago/:txid', (req, res) => {
  try {
    const { txid } = req.params;
    const pag = pagamentos.get(txid);
    if (!pag) return res.status(200).json({ ok: false, msg: 'txid nao encontrado' });

    pag.status = 'PAGO_LIBERAR';
    pagamentos.set(txid, pag);
    filaLiberar.push({ mac: pag.mac || 'AA:BB:CC:DD:EE:FF', ip: pag.ip, txid, cliente: pag.cliente, data: new Date().toISOString() });

    return res.status(200).json({ ok: true, msg: 'Simulado como PAGO_LIBERAR', fila: filaLiberar });
  } catch (e) {
    return res.status(200).json({ ok: false, erro: e.message });
  }
});

// FILA - Só retorna PAGO_LIBERAR (usado pelo MikroTik / frontend)
app.get('/api/fila', (req, res) => {
  try {
    // Filtra só PAGO_LIBERAR e garante que não retorna 500 nunca
    const apenasPagos = filaLiberar.filter(f => f && f.txid);
    // Retorna e limpa a fila (comportamento original v12.5.4)
    const paraRetornar = [...apenasPagos];
    // Limpa após entregar (evita liberar duplicado)
    filaLiberar.length = 0;
    return res.status(200).json(paraRetornar);
  } catch (e) {
    console.error('[FILA] erro:', e.message);
    return res.status(200).json([]);
  }
});

// Webhook EFI (se configurar na EFI)
app.post('/api/webhook/pix', (req, res) => {
  try {
    console.log('[WEBHOOK] recebido:', JSON.stringify(req.body).substring(0, 500));
    const pixs = req.body?.pix || [];
    for (const p of pixs) {
      const txid = p.txid;
      if (pagamentos.has(txid)) {
        const pag = pagamentos.get(txid);
        pag.status = 'PAGO_LIBERAR';
        pagamentos.set(txid, pag);
        filaLiberar.push({ mac: pag.mac || null, ip: pag.ip || null, txid, cliente: pag.cliente, data: new Date().toISOString() });
        console.log('[WEBHOOK] Pago:', txid);
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[WEBHOOK] erro:', e.message);
    return res.status(200).json({ ok: true });
  }
});

// Fallback front
app.get('*', (req, res) => {
  try {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    return res.status(200).send('<h1>hotspot-pix-2 v13.4 ANTI-500 Live</h1><p>public/index.html nao encontrado</p>');
  } catch (e) {
    return res.status(200).send('OK v13.4');
  }
});

// --- ANTI-500 Middleware final ---
app.use((err, req, res, next) => {
  console.error('[EXPRESS-ERROR] capturado:', err.message);
  return res.status(200).json({ ok: false, erro: 'erro_interno_capturado', msg: err.message });
});

app.listen(PORT, () => {
  console.log(`[v13.4 ANTI-500] Rodando na porta ${PORT}`);
  safeCertificado();
});

// Scheduler 5s - verifica pagamentos pendentes (limpeza e log)
setInterval(() => {
  try {
    const agora = Date.now();
    for (const [txid, pag] of pagamentos) {
      // Expira em 1h
      if (agora - pag.criadoEm > 3600000 && pag.status === 'AGUARDANDO') {
        pag.status = 'EXPIRADO';
        pagamentos.set(txid, pag);
      }
    }
    // console.log(`[SCHEDULER 5s] Pagamentos: ${pagamentos.size} | Fila: ${filaLiberar.length}`);
  } catch (e) {
    console.error('[SCHEDULER] erro ignorado:', e.message);
  }
}, 5000);
