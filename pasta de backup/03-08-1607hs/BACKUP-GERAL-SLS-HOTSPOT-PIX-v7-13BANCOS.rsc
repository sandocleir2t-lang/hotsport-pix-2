# 2026-07-30 16:49:51 by RouterOS 7.23.2
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
add dns-name=wifi.sls.com.br hotspot-address=192.168.88.1 html-directory=\
    flash/hotspot login-by=http-chap name=hsprof1
add dns-name=login.slswifi.com hotspot-address=10.5.50.1 html-directory=\
    flash/hotspot login-by=http-chap name=pix-profile
add dns-name=login.slswifi.com hotspot-address=192.168.88.1 html-directory=\
    flash/hotspot login-by=http-chap,http-pap name=hs-pix
add dns-name=login.slswifi.com hotspot-address=10.5.50.1 html-directory=\
    flash/hotspot http-cookie-lifetime=1d login-by=cookie,http-chap,http-pap \
    name=hsprof2
/ip hotspot user profile
add idle-timeout=10m keepalive-timeout=3h name=3horas session-timeout=3h \
    shared-users=100
/ip pool
add name=dhcp ranges=192.168.88.10-192.168.88.250
add name=pix-pool ranges=10.5.50.2-10.5.50.200
add name=hotspot-pool ranges=192.168.88.10-192.168.88.250
/ip dhcp-server
add address-pool=dhcp interface=bridge lease-time=10m name=dhcp1
add address-pool=pix-pool interface=bridge-hotsite lease-time=1h name=dhcp2
/ip smb users
set [ find default=yes ] disabled=yes
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
add dont-require-permissions=no name=libera-pix owner=admin policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source=":\
    local api \"https://hotsport-pix-2.onrender.com/api/liberacoes\";\r\
    \n:local fileName \"liberacoes.txt\";\r\
    \n/tool fetch url=\$api dst-path=\$fileName check-certificate=no;\r\
    \n:delay 2s;\r\
    \n:local content [/file get [find name=\$fileName] contents];\r\
    \n:if ([:len \$content] > 10) do={\r\
    \n  :local pos 0;\r\
    \n  :while ([:find \$content \"\\\"ip\\\"\" \$pos] != nil) do={\r\
    \n    :local s ([:find \$content \"\\\"ip\\\":\\\"\" \$pos]+6);\r\
    \n    :local e [:find \$content \"\\\"\" \$s];\r\
    \n    :local ipAddr [:pick \$content \$s \$e];\r\
    \n    :if ([:len \$ipAddr] > 6) do={\r\
    \n      :do {\r\
    \n        /ip hotspot ip-binding add address=\$ipAddr type=bypassed commen\
    t=\"SLS PAGO\" disabled=no;\r\
    \n        /tool fetch url=(\"https://hotsport-pix-2.onrender.com/api/consu\
    mido\?ip=\". \$ipAddr) dst-path=\"tmp.txt\" check-certificate=no;\r\
    \n      } on-error={\r\
    \n        /tool fetch url=(\"https://hotsport-pix-2.onrender.com/api/consu\
    mido\?ip=\". \$ipAddr) dst-path=\"tmp.txt\" check-certificate=no;\r\
    \n      }\r\
    \n    }\r\
    \n    :set pos \$e;\r\
    \n  }\r\
    \n}\r\
    \n"
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
add interval=2m name=ATUALIZA-BANCOS-SCHED on-event=\
    "/system script run ATUALIZA-BANCOS" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add disabled=yes interval=30s name=RODA-LIBERA on-event=libera-pix policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add interval=5m name=RODA-LIMPEZA on-event=limpa-expirados policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add disabled=yes interval=1m name=SLS-Libera-WIFI on-event=":local url \"https\
    ://hotsport-pix-2.onrender.com/api/liberacoes\"; /tool fetch url=\$url mod\
    e=https dst-path=liberacoes.json; :local content [/file get liberacoes.jso\
    n contents]; :log info \"SLS: \$content\";" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
add disabled=yes interval=1m name=sls-auto on-event=\
    "/system script run libera-pix" policy=\
    ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon \
    start-time=startup
