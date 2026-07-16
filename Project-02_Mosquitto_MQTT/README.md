## Mosquitto Message Broker over K8s

A quick Mosquitto Message Broker deployment over K8s. Credential customization can be done via create_credentials.sh script file.
For testing purpose it listens no-tls port (31883) and websocket (31885) with Nodeport.

** Since broker gives an warning;
### "Warning: File /mosquitto/passwd owner is not mosquitto. Future versions will refuse to load this file.To fix this, use `chown mosquitto /mosquitto/passwd`"
An initcontainer with "emptyDir" volume and is used to set `/mosquitto/passwd` file owner.


    kubectl apply -f mosquitto