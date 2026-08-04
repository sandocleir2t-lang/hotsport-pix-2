# 2026-07-30 16:21:38 by RouterOS 7.23.2
# software id = XKIG-Y0RP
#
# model = RB760iGS
# serial number = HJX0AX1ZZVK
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
