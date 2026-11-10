#!/bin/sh
# Run as the owner of /data, so the database on a bind mount belongs to the host user. PUID/PGID override that. A
# root-owned /data (Docker created the folder) falls back to uid/gid 1000. Only /data itself is chowned.
# Certificates mounted into /usr/local/share/ca-certificates (an internal CA, a corporate root) join the system store,
# which Node trusts through --use-system-ca.
set -e
if [ "$(id -u)" = 0 ] && ls /usr/local/share/ca-certificates/*.crt >/dev/null 2>&1; then
  update-ca-certificates >/dev/null 2>&1
fi
if [ "$(id -u)" != 0 ]; then
  exec "$@"
fi
uid=${PUID:-$(stat -c %u /data)}
gid=${PGID:-$(stat -c %g /data)}
if [ "$uid" = 0 ]; then uid=1000; fi
if [ "$gid" = 0 ]; then gid=1000; fi
[ "$(stat -c %u:%g /data)" = "$uid:$gid" ] || chown "$uid:$gid" /data
exec su-exec "$uid:$gid" "$@"
