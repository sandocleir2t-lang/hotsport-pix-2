const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
let pagamentos = new Map();
let filaLiberar = [];
const ARQ_FILA='./fila.json'; const ARQ_PAG='./pagamentos.json';
function salvar(){ try{fs.writeFileSync(ARQ_FILA, JSON.stringify(filaLiberar)); fs.writeFileSync(ARQ_PAG, JSON.stringify(Array.from(pagamentos.entries())))}catch(e){} }
function carregar(){ try{ if(fs.existsSync(ARQ_FILA)) filaLiberar=JSON.parse(fs.readFileSync(ARQ_FILA)); if(fs.existsSync(ARQ_PAG)) pagamentos=new Map(JSON.parse(fs.readFileSync(ARQ_PAG))); }catch(e){} }
carregar();
let efipay=null;
try{
  const EfiPay=require('sdk-node-apis-efi');
  const p='/tmp/cert.p12'; fs.writeFileSync(p, Buffer.from(process.env.EFI_CERT_BASE64,'base64'));
  efipay=new EfiPay({sandbox:false, client_id:process.env.EFI_CLIENT_ID, client_secret:process.env.EFI_CLIENT_SECRET, certificate:p});
  console.log('[EFI] Cliente EFI REAL configurado');
}catch(e){ console.log('[EFI] MOCK', e.message); }
const VERSAO="v17 FIX LOOP DEFINITIVO";
async function criarCobrancaPix({mac,ip,plano,valor}){
  const txid='SLS'+Date.now()+Math.floor(Math.random()*1000);
  const info={txid,mac,ip,plano,valor:parseFloat(valor),status:'PENDENTE',criado:new Date().toISOString()};
  let qrcode='';
  try{
    const body={calendario:{expiracao:3600}, devedor:{cpf:"12345678909", nome:"Cliente SLS"}, valor:{original:valor.toFixed(2)}, chave:process.env.CHAVE_PIX, solicitacaoPagador:`SLS ${plano}`.slice(0,25)};
    const cob=await efipay.pixCreateImmediateCharge({txid:txid.slice(0,32)}, body);
    qrcode=cob.qrcode;
    console.log(`[EFI] PIX real OK ${txid}`);
  }catch(e){ console.error('[EFI ERRO]', e.message); qrcode=`ERRO_EFI_${e.message}`; }
  pagamentos.set(txid,info);
  console.log(`[FILA] Novo PENDENTE - TXID=${txid} MAC=${mac} Total=${pagamentos.size}`);
  salvar();
  return {txid,qrcode,pixCopiaCola:qrcode,...info};
}
app.post('/api/criar-pix',async(req,res)=>{ const r=await criarCobrancaPix(req.body); res.json(r); });
app.post('/api/gerar-qrcode',async(req,res)=>{ const r=await criarCobrancaPix(req.body); res.json(r); });
app.post('/api/webhook/pix',(req,res)=>{ try{ const lista=req.body.pix||[]; (Array.isArray(lista)?lista:[lista]).forEach(p=>{ const pag=pagamentos.get(p.txid); if(pag && pag.status!='CONCLUIDA'){ pag.status='CONCLUIDA'; pagamentos.set(p.txid,pag); filaLiberar.push(`${pag.txid};${pag.mac};${pag.ip};${pag.plano}`); salvar(); console.log(`[FILA] LIBERADO! TXID=${pag.txid}`);} }); }catch(e){} res.sendStatus(200); });
app.get('/api/liberacoes',(req,res)=>{ if(filaLiberar.length==0) return res.type('text/plain').send('VAZIO\n'); res.type('text/plain').send(filaLiberar[0]+'\n'); });
app.get('/api/liberacoes/limpar',(req,res)=>{ const {txid}=req.query; filaLiberar=filaLiberar.filter(l=>!l.startsWith(txid)); salvar(); res.send('OK'); });
app.get('/api/status',(req,res)=>{ res.json({versao:VERSAO, total:pagamentos.size, pendentes:Array.from(pagamentos.values()).filter(p=>p.status==='PENDENTE').length, pagos_para_liberar:filaLiberar.length, fila:filaLiberar, temEfi:!!process.env.EFI_CLIENT_ID, temChavePix:!!process.env.CHAVE_PIX}); });
app.get('/api/limpar-fila',(req,res)=>{ pagamentos.clear(); filaLiberar=[]; salvar(); res.send('ZERADO'); });
app.get('/api/teste',(req,res)=>{ const mac=req.query.mac||'AA:BB:CC:DD:EE:99'; const linha=`TESTE${Date.now()};${mac};10.5.50.200;${req.query.plano||'1HORA'}`; filaLiberar.push(linha); salvar(); res.send(linha); });
app.listen(process.env.PORT||10000,()=>console.log(`[SLS] ${VERSAO} rodando`));
setInterval(()=>console.log(`[SLS] Processando fila... ${filaLiberar.length} para liberar | Total: ${pagamentos.size}`),20000);
