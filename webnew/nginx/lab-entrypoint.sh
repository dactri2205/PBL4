#!/bin/sh
set -eu

cert_dir=/etc/nginx/certs
cert_file="$cert_dir/server.crt"
key_file="$cert_dir/server.key"
mkdir -p "$cert_dir"

if [ ! -s "$cert_file" ] || [ ! -s "$key_file" ]; then
  hostname=${TLS_HOSTNAME:-localhost}
  case "$hostname" in
    ""|*[!A-Za-z0-9.-]*)
      echo "TLS_HOSTNAME must contain only letters, numbers, dots, or hyphens." >&2
      exit 1
      ;;
  esac

  if printf '%s' "$hostname" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    identity="IP:$hostname"
  else
    identity="DNS:$hostname"
  fi

  openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 \
    -keyout "$key_file" \
    -out "$cert_file" \
    -subj "/CN=$hostname" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,$identity" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign,cRLSign" \
    -addext "extendedKeyUsage=serverAuth"
  chmod 600 "$key_file"
  chmod 644 "$cert_file"
fi

exec /docker-entrypoint.sh nginx -g 'daemon off;'
