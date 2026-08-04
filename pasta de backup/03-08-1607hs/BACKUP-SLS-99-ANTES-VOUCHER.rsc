# 2026-08-03 16:05:50 by RouterOS 7.23.2
# software id = XKIG-Y0RP
#
# model = RB760iGS
# serial number = HJX0AX1ZZVK
/interface bridge
add name=bridge port-cost-mode=short
add name=bridge-hotsite port-cost-mode=short
/interface ethernet
set [ find default-name=ether5 ] poe-out=forced-on
set [ find default-name=sfp1 ] advertise="10M-baseT-half,10M-baseT-full,100M-b\
    aseT-half,100M-baseT-full,1G-baseT-half,1G-baseT-full"
/interface list
add name=WAN
add name=LAN
/interface lte apn
set [ find default=yes ] ip-type=ipv4 use-network-apn=no
/interface wireless security-profiles
set [ find default=yes ] supplicant-identity=MikroTik
/ip hotspot profile
add dns-name=sls.wifi hotspot-address=192.168.88.1 html-directory=\
    flash/hotspot login-by=http-chap name=hsprof1
add dns-name=sls.wifi hotspot-address=10.5.50.1 html-directory=flash/hotspot \
    login-by=http-chap name=pix-profile
add dns-name=sls.wifi hotspot-address=192.168.88.1 html-directory=\
    flash/hotspot login-by=http-chap,http-pap name=hs-pix
add dns-name=sls.wifi hotspot-address=10.5.50.1 html-directory=flash/hotspot \
    http-cookie-lifetime=1d login-by=cookie,http-chap,http-pap name=hsprof2
/ip hotspot user profile
add idle-timeout=5m keepalive-timeout=3h name=3horas session-timeout=3h
add idle-timeout=5m name=1HORA session-timeout=1h
add idle-timeout=5m name=2HORAS session-timeout=2h
add idle-timeout=10m name=EVENTO session-timeout=8h
/ip pool
add name=dhcp ranges=192.168.88.10-192.168.88.250
add name=pix-pool ranges=10.5.50.2-10.5.50.200
add name=hotspot-pool ranges=192.168.88.10-192.168.88.250
/ip dhcp-server
add address-pool=dhcp interface=bridge lease-time=10m name=dhcp1
add address-pool=pix-pool interface=bridge-hotsite lease-time=1h name=dhcp2
/ip smb users
set [ find default=yes ] disabled=yes
/queue simple
add max-limit=10M/10M name=TESTE-3MIN-10.5.50.186 target=10.5.50.186/32
/routing bgp template
set default disabled=no output.network=bgp-networks
/routing ospf instance
add disabled=no name=default-v2
/routing ospf area
add disabled=yes instance=default-v2 name=backbone-v2
/system script
add dont-require-permissions=no name=ATUALIZA-BANCOS owner=admin policy=\
    read,write,test source="\
    \n    :local dominios {\"api.nubank.com.br\"; \"www.caixa.gov.br\"; \"banc\
    o.bradesco.com.br\"; \"static.bradesco.com.br\"; \"static.bradesco.com.br.\
    edgekey.net\"; \"api.infinitepay.io\"; \"hotsport-pix-2.onrender.com\"}\
    \n    :foreach dominio in=\$dominios do={\
    \n        :do {\
    \n            :local ip [:resolve \$dominio]\
    \n            :if (\$ip!= \"\") do={ /ip firewall address-list add list=BA\
    NCOS-LIBERADOS address=\$ip timeout=1h comment=\$dominio }\
    \n        } on-error={}\
    \n    }\
    \n"
add dont-require-permissions=no name=limpa-expirados owner=admin policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source="/\
    ip hotspot ip-binding remove [find where comment~\"SLS-1h\" and creation-t\
    ime < ([/system clock get time] - 1h)]\
    \n/ip hotspot ip-binding remove [find where comment~\"SLS-2h\" and creatio\
    n-time < ([/system clock get time] - 2h)]\
    \n/ip hotspot ip-binding remove [find where comment~\"SLS-8h\" and creatio\
    n-time < ([/system clock get time] - 8h)]\
    \n:log warning \"SLS LIMPEZA FEITA\""
add dont-require-permissions=no name=SLS-LIBERA owner=admin policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source="/\
    / SLS-LIBERA V13.1 - CORRE\C3\87\C3\83O COOKIE\
    \nconst tempoMapa = {\
    \n  \"3\": { tempo: \"1h\", seg: 3600 },\
    \n  \"5\": { tempo: \"2h\", seg: 7200 },\
    \n  \"12\": { tempo: \"24h\", seg: 86400 }\
    \n}[valor] || { tempo: \"1h\", seg: 3600 };\
    \n\
    \nconst schedulerScript = `\
    \n:local ip \"\${ip}\"\
    \n:local mac \"\${mac}\"\
    \n/ip hotspot ip-binding remove [find where address=\\\$ip]\
    \n/queue simple remove [find where target~\\\$ip]\
    \n/ip hotspot host remove [find where address=\\\$ip]\
    \n/ip hotspot active remove [find where address=\\\$ip]\
    \n/ip hotspot cookie remove [find where address=\\\$ip]\
    \n/ip hotspot cookie remove [find where mac-address=\\\$mac]\
    \n/system scheduler remove [find where name=\"EXP-\\\$ip\"]\
    \n:log warning \"SLS V13.1: EXPIRADO \\\$ip \\\$mac\"\
    \n`;\
    \n\
    \n// CRIA O SCHEDULER - AGORA COM INTERVAL CERTO\
    \nawait mikrotik.post('/system/scheduler/add', {\
    \n  \"name\": `EXP-\${ip}`,\
    \n  \"interval\": tempoMapa.tempo,\
    \n  \"start-time\": \"startup\",\
    \n  \"on-event\": schedulerScript\
    \n});"
/interface bridge filter
add action=drop chain=forward comment=MATA-IPV6 mac-protocol=ipv6
add action=drop chain=input comment=MATA-IPV6-IN mac-protocol=ipv6
/interface bridge port
add bridge=bridge ingress-filtering=no interface=ether2 internal-path-cost=10 \
    path-cost=10
add bridge=bridge ingress-filtering=no interface=ether3 internal-path-cost=10 \
    path-cost=10
add bridge=bridge ingress-filtering=no interface=ether4 internal-path-cost=10 \
    path-cost=10
add bridge=bridge-hotsite ingress-filtering=no interface=ether5 \
    internal-path-cost=10 path-cost=10
add bridge=bridge ingress-filtering=no interface=sfp1 internal-path-cost=10 \
    path-cost=10
/ip firewall connection tracking
set udp-timeout=10s
/ipv6 settings
set disable-ipv6=yes max-neighbor-entries=8192
/interface list member
add interface=ether1 list=WAN
add interface=bridge list=LAN
/interface ovpn-server server
add auth=sha1,md5 mac-address=FE:09:D0:62:10:33 name=ovpn-server1
/ip address
add address=192.168.88.1/24 interface=bridge network=192.168.88.0
add address=10.5.50.1/24 interface=bridge-hotsite network=10.5.50.0
/ip cloud
set ddns-enabled=yes
/ip dhcp-client
add interface=ether1 name=ether1
/ip dhcp-server lease
add address=10.5.50.193 client-id=1:d6:37:b0:73:b0:81 mac-address=\
    D6:37:B0:73:B0:81 server=dhcp2
/ip dhcp-server network
add address=10.5.50.0/24 comment="hotspot network" gateway=10.5.50.1
add address=192.168.88.0/24 dns-server=8.8.8.8,1.1.1.1 gateway=192.168.88.1
/ip dns
set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
/ip dns static
add address=216.24.57.1 name=hotsport-pix-2.onrender.com type=A
/ip firewall address-list
add address=216.24.57.0/24 comment=RENDER list=PIX-LIBERADO
/ip firewall filter
add action=accept chain=input comment=API-RENDER dst-port=8728 protocol=tcp
add action=return chain=hs-unauth dst-address=200.155.84.0/24
add action=return chain=hs-unauth dst-address=200.155.82.0/24
add action=return chain=hs-unauth dst-port=9443 protocol=tcp
add action=return chain=hs-unauth dst-port=9443 protocol=udp
add action=return chain=hs-unauth dst-address=200.155.80.0/21
add action=log chain=hs-unauth log-prefix=CAIXA-EFI
add action=return chain=hs-unauth dst-address=200.155.84.0/24
add action=return chain=hs-unauth dst-address=200.155.82.0/24
add action=return chain=hs-unauth comment=LIBERA-RENDER-HOTS disabled=yes \
    dst-address-list=PIX-LIBERADO
add action=return chain=hs-unauth comment=LIBERA-BANCOS-HOTS disabled=yes \
    dst-address-list=BANCOS-LIBERADOS
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=accept chain=input comment=API-RENDER-LIBERA dst-port=8728 \
    protocol=tcp
add action=accept chain=input comment=API-WEB-LIBERA dst-port=80 protocol=tcp
add action=accept chain=input comment=WINBOX-LIBERA dst-port=8291 protocol=\
    tcp
add action=return chain=hs-unauth comment=LIBERA-ROXA-PIX dst-address-list=\
    PIX-LIBERADO
/ip firewall nat
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=masquerade chain=srcnat out-interface=ether1 out-interface-list=\
    WAN
add action=masquerade chain=srcnat out-interface=ether1
add action=masquerade chain=srcnat comment="masquerade hotspot network" \
    src-address=10.5.50.0/24
add action=accept chain=pre-hotspot comment="LIBERA-BANCOS PRE-PIX" disabled=\
    yes dst-address-list=PIX-LIBERADO
add action=accept chain=pre-hotspot comment="LIBERA-BANCOS PRE" disabled=yes \
    dst-address-list=BANCOS-LIBERADOS
add action=redirect chain=pre-hotspot comment="Forca DNS Hotspot UDP" \
    dst-address-type=!local dst-port=53 protocol=udp to-ports=53
add action=redirect chain=pre-hotspot comment="Forca DNS Hotspot TCP" \
    dst-address-type=!local dst-port=53 protocol=tcp to-ports=53
/ip hotspot
add address-pool=pix-pool addresses-per-mac=20 disabled=no idle-timeout=1h \
    interface=bridge-hotsite name=hotspot1 profile=hsprof2
/ip hotspot ip-binding
add address=10.5.50.186 comment="TESTE 3MIN" server=hotspot1 type=bypassed
/ip hotspot user
add name=admin
add name=sls-liberado profile=3horas
add name=sls-wifi-cliente
add name=TESTE10 profile=3horas
add name=SLS-B6J4 profile=3horas
add name=SLS-9Q1F profile=3horas
add name=SLS-FOJO profile=3horas
add name=SLS-6NWM profile=3horas
add name=SLS-4JRK profile=3horas
add name=SLS-X9P5 profile=3horas
add name=SLS-CQ88 profile=3horas
add name=SLS-FL08 profile=3horas
add name=SLS-KDTD profile=3horas
add name=SLS-K4ND profile=3horas
add comment="TESTE MANUAL" name=0C:CC:47:E5:32:DB profile=3horas
add limit-uptime=2h name=58:04:4F:E81116
add limit-uptime=2h name=32:CB:FB:4B:69:A7
add limit-uptime=2h name=58:04:4F:102670
add limit-uptime=2h name=58:04:4F:6AA3C4
add limit-uptime=2h name=58:04:4F:54:64:7C
add limit-uptime=1h name=PIX-114817
/ip hotspot walled-garden
add dst-host=onrender.com
add comment="SLS PIX2" dst-host=*.onrender.com
add dst-host=cdn.jsdelivr.net
add dst-host=cdnjs.cloudflare.com
add comment="place hotspot rules here" disabled=yes
add dst-host=*onrender.com*
add dst-host=*efi.com.br*
add dst-host=*onrender.com*
add dst-host=*efi.com.br*
add comment="SLS PIX" dst-host=*onrender.com*
add comment="EFI PIX" dst-host=*efi.com.br*
add comment="libera API" dst-host=10.5.50.1
add comment=BB dst-host=bb.com.br
add comment=BB dst-host=*.bb.com.br
add comment=BB dst-host=ourocard.com.br
add comment=BB dst-host=*.ourocard.com.br
add comment=BB dst-host=bb.com.br:443
add comment=BB dst-host=*.bb.com.br:443
add comment=BB dst-host=aapbb.com.br
add comment=BB dst-host=*.aapbb.com.br
add comment=BB dst-host=security.bb.com.br
add comment=BB dst-host=*.security.bb.com.br
add comment=CAIXA dst-host=caixa.gov.br
add comment=CAIXA dst-host=*.caixa.gov.br
add comment="CAIXA TEM" dst-host=caixatem.com.br
add comment="CAIXA TEM" dst-host=*.caixatem.com.br
add comment="CAIXA TEM" dst-host=*.caixatem.io
add comment=BRADESCO dst-host=bradesco.com.br
add comment=BRADESCO dst-host=*.bradesco.com.br
add comment=BRADESCO dst-host=banco.bradesco
add comment=BRADESCO dst-host=*.banco.bradesco
add comment=BRADESCO dst-host=*.akadns.net
add comment=BRADESCO dst-host=*.akamai.net
add comment=BRADESCO dst-host=*.akamaiedge.net
add comment=BRADESCO dst-host=*.cloudfront.net
add comment=BRADESCO dst-host=*.digicert.com
add comment=BRADESCO dst-host=*.entrust.net
add comment=NUBANK dst-host=nubank.com.br
add comment=NUBANK dst-host=*.nubank.com.br
add comment=NUBANK dst-host=nu.com.br
add comment=NUBANK dst-host=*.nu.com.br
add comment=NUBANK dst-host=nubank.com.br:443
add comment=NUBANK dst-host=*.nubank.com.br:443
add comment=EFI dst-host=efi.com.br
add comment=EFI dst-host=*.efi.com.br
add comment=EFI dst-host=gerencianet.com.br
add comment=EFI dst-host=*.gerencianet.com.br
add comment=EFI dst-host=sejaefi.com.br
add comment=EFI dst-host=*.sejaefi.com.br
add comment=EFI dst-host=efipay.com.br
add comment=EFI dst-host=*.efipay.com.br
add comment=EFI dst-host=gerencianet.com.br:443
add comment=EFI dst-host=*.gerencianet.com.br:443
add comment=EFI dst-host=*.amazonaws.com
add comment=EFI dst-host=*.cloudfront.net
add comment=EFI dst-host=*.googleapis.com
add comment=EFI dst-host=*.firebaseio.com
add comment=EFI dst-host=api.gerencianet.com.br
add comment=EFI dst-host=pix.gerencianet.com.br
add comment=EFI dst-host=*.pix.gerencianet.com.br
add comment=BNB dst-host=bnb.gov.br
add comment=BNB dst-host=*.bnb.gov.br
add comment=BNB dst-host=bnb.com.br
add comment=BNB dst-host=*.bnb.com.br
add comment=BNB dst-host=bancodonordeste.com.br
add comment=BNB dst-host=*.bancodonordeste.com.br
add comment=ITAU dst-host=itau.com.br
add comment=ITAU dst-host=*.itau.com.br
add comment=ITAU dst-host=itau.com
add comment=ITAU dst-host=*.itau.com
add comment=ITAU dst-host=banco.itau
add comment=ITAU dst-host=*.banco.itau
add comment=ITAU dst-host=itaucard.com.br
add comment=ITAU dst-host=*.itaucard.com.br
add comment=SICREDI dst-host=sicredi.com.br
add comment=SICREDI dst-host=*.sicredi.com.br
add comment=SICREDI dst-host=sicredi.com
add comment=SICREDI dst-host=*.sicredi.com
add comment=SANTANDER dst-host=santander.com.br
add comment=SANTANDER dst-host=*.santander.com.br
add comment=SANTANDER dst-host=santander.com
add comment=SANTANDER dst-host=*.santander.com
add comment=SANTANDER dst-host=banco.santander
add comment=SANTANDER dst-host=*.banco.santander
add comment=SANTANDER dst-host=santander.com.br:443
add comment=SICOOB dst-host=*sicoob*
add comment=SICOOB dst-host=*bancoob*
add comment=SICOOB dst-host=sicoob.com.br
add comment=SICOOB dst-host=*.sicoob.com.br
add comment=SICOOB dst-host=sicoobnet.com.br
add comment=SICOOB dst-host=*.sicoobnet.com.br
add comment=SICOOB dst-host=bancoob.com.br
add comment=SICOOB dst-host=*.bancoob.com.br
add comment=SICOOB dst-host=*.cloudfront.net
add comment=SICOOB dst-host=*.amazonaws.com
add comment=SICOOB dst-host=*.akamai.net
add comment=SICOOB dst-host=*.akamaiedge.net
add comment=INTER dst-host=inter.co
add comment=INTER dst-host=*.inter.co
add comment=INTER dst-host=bancointer.com.br
add comment=INTER dst-host=*.bancointer.com.br
add comment=INTER dst-host=inter.com.br
add comment=INTER dst-host=*.inter.com.br
add comment=C6 dst-host=c6bank.com
add comment=C6 dst-host=*.c6bank.com
add comment=C6 dst-host=c6bank.com.br
add comment=C6 dst-host=*.c6bank.com.br
add comment=C6 dst-host=c6.com.br
add comment=C6 dst-host=*.c6.com.br
add comment=PICPAY dst-host=picpay.com
add comment=PICPAY dst-host=*.picpay.com
add comment=PICPAY dst-host=picpay.com.br
add comment=PICPAY dst-host=*.picpay.com.br
add comment=MERCADOPAGO dst-host=mercadopago.com.br
add comment=MERCADOPAGO dst-host=*.mercadopago.com.br
add comment=MERCADOPAGO dst-host=mercadopago.com
add comment=MERCADOPAGO dst-host=*.mercadopago.com
add comment=MERCADOPAGO dst-host=mercadolivre.com.br
add comment=MERCADOPAGO dst-host=*.mercadolivre.com.br
add dst-host=hotsport-pix-2.onrender.com dst-port=443
add comment="Libera PIX SLS" dst-host=hotsport-pix-2.onrender.com
add dst-host=*.onrender.com
add dst-host=hotsport-pix-2.onrender.com
add dst-host=login.slswifi.com
add dst-host=api.qrserver.com
add comment="SLS PIX" dst-host=hotsport-pix-2.onrender.com
add comment="SLS PIX" dst-host=hotsport-pix-2.onrender.com
add comment="SLS ONRENDER" dst-host=*.onrender.com
add comment="SLS PIX" dst-host=hotsport-pix-2.onrender.com
add comment="libera pix" dst-host=hotsport-pix-2.onrender.com server=hotspot1
/ip hotspot walled-garden ip
add action=accept comment="SLS PIX IP" disabled=no dst-host=\
    hotsport-pix-2.onrender.com
add action=accept disabled=no dst-address=10.5.50.1 dst-port=8080 protocol=\
    tcp server=hotspot1
add action=accept comment="libera API" disabled=no dst-address=10.5.50.1
add action=accept comment="CAIXA IP" disabled=no dst-host=caixa.gov.br
add action=accept comment="CAIXA TEM IP" disabled=no dst-host=caixatem.com.br
add action=accept comment="CAIXA IP" disabled=no dst-host=\
    internetbanking.caixa.gov.br
add action=accept comment="BRADESCO IP" disabled=no dst-host=banco.bradesco
add action=accept comment="BRADESCO IP" disabled=no dst-host=bradesco.com.br
add action=accept comment="BRADESCO IP" disabled=no dst-host=\
    bradescocelular.com.br
add action=accept comment="BRADESCO IP" disabled=no dst-host=bra.bradesco
add action=accept comment="NUBANK IP" disabled=no dst-host=nubank.com.br
add action=accept comment="NUBANK IP" disabled=no dst-host=nu.com.br
add action=accept comment="EFI IP" disabled=no dst-host=efi.com.br
add action=accept comment="EFI IP" disabled=no dst-host=gerencianet.com.br
add action=accept comment="EFI IP" disabled=no dst-host=sejaefi.com.br
add action=accept comment="EFI IP" disabled=no dst-host=\
    api.gerencianet.com.br
add action=accept comment="EFI IP" disabled=no dst-host=\
    pix.gerencianet.com.br
add action=accept comment="EFI IP" disabled=no dst-host=*.amazonaws.com
add action=accept comment="BNB IP" disabled=no dst-host=bnb.gov.br
add action=accept comment="BNB IP" disabled=no dst-host=\
    bancodonordeste.com.br
add action=accept comment="ITAU IP" disabled=no dst-host=itau.com.br
add action=accept comment="ITAU IP" disabled=no dst-host=banco.itau
add action=accept comment="SICREDI IP" disabled=no dst-host=sicredi.com.br
add action=accept comment="SANTANDER IP" disabled=no dst-host=\
    santander.com.br
add action=accept comment="SICOOB IP" disabled=no dst-host=*sicoob*
add action=accept comment="SICOOB IP" disabled=no dst-host=*bancoob*
add action=accept comment="INTER IP" disabled=no dst-host=inter.co
add action=accept comment="INTER IP" disabled=no dst-host=bancointer.com.br
add action=accept comment="C6 IP" disabled=no dst-host=c6bank.com
add action=accept comment="PICPAY IP" disabled=no dst-host=picpay.com
add action=accept comment="MERCADOPAGO IP" disabled=no dst-host=\
    mercadopago.com.br
add action=accept comment="MERCADOPAGO IP" disabled=no dst-host=\
    mercadolivre.com.br
add action=accept comment=Render disabled=no dst-address=34.120.0.0/16
add action=accept comment="SLS PIX IP" disabled=no dst-host=\
    hotsport-pix-2.onrender.com
add action=accept comment="SLS PIX" disabled=no dst-host=\
    hotsport-pix-2.onrender.com
/ip ipsec profile
set [ find default=yes ] dpd-interval=2m dpd-maximum-failures=5
/ip service
set www address=0.0.0.0/0 port=8080
set api address=0.0.0.0/0
/routing bfd configuration
add disabled=no interfaces=all min-rx=200ms min-tx=200ms multiplier=5
/system clock
set time-zone-name=America/Fortaleza
/system scheduler
add disabled=yes interval=2m name=ATUALIZA-BANCOS-SCHED on-event=\
    "/system script run ATUALIZA-BANCOS" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add disabled=yes interval=30s name=RODA-LIBERA on-event=\
    "/system script run libera-pix" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add disabled=yes interval=5m name=RODA-LIMPEZA on-event=limpa-expirados \
    policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add disabled=yes interval=1m name=SLS-Libera-WIFI on-event=":log info \"SLS: B\
    uscando...\"\
    \n:local url \"https://hotsport-pix-2.onrender.com/fila\"\
    \n:local data ([/tool fetch url=\$url mode=https as-value output=user]->\"\
    data\")\
    \n:if ([:find \$data \"PAGO_LIBERAR\"] <0) do={:log info \"SLS: aguardando\
    \"} else={\
    \n :local tempo 60; :local vel \"5M/5M\"\
    \n :if ([:find \$data \"1440\"] >=0) do={:set tempo 1440; :set vel \"15M/1\
    5M\"} else={:if ([:find \$data \"120\"] >=0) do={:set tempo 120; :set vel \
    \"10M/10M\"}}\
    \n /ip hotspot host {\
    \n  :foreach h in=[find where authorized=no] do={\
    \n   :local m [get \$h mac-address]; :local ip [get \$h address]\
    \n   :if ([/ip hotspot ip-binding find where mac-address=\$m] = \"\") do={\
    \n    /ip hotspot ip-binding add mac-address=\$m address=\$ip type=bypasse\
    d server=all comment=(\"PIX\".\$tempo.\"m\")\
    \n    /queue simple add name=(\"PIX-\".\$m) target=\$ip max-limit=\$vel co\
    mment=(\"PIX\".\$tempo.\"m\") place-before=0\
    \n    :local expTime ([/system clock get time] + (\$tempo * 60))\
    \n    /system scheduler add name=(\"EXP-\".\$m) start-time=\$expTime inter\
    val=00:00:00 on-event=\"/ip hotspot ip-binding remove [find where mac-addr\
    ess=\$m]; /queue simple remove [find where name=\\\"PIX-\$m\\\"]; /system \
    scheduler remove [find where name=\\\"EXP-\$m\\\"]; :log info (\\\"SLS: Ex\
    pirou \$m\\\");\"\
    \n    :log info (\"SLS: Liberado \".\$m.\" \".\$vel.\" por \".\$tempo.\"m\
    \")\
    \n   }\
    \n  }\
    \n }\
    \n :local ini [:find \$data \"\\\"txid\\\":\\\"\"]\
    \n :if (\$ini >=0) do={:local txid [:pick \$data (\$ini+8) (\$ini+40)]; /t\
    ool fetch url=(\"https://hotsport-pix-2.onrender.com/liberado/\".\$txid) m\
    ode=https}\
    \n}" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add disabled=yes interval=1m name=sls-auto on-event=\
    "/system script run libera-pix" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add disabled=yes interval=15s name=SLS-20s on-event=\
    "/system script run SLS-LIBERA" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add interval=3m name=EXP--TESTE on-event="/ip hotspot ip-binding remove [find \
    where address=]; /queue simple remove [find where target~\"\"]; /ip hotspo\
    t host remove [find where address=]; /ip hotspot active remove [find where\
    \_address=]; /ip firewall connection remove [find where src-address~\"\"];\
    \_/system scheduler remove [find where name=(\"EXP-\" .  . \"-TESTE\")];" \
    policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add interval=3m name=EXP-10.5.50.186-TESTE on-event="/ip hotspot ip-binding re\
    move [find where address=10.5.50.196]; /queue simple remove [find where ta\
    rget~\"10.5.50.196\"]; /ip hotspot host remove [find where address=10.5.50\
    .196]; /ip hotspot active remove [find where address=10.5.50.196]; /ip fir\
    ewall connection remove [find where src-address~\"10.5.50.196\"]; /system \
    scheduler remove [find where name=\"EXP-10.5.50.196-TESTE\"];" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
