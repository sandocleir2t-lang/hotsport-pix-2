# 2026-08-03 16:05:54 by RouterOS 7.23.2
# software id = XKIG-Y0RP
#
# model = RB760iGS
# serial number = HJX0AX1ZZVK
/ip hotspot user profile
add idle-timeout=5m keepalive-timeout=3h name=3horas session-timeout=3h
add idle-timeout=5m name=1HORA session-timeout=1h
add idle-timeout=5m name=2HORAS session-timeout=2h
add idle-timeout=10m name=EVENTO session-timeout=8h
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
