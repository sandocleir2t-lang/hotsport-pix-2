# 2026-07-30 16:49:55 by RouterOS 7.23.2
# software id = XKIG-Y0RP
#
# model = RB760iGS
# serial number = HJX0AX1ZZVK
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
