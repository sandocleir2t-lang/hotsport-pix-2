const express = require('express');
const cors = require('cors');
const fs = require('fs');
const EfiPay = require('sdk-node-apis-efi');
const app = express();
app.use(cors());
app.use(express.json());
const CERT_PATH = '/tmp/hotspot-producao.p12';
function garanteCertificado(){try{const b=process.env.EFI_CERTIFICADO_BASE64;if(!b)return;fs.writeFileSync(CERT_PATH,Buffer.from(b.replace(/\s/g,''),'base64'));console.log('CERT OK')}catch(e){console.log('ERRO CERT',e.message)}}
garanteCertificado();
const efiOptions={sandbox:false,client_id:process.env.EFI_CLIENT_ID,client_secret:process.env.EFI_CLIENT_SECRET,certificate:CERT_PATH,certificado:CERT_PATH,pixCert:CERT_PATH};
let fila=[];

app.get('/',(req,res)=>{
res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SLS WIFI</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap');*{font-family:'Inter',system-ui,sans-serif} .wifi-glow{animation:glowPulse 2.8s ease-in-out infinite}@keyframes glowPulse{0%,100%{filter:drop-shadow(0 0 10px rgba(168,85,247,.35))}50%{filter:drop-shadow(0 0 22px rgba(236,72,153,.55))}} ::-webkit-scrollbar{width:0;height:0}</style>
</head><body style="background:#080812;min-height:100vh;display:flex;justify-content:center">
<div id="root" style="width:100%;max-width:410px;padding:0 18px"></div>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
<script>
const e=React;const Sr=[{id:"1h",hours:"1 HORA",mega:"5 MEGA",price:3,tempo:60,desc:"Ideal uso rapido"},{id:"3h",hours:"3 HORAS",mega:"10 MEGA",price:5,tempo:180,desc:"Mais vendido - 10 Mega",badge:"MAIS VENDIDO"},{id:"24h",hours:"24 HORAS",mega:"15 MEGA",price:10,tempo:1440,desc:"Conexao o dia todo"}];
function App(){
const [plan,setPlan]=e.useState(1);const [showPix,setShowPix]=e.useState(false);const [copied,setCopied]=e.useState(false);const [txid,setTxid]=e.useState("SLS"+Math.random().toString(36).substring(2,8).toUpperCase());const [pixCode,setPixCode]=e.useState("");const [qrImg,setQrImg]=e.useState("");const [v1,setV1]=e.useState("");const [v2,setV2]=e.useState("");const [msg,setMsg]=e.useState("");const [loading,setLoading]=e.useState(false);
async function gerar(){
 setLoading(true);setMsg("Gerando PIX R$ "+Sr[plan].price+"...");
 try{
  const r=await fetch('/criar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:Sr[plan].price.toString(),tempo:Sr[plan].tempo})});
  const j=await r.json();if(j.erro) throw new Error(j.erro);
  setPixCode(j.copia_e_cola);setQrImg(j.imagemQrcode);setTxid(j.txid);setShowPix(true);setMsg("");setTimeout(()=>{document.getElementById("pixArea")?.scrollIntoView({behavior:"smooth"})},200);
  let iv=setInterval(async()=>{
   try{let s=await fetch('/status/'+j.txid);let js=await s.json();if(js.status==='CONCLUIDA'){setMsg("✅ PAGO! LIBERADO EM 15s!");clearInterval(iv);}}catch(e){}
  },4000);
 }catch(err){setMsg("ERRO: "+err.message);}finally{setLoading(false);}
}
async function copiar(){
 try{await navigator.clipboard.writeText(pixCode);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{let m=document.createElement("textarea");m.value=pixCode;document.body.appendChild(m);m.select();document.execCommand("copy");document.body.removeChild(m);setCopied(true);setTimeout(()=>setCopied(false),2500);}
}
function loginVoucher(){if(!v1||!v2){setMsg("Preencha codigo e senha");setTimeout(()=>setMsg(""),2000);return;}document.getElementById('vUser').value=v1;document.getElementById('vPassReal').value=v2;document.getElementById('mikrotikLogin').submit();}
return e.createElement("div",{className:"pb-10"},[
 e.createElement("div",{key:"on",className:"flex justify-center mt-6"},e.createElement("div",{className:"inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1"},[e.createElement("span",{key:"d",className:"w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,.8)]"}),e.createElement("span",{key:"t",className:"text-[10px] font-bold tracking-[0.12em] text-white/60"},"ONLINE • 247 CLIENTES CONECTADOS")])),
 e.createElement("div",{key:"logo",className:"mt-6 flex flex-col items-center"},[e.createElement("div",{key:"l1",className:"flex items-center gap-3"},[e.createElement("div",{key:"ic",className:"w-11 h-11 rounded-[12px] bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center"},"📶"),e.createElement("div",{key:"tx",className:"text-[30px] font-black text-white"},"SLS ",e.createElement("span",{className:"bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent"},"WIFI"))]),e.createElement("p",{key:"sub",className:"mt-2 text-[13px] text-white/50"},"Internet rápida • Pagamento instantâneo via PIX")]),
 e.createElement("div",{key:"av",className:"mt-5 w-full rounded-[12px] bg-[#FFEB3B] py-3 text-center"},e.createElement("span",{className:"text-[11px] font-black text-black"},"⚠️ NAO FECHE ESTA TELA ATE PAGAR!")),
 e.createElement("div",{key:"head",className:"mt-6 flex justify-between items-center"},[e.createElement("b",{key:"h",className:"text-[12px] tracking-[0.12em] text-white"},"ESCOLHA SEU PLANO"),e.createElement("span",{key:"b",className:"text-[9px] bg-[#FFEB3B] text-black font-black px-2 py-1 rounded-full"},"⚡ Ativação imediata")]),
 e.createElement("div",{key:"cards",className:"mt-3 flex flex-col gap-3"},Sr.map((p,i)=>{
   const active=plan===i;
   return e.createElement("div",{key:p.id,onClick:()=>setPlan(i),className:"relative rounded-[16px] p-4 flex justify-between items-center cursor-pointer border "+(active?"border-fuchsia-400 bg-gradient-to-br from-violet-900/30 to-fuchsia-900/20 shadow-[0_0_20px_rgba(168,85,247,.3)]":"border-white/10 bg-[#12121F]")},[
     p.badge?e.createElement("div",{key:"badge",className:"absolute -top-2 right-3 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white text-[9px] font-black px-2 py-1 rounded-full"},p.badge):null,
     e.createElement("div",{key:"left"},[e.createElement("div",{key:"t",className:"text-[13px] font-black text-white"},p.hours+" • "+p.mega),e.createElement("div",{key:"d",className:"text-[11px] text-white/50"},p.desc)]),
     e.createElement("div",{key:"pr",className:"text-right"},[e.createElement("div",{key:"p",className:"text-[20px] font-black text-white"},"R$ "+p.price),e.createElement("div",{key:"h",className:"text-[10px] text-white/40"},p.tempo<120?p.tempo+"min":p.tempo/60+"h de acesso")]),
     e.createElement("div",{key:"dot",className:"w-5 h-5 rounded-full border-2 flex items-center justify-center "+(active?"border-fuchsia-400 bg-fuchsia-500/20":"border-white/20")},active?e.createElement("div",{className:"w-2 h-2 bg-fuchsia-400 rounded-full"}):null)
   ])
 })),
 e.createElement("button",{key:"btn",onClick:gerar,disabled:loading,className:"mt-5 w-full rounded-[14px] bg-[#FFEB3B] py-4 text-black font-black text-[13px] tracking-wide"},loading?"GERANDO...":"GERAR PIX - PAGAR AGORA"),
 showPix?e.createElement("div",{key:"pix",id:"pixArea",className:"mt-4 rounded-[18px] border border-white/10 bg-[#10101C] p-4"},[
   e.createElement("div",{key:"h",className:"text-[11px] font-black text-white/70 mb-3"},"PAGUE COM PIX - TXID: "+txid),
   e.createElement("div",{key:"qr",className:"bg-white rounded-[12px] p-3 flex justify-center"},qrImg?e.createElement("img",{src:qrImg,style:{width:"220px"}}):e.createElement("div",{},"QR CODE...")),
   e.createElement("div",{key:"code",className:"mt-3 bg-black/50 border border-white/10 rounded-[10px] p-2 text-[11px] text-white/60 break-all font-mono"},pixCode),
   e.createElement("button",{key:"cp",onClick:copiar,className:"mt-3 w-full rounded-[10px] bg-white/10 py-2 text-white text-[12px] font-bold"},copied?"✅ COPIADO!":"📋 COPIAR CODIGO PIX"),
   msg?e.createElement("div",{key:"msg",className:"mt-3 text-center text-[12px] font-bold text-emerald-300 bg-emerald-500/15 rounded-full py-2"},msg):null
 ]):null,
 e.createElement("div",{key:"vbox",className:"mt-6 rounded-[16px] bg-white/5 border border-white/10 p-4"},[
   e.createElement("div",{key:"t",className:"text-[11px] font-black text-white/60 mb-3"},"TEM VOUCHER?"),
   e.createElement("input",{key:"i1",value:v1,onChange:ev=>setV1(ev.target.value),placeholder:"CODIGO VOUCHER",className:"w-full rounded-[10px] bg-[#0e0e1a] border border-white/10 px-3 py-3 text-[11px] text-white mb-2"}),
   e.createElement("input",{key:"i2",type:"password",value:v2,onChange:ev=>setV2(ev.target.value),placeholder:"SENHA",className:"w-full rounded-[10px] bg-[#0e0e1a] border border-white/10 px-3 py-3 text-[11px] text-white"}),
   e.createElement("button",{key:"vb",onClick:loginVoucher,className:"mt-3 w-full rounded-[12px] bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-white font-black text-[11px]"},"ENTRAR COM VOUCHER")
 ]),
 e.createElement("form",{key:"form",id:"mikrotikLogin",action:"$(link-login-only)",method:"post",className:"hidden"},[
   e.createElement("input",{key:"u",id:"vUser",name:"username"}),
   e.createElement("input",{key:"p",id:"vPassReal",name:"password",type:"hidden"}),
   e.createElement("input",{key:"d",name:"dst",defaultValue:"$(link-orig)",type:"hidden"}),
   e.createElement("input",{key:"pp",name:"popup",defaultValue:"true",type:"hidden"})
 ])
])
}
ReactDOM.createRoot(document.getElementById("root")).render(e.createElement(App));
</script>
</body></html>
`);
});

app.post('/criar-pix',async(req,res)=>{try{if(!fs.existsSync(CERT_PATH))garanteCertificado();const efipay=new EfiPay(efiOptions);const body={calendario:{expiracao:3600},valor:{original:req.body.valor.toString()},chave:process.env.EFI_CHAVE_PIX};const cob=await efipay.pixCreateImmediateCharge([],body);const qrcode=await efipay.pixGenerateQRCode({id:cob.loc.id});fila.push({txid:cob.txid,tempo:req.body.tempo,valor:req.body.valor,status:'AGUARDANDO'});res.json({txid:cob.txid,imagemQrcode:qrcode.imagemQrcode,copia_e_cola:qrcode.qrcode});}catch(err){console.log('ERRO CRIAR',err);res.status(500).json({erro:err.message});}});
app.get('/status/:txid',async(req,res)=>{try{const efipay=new EfiPay(efiOptions);const c=await efipay.pixDetailCharge({txid:req.params.txid});if(c.status==='CONCLUIDA'){let i=fila.find(f=>f.txid===req.params.txid);if(i)i.status='PAGO_LIBERAR';}res.json(c);}catch(e){res.status(500).json({erro:e.message})}});
app.get('/fila',(req,res)=>{res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));});
app.get('/api/liberacoes',(req,res)=>{res.json(fila.filter(f=>f.status==='PAGO_LIBERAR'));});
app.get('/liberado/:txid',(req,res)=>{fila=fila.filter(f=>f.txid!==req.params.txid);res.json({ok:true});});
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('SLS WIFI TOP IGUAL FOTO - PORT',PORT));
