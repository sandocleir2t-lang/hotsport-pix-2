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

// SEU LAYOUT MELHORADO - IGUAL DA FOTO
app.get('/',(req,res)=>{
res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SLS WIFI</title>
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial}body{background:#0d0d0d;display:flex;justify-content:center;min-height:100vh}.container{width:100%;max-width:380px;background:#111;padding:16px}.online{color:#00e676;font-size:10px;display:flex;align-items:center;gap:6px;margin-bottom:12px}.dot{width:8px;height:8px;background:#00e676;border-radius:50%}.logo{font-size:28px;font-weight:900;color:#fff}.logo b{color:#ffb300}.sub{color:#888;font-size:10px;letter-spacing:1px}.aviso{background:#ffeb3b;color:#000;text-align:center;padding:10px;border-radius:20px;font-weight:900;font-size:11px;margin:14px 0}.planos-title{color:#fff;font-size:12px;font-weight:800;display:flex;justify-content:space-between;margin:10px 0}.badge{background:#252560;color:#8a8aff;font-size:9px;padding:4px 8px;border-radius:10px}.plano{background:#1e1e1e;border:2px solid #2a2a2a;border-radius:16px;padding:14px;display:flex;justify-content:space-between;align-items:center;margin:8px 0;cursor:pointer;color:#fff}.plano.ativo{border-color:#ffeb3b;background:#252525}.left{display:flex;gap:10px;align-items:center}.radio{width:18px;height:18px;border:2px solid #555;border-radius:50%}.ativo .radio{background:#ffeb3b;border-color:#ffeb3b;box-shadow:inset 0 0 0 4px #252525}.plano small{color:#777;font-size:11px}.mais{position:absolute;top:-8px;right:12px;background:#ff2a5a;color:#fff;font-size:8px;padding:3px 8px;border-radius:8px;font-weight:900}.btn-gerar{background:#ffeb3b;color:#000;width:100%;padding:16px;border:0;border-radius:16px;font-weight:900;font-size:14px;margin:14px 0;cursor:pointer}#pixArea{display:none;background:#fff;border-radius:16px;padding:16px;text-align:center;color:#000;margin-top:10px}.voucher{margin-top:16px}.voucher input{width:100%;padding:14px;background:#1e1e1e;border:1px solid #333;border-radius:12px;color:#fff;margin:5px 0}.btn-v{width:100%;padding:14px;background:#2a2a6a;color:#fff;border:0;border-radius:12px;font-weight:800;margin-top:6px}</style></head><body><div class="container">
<div class="online"><div class="dot"></div>● ONLINE - 247 CLIENTES CONECTADOS</div>
<div class="logo">📶 SLS<span style="color:#ffeb3b">WIFI</span><div class="sub">Internet rápida • Pagamento instantâneo via PIX</div></div>
<div class="aviso">⚠️ NAO FECHE ESTA TELA ATE PAGAR!</div>
<div class="planos-title">ESCOLHA SEU PLANO <span class="badge">⚡ Ativação imediata</span></div>

<div class="plano ativo" id="p1" onclick="sel('p1','3.00',60)"><div class="left"><div class="radio"></div><div><div>1 HORA - 5 MEGA</div><small>Ideal para uso rápido</small></div></div><div style="text-align:right"><small>1h de acesso</small><br><b>R$ 3</b></div></div>

<div class="plano" id="p2" onclick="sel('p2','5.00',120)" style="position:relative"><div class="mais">MAIS VENDIDO</
