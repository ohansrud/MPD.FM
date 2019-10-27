#!/bin/bash
cd "$( dirname "${BASH_SOURCE[0]}" )"

SYSTEMD_UNIT="MPD.FM"
cp ${SYSTEMD_UNIT}.service /etc/systemd/system/
cp -avr src /usr/local/sbin/${SYSTEMD_UNIT}
cd /usr/local/sbin/${SYSTEMD_UNIT}
npm install 

systemctl daemon-reload
systemctl enable ${SYSTEMD_UNIT}.service
systemctl restart ${SYSTEMD_UNIT}.service