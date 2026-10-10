#!/bin/sh
# Run as the owner of /data, so the database on a bind mount belongs to the host user. PUID/PGID override that. A
# root-owned /data (Docker created the folder) falls back to uid/gid 1000. Only /data itself is chowned.
set -e
if [ "$(id -u)" != 0 ]; then
  exec "$@"
fi
uid=${PUID:-$(stat -c %u /data)}
gid=${PGID:-$(stat -c %g /data)}
if [ "$uid" = 0 ]; then uid=1000; fi
if [ "$gid" = 0 ]; then gid=1000; fi
[ "$(stat -c %u:%g /data)" = "$uid:$gid" ] || chown "$uid:$gid" /data
exec su-exec "$uid:$gid" "$@"
