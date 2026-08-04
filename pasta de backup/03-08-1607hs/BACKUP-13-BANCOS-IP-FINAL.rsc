# 2026-07-30 16:44:12 by RouterOS 7.23.2
# software id = XKIG-Y0RP
#
# model = RB760iGS
# serial number = HJX0AX1ZZVK
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
