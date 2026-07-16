A quick MongoDB StatefullSet work for POW of cluster node lock for certain STS resource to certain worker node. 
As a PersistentVolume type, HostPath is used and nodeAffinity is practised on this resource
instead of STS' pod template. With the help of volumeBindingMode: WaitForFirstConsumer in the StorageClass, 
the volume mount waits until the Pod is ready. Pod provision sequence looks at the PV's nodeAffinity and 
spawns the pod at that node. When the Pod is ready, volume is being mount. 