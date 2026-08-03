const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');

const app = express();
app.use(cors());
app.use(express.json());

const CERT_PATH = '/tmp/hotspot-producao.p12';

function garanteCertificado() {
  try {
    const base64 = process.env.EFI_CERTIFICADO_BASE64;
    if (!base64) {
      console.log('❌ EFI_CERTIFICADO_BASE64 VAZIA!');
      return;
    }
    const limpo = base64.replace(/\s/g, '');
    const buf = Buffer.from(limpo, 'base64');
    fs.writeFileSync(CERT_PATH, buf);
    console.log('✅ CERTIFICADO SALVO:', CERT_PATH, 'Bytes:', buf.length, 'Existe?', fs.existsSync(CERT_PATH));
  } catch(e){
    console.log('❌ ERRO SALVAR CERT:', e.message);
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

let fila = [];

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SLS WIFI</title>
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Arial}body{background:#0b1c3d;display:flex;justify-content:center;min-height:100vh}.container{width:100%;max-width:380px;background:#0e224a;padding:20px 15px;text-align:center}.logo{color:#fff;font-weight:900;font-size:22px}.logo span{font-size:12px;display:block;font-weight:400;color:#a0b4d0;letter-spacing:2px}.aviso{background:#ffeb3b;color:#000;padding:10px;border-radius:12px;font-size:12px;font-weight:bold;margin:15px 0}.plano{background:#1a335f;border:2px solid #2a4a85;border-radius:12px;padding:12px 15px;margin:10px 0;display:flex;justify-content:space-between;color:#fff;cursor:pointer}.plano.ativo{background:#ffeb3b;color:#000;border-color:#ffeb3b;font-weight:bold}.btn-gerar{background:#ffeb3b;color:#000;border:0;width:100%;padding:15px;border-radius:12px;font-size:16px;font-weight:900;margin:20px 0 10px;cursor:pointer}#pixArea{display:none;background:#fff;color:#000;border-radius:15px;padding:20px;margin-top:20px}#pixArea img{width:100%;max-width:280px}.input{width:100%;padding:12px;border-radius:8px;border:1px solid #334a78;background:#0a1933;color:#fff;margin:6px 0}.btn-voucher{background:#1e3a6e;color:#fff;border:0;width:100%;padding:12px;border-radius:8px;font-weight:bold;margin-top:10px}.footer{color:#5a7198;font-size:10px;margin-top:20px}</style>
</head><body><div class="container">
<div class="logo">🚀 SLS WIFI<br><span>INTERNET RAPIDA AQUI</span></div>
<div class="aviso">NÃO FECHE ESTA TELA ATÉ PAGAR! Deixe aberta para liberar automático!</div>
<div class="plano ativo" onclick="sel(this,'2.00',60,'1 HORA')"><span>1 HORA</span><b>R$ 2,00</b></div>
<div class="plano" onclick="sel(this,'5.00',120,'2 HORAS')"><span>2 HORAS</span><b>R$ 5,00</b></div>
<div class="plano" onclick="sel(this,'12.00',1440,'EVENTO TODO')"><span>EVENTO TODO</span><b>R$ 12,00</b></div>
<button class="btn-gerar" onclick="gerar()">GERAR PIX - PAGAR AGORA</button>
<div id="pixArea"></div>
<span style="color:#fff;font-size:12px">TEM VOUCHER?</span>
<input class="input"
