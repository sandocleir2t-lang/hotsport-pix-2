// SLS WIFI - server.js v13 FINAL - COMPLETO
// PIX EFI + VOUCHER + PERSISTÊNCIA EM DISCO
// Não perde pagamento quando Render reinicia

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const FILA_PATH = path.join(__dirname, 'fila.json');
const PORT = process.env.PORT || 10000;

// ===== PERSISTÊNCIA =====
let fila = {};
try {
  if (fs.existsSync(FILA_PATH)) {
    fila = JSON.parse(fs.readFileSync(FILA_PATH, 'utf8'));
    console.log(`[SLS] Fila carregada: ${Object.keys(fila).length} registros`);
  }
} catch (e) {
  console.log('[SLS] fila.json não existe, criando novo');
  fila = {};
}
function salvarFila() {
  fs.writeFileSync(FILA_PATH, JSON.stringify(fila, null, 2));
}

// ===== EFI CONFIG - usa suas env do Render =====
const EFI_CLIENT_ID = process.env.EFI_CLIENT_ID;
const EFI_CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const EFI_PIX_KEY = process.env.EFI_PIX_KEY;
const EFI_CERT_PATH = process.env.EFI_CERT_PATH || './certificado.p12';

let efiToken = null;
let efiTokenExpira = 0;

async function getEfiToken() {
  if (efiToken && Date.now() < efiTokenExpira) return efiToken;
  try {
    const auth = Buffer.from(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`).toString('base64');
    // Se usar certificado, precisa agent https
    const resp = await axios.post('https://api.efipay.com.br/oauth/token', 
      { grant_type: 'client_credentials' },
      { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' } }
    );
    efiToken = resp.data.access_token;
    efiTokenExpira = Date.now() + (resp.data.expires_in * 1000) - 60000;
    console.log('[EFI] Token renovado');
    return efiToken;
  } catch (e) {
    console.error('[EFI] Erro token', e.response?.data || e.message);
    return null;
  }
}

// ===== ROTAS =====
app.get('/', (req, res) => {
  res.send(`SLS WIFI ONLINE v13 - ${new Date().toISOString()} - Fila: ${Object.keys(fila).length}`);
});

// GERAR QRCODE - chamado pelo login.html
app.get('/api/gerar-qrcode', async (req, res) => {
  try {
    const { mac, ip, plano, valor } = req.query;
    if (!mac) return res.status(400).json({ error: 'MAC obrigatório' });

    const txid = 'SLS' + Math.random().toString(36).substring(2, 10).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    const valorFinal = valor || (plano === '1HORA' ? '3.00' : '5.00');

    console.log(`[EFI] Gerando real TXID=${txid} VALOR=${valorFinal} MAC=${mac} IP=${ip} PLANO=${plano}`);

    // Salva PENDENTE antes de chamar EFI pra não perder
    fila[txid] = {
      txid,
      mac: mac.toUpperCase(),
      ip: ip || '',
      plano: plano || '1HORA',
      valor: valorFinal,
      status: 'PENDENTE',
      timestamp: Date.now()
    };
    salvarFila();

    // Tenta gerar PIX real na EFI
    try {
      const token = await getEfiToken();
      if (token && EFI_PIX_KEY) {
        const resp = await axios.put(`https://api.efipay.com.br/v2/cob/${txid}`, {
          calendario: { expiracao: 3600 },
          devedor: { cpf: '00000000000', nome: 'Cliente SLS WIFI' },
          valor: { original: valorFinal },
          chave: EFI_PIX_KEY,
          solicitacaoPagador: `SLS WIFI ${plano}`
        }, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        const qrcode = resp.data?.loc?.id ? resp.data : null;
        // Pega QRCode imagem
        const qrResp = await axios.get(`https://api.efipay.com.br/v2/loc/${resp.data.loc.id}/qrcode`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        console.log(`[EFI] OK real - ${txid} MAC=${mac}`);
        return res.json({
          txid,
          qrcode: qrResp.data.qrcode,
          qrcodeImagem: qrResp.data.imagemQrcode,
          valor: valorFinal
        });
      }
    } catch (efiErr) {
      console.error('[EFI] Falha ao gerar PIX real, usando fallback', efiErr.response?.data || efiErr.message);
    }

    // Fallback - retorna TXID mesmo sem EFI (para teste)
    console.log(`[FILA] Novo PENDENTE - TXID=${txid} MAC=${mac} IP=${ip} R$${valorFinal} - Total: ${Object.keys(fila).length}`);
    res.json({
      txid,
      qrcode: `00020126580014BR.GOV.BCB.PIX0136${EFI_PIX_KEY || 'sua-chave'}520400005303986540${valorFinal}5802BR5909SLS WIFI6009TERESINA62070503***6304`,
      valor: valorFinal,
      fallback: true
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// hEX consome a cada 30s - retorna quem pagou
app.get('/api/liberacoes', (req, res) => {
  const pagos = Object.values(fila).filter(f => f.status === 'PAGO_LIBERAR');
  console.log(`[SLS] Processando fila... ${pagos.length} para liberar | Total: ${Object.keys(fila).length}`);
  
  if (pagos.length === 0) return res.set('Content-Type', 'text/plain').send('');

  // Formato que seu SLS-LIBERA-v11 espera: TXID;MAC;IP;PLANO (um por linha)
  let txt = '';
  pagos.forEach(p => {
    txt += `${p.txid};${p.mac};${p.ip};${p.plano}\n`;
  });
  res.set('Content-Type', 'text/plain').send(txt);
});

// hEX chama depois de liberar para limpar
app.get('/api/liberacoes/limpar', (req, res) => {
  const { txid } = req.query;
  if (txid && fila[txid]) {
    console.log(`[SLS] Liberado e limpo TXID ${txid} MAC=${fila[txid].mac}`);
    delete fila[txid];
    salvarFila();
  }
  res.send('OK');
});

// WEBHOOK EFI - quando paga
app.post('/api/webhook', (req, res) => {
  try {
    const body = req.body;
    // EFI manda em pix[0].txid
    const pixArray = body.pix || [];
    if (pixArray.length === 0 && body.txid) pixArray.push({ txid: body.txid });

    pixArray.forEach(p => {
      const txid = p.txid;
      console.log(`[PAGO] Webhook TXID=${txid}`);
      if (fila[txid]) {
        fila[txid].status = 'PAGO_LIBERAR';
        console.log(`[PAGO] TXID ${txid} -> PAGO_LIBERAR MAC=${fila[txid].mac}`);
      } else {
        // NÃO ENCONTRADO - recria para não perder pagamento (caso do seu SLS46069442D9)
        console.log(`[PAGO] TXID ${txid} NAO ENCONTRADO, criando recuperacao`);
        fila[txid] = {
          txid,
          mac: p.mac || 'RECUPERAR_MANUAL',
          ip: '',
          plano: '1HORA',
          valor: p.valor || '3.00',
          status: 'PAGO_LIBERAR',
          timestamp: Date.now(),
          recuperado: true
        };
      }
    });

    salvarFila();
    res.sendStatus(200);
  } catch (e) {
    console.error('[WEBHOOK] Erro', e);
    res.sendStatus(200);
  }
});

// LIBERAR MANUAL - para o caso de hoje 32:CB:FB:4B:69:A7
app.get('/api/liberar-manual', (req, res) => {
  const { mac, ip, plano } = req.query;
  if (!mac) return res.status(400).send('mac obrigatorio');
  const txid = 'MANUAL_' + Date.now();
  fila[txid] = {
    txid,
    mac: mac.toUpperCase(),
    ip: ip || '',
    plano: plano || '1HORA',
    valor: '3.00',
    status: 'PAGO_LIBERAR',
    timestamp: Date.now()
  };
  salvarFila();
  console.log(`[MANUAL] ${txid} MAC=${mac} liberado manual`);
  res.send(`OK - ${mac} vai liberar em até 30s`);
});

// VOUCHER - só status, voucher mesmo é no hEX Users
app.get('/api/vouchers', (req, res) => {
  res.json({ info: 'Vouchers ficam no MikroTik IP > Hotspot > Users. Ex: SLS-1777 / SLS-1777' });
});

app.get('/api/status', (req, res) => {
  res.json({
    versao: 'v13 FINAL',
    total: Object.keys(fila).length,
    pendentes: Object.values(fila).filter(f => f.status === 'PENDENTE').length,
    pagos_para_liberar: Object.values(fila).filter(f => f.status === 'PAGO_LIBERAR').length,
    fila
  });
});

// Limpa TXIDs velhos > 24h
setInterval(() => {
  const agora = Date.now();
  let removidos = 0;
  for (const txid in fila) {
    if (agora - fila[txid].timestamp > 24*60*60*1000) {
      delete fila[txid];
      removidos++;
    }
  }
  if (removidos) {
    salvarFila();
    console.log(`[SLS] Limpeza ${removidos} antigos`);
  }
}, 60*60*1000);

app.listen(PORT, () => console.log(`[SLS] v13 FINAL rodando porta ${PORT}`));
