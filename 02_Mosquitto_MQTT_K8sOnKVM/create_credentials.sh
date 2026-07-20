CONTAINER_RUNTIME="podman"

if [ -n "$2" ];then
    $CONTAINER_RUNTIME run --rm -v $(pwd):/out eclipse-mosquitto:openssl \
      mosquitto_passwd -c -b /out/passwd $1 $2
    cat passwd
    rm -rf passwd
else
    echo -e "    Command Usage: \ncreate_credentials.sh <username> <password> "
fi