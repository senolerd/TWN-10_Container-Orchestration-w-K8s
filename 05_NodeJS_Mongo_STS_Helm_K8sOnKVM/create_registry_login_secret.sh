# This script creates a secret w/ type of k8s docker-registry to use 
# at pod templates spec of "imagePullSecrets" item to login image registry. 
# Just creates, doesn't not apply. Uses "https://index.docker.io/v1/" as a 
# default registry address, but it will ask if you want change it. Also, asks username 
# and password of the registry credentials. It doesn't verify againsit to registry 
# whether credentials are working. The yaml file for the secret will be created
# at k8s directory with "01-" prefix. After the creation of a key, sts yaml file'
# "imagePullSecrets" of the pod template spec should be updated with the 
# new secrets name taken from metadata.name.

echo "\n============================================================"
echo "*** Use Read-Only set Personal Access Token (PAT) as password"
echo "============================================================\n"

FILE="k8s/01-docker_secret.yaml"
REG_ADDR="https://index.docker.io/v1/"

echo "OCI Registry Address (Default:  $REG_ADDR): "; read NEW_REG_ADDR

if [ -n "$NEW_REG_ADDR" ]; then
  echo "Registry address is set to [$NEW_REG_ADDR]"
  REG_ADDR=$NEW_REG_ADDR
fi

rm -rf $FILE
echo "Registry Username: "; read REG_USER
echo "Registry Password (Read-Only Docker PAT): "; read REG_PASS

kubectl create secret docker-registry registry-secret-of-$REG_USER \
  --docker-server=$REG_ADDR \
  --docker-username=$REG_USER \
  --docker-password=$REG_PASS \
  --dry-run=client -o yaml > $FILE


if [ -f "k8s/docker_secret.yaml" ]; then
    echo "New $FILE is created"
else
    echo "Something went wrong and $FILE could not be created!"
fi
