const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(cors());
app.use(express.json());

// --- CERTIFICADO EFI ---
const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado() {
  try {
    const b64 = process.env.EFI_CERTIFICADO_BASE64;
    if (!b64) {
      console.log('[CERT] EFI_CERTIFICADO_BASE64 não encontrado');
      return;
    }
    const limpo = b64.replace(/\s/g, '');
    fs.writeFileSync(CERT_PATH, Buffer.from(limpo, 'base64'));
    console.log('[CERT] Certificado gravado OK em', CERT_PATH);
  } catch (e) {
    console.log('[CERT] ERRO ao gravar:', e.message);
  }
}
garanteCertificado();

const efiOptions = {
  sandbox: false,
  client_id: process.env.EFI_CLIENT_ID,
  client_secret: process.env.EFI_CLIENT_SECRET,
  certificate: CERT_PATH,
  certificado: CERT_PATH,
  pixCert: CERT_PATH
};

let fila = []; // {txid, tempo, valor, status}

// --- FRONTEND 100% IGUAL DA SUA FOTO ---
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>SLS WIFI EVENTOS</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}
body{background:#0f0f12;display:flex;justify-content:center;color:#fff;min-height:100vh}
.box{width:100%;max-width:400px;background:#16161a;min-height:100vh;padding:14px}
.top{display:flex;align-items:center;justify-content:center;gap:6px;color:#555;font-size:11px;letter-spacing:.5px;margin-top:8px}
.dot{width:8px;height:8px;background:#00e676;border-radius:50%;box-shadow:0 0 6px #00e676}
.logo{display:flex;align-items:center;gap:10px;justify-content:center;margin-top:10px}
.logo i{width:38px;height:38px;background:linear-gradient(135deg,#ff8a00,#ffb700);border-radius:10px;display:flex;align-items:center
