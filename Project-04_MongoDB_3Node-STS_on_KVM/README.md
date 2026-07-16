
# 3 Node MongoDB cluster and Mongo Express over KVM local K8s cluster 

## STAGE 1 - PREPARE NFS 
NFS server is on dedicated NFS server

    $ sudo dnf install -y nfs-utils
    $ sudo mkdir -p /exports/mongo-{1,2,3}
    $ sudo chown 999:999 /exports/mongo-{1,2,3} # MongoDB will use mongodb user with 999:999 as UID:GID
    $ sudo chmod 0750 /exports/mongo-{1,2,3}

  /etc/exports file content for 192.168.1.0/24 network. Assumme the k8s worker nodes has access to this network
    /exports/mongo-0  192.168.1.0/24(rw,sync,no_subtree_check)
    /exports/mongo-1  192.168.1.0/24(rw,sync,no_subtree_check)
    /exports/mongo-2  192.168.1.0/24(rw,sync,no_subtree_check)

- What is going on with the /etc/exports line;
- 192.168.x.0/24 — restrict to cluster's subnet, not "*". No reason to expose this beyond k8s nodes.
- rw — read-write, needed for App's data directory.
- sync — server acknowledges writes only after they're actually committed to disk, not just cached. Slower than async, but async risks silent data loss/corruption on server crash — for a database's data directory, sync is the correct tradeoff.  No "async" here even though it's tempting for performance.
- no_subtree_check — skips a legacy consistency check that's mostly irrelevant on modern setups and just adds overhead; standard recommendation.
- no_root_squash — [important]: by default NFS maps root on the client to the anonymous nobody user (root_squash, the safer default) as a security measure. no_root_squash lets client-root write as real root. MongoDB containers often run as their own UID (not root) inside, so you may not even need this — worth checking what UID the App image actually runs as first. If it's non-root (it is, by default — (lets say Mongo images, typically run as UID 999)), you likely want to skip no_root_squash and instead just make sure /exports/mongo-manual is owned/permissioned for that UID directly.

Enabling NFS;

    $ sudo systemctl enable --now nfs-server
    $ sudo exportfs -arv
    $ sudo firewall-cmd --permanent --add-service=nfs --add-service=rpc-bind --add-service=mountd
    $ sudo firewall-cmd --reload

To verify whether k8s nodes has access to NFS server

    $ showmount -e <nfs-server-ip>

Expected output: 

    Export list for <nfs-server-ip>:
    /exports/mongo-2 192.168.1.0/24
    /exports/mongo-1 192.168.1.0/24
    /exports/mongo-0 192.168.1.0/24

## STAGE 2 - Creating MongoDB Cluster 

    kubectl apply -n default -f 01-mongo-pv.yaml
    kubectl apply -n default -f 02-mongo-configs-secrets
    kubectl apply -n default -f 03-mongo-sts.yaml
    kubectl apply -n default -f 04-mongo-svc.yaml
    kubectl apply -n default -f 05-mongo-express.yaml

*Replication initilation: exec into a pod amd initlate (it will prompt password. It will be "password" if it is not changed)* 
    $ kubectl exec -it -n default mongo-sts-0 -- mongosh -u root -p 

**Initiate MongoDB cluster**
[Notice]: If the namespace is changed while applying resources, the namespace should updated at member' lines belov

    rs.initiate({
      _id: "rs0",
      members: [
        { _id: 0, host: "mongo-sts-0.mongodb-headless.default.svc.cluster.local:27017" },
        { _id: 1, host: "mongo-sts-1.mongodb-headless.default.svc.cluster.local:27017" },
        { _id: 2, host: "mongo-sts-2.mongodb-headless.default.svc.cluster.local:27017" }
      ]
    })

MongoDB cluster state check;
    rs.status() 

Replication state check;
    rs.printSecondaryReplicationInfo()

[Notice]: In case of messing up; resource removing order is STS > PVC > PV, then others if needed. 

If the "05-mongo-express.yaml" is applied, the mongo-express will be accessable at
login username and password

    http://{any_k8s_node}:30081