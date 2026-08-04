# 2026-08-03 16:05:54 by RouterOS 7.23.2
# software id = XKIG-Y0RP
#
# model = RB760iGS
# serial number = HJX0AX1ZZVK
/ip hotspot profile
add dns-name=sls.wifi hotspot-address=192.168.88.1 html-directory=\
    flash/hotspot login-by=http-chap name=hsprof1
add dns-name=sls.wifi hotspot-address=10.5.50.1 html-directory=flash/hotspot \
    login-by=http-chap name=pix-profile
add dns-name=sls.wifi hotspot-address=192.168.88.1 html-directory=\
    flash/hotspot login-by=http-chap,http-pap name=hs-pix
add dns-name=sls.wifi hotspot-address=10.5.50.1 html-directory=flash/hotspot \
    http-cookie-lifetime=1d login-by=cookie,http-chap,http-pap name=hsprof2
