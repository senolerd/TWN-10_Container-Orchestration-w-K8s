## NodeJS with MongoDB on AWS EKS using AWS ALB via AWS LBC

This sample/simple application NodeJs/MongoDB is planned to run on AWS EKS with, Gateway API (not Ingress), AWS PVC CNI, EBS CSI, AWS LBC, AWS ALB . 
(Yes, Amazon DocumentDB and AWS ECR are exist)

This document assumes the first directory about setting infra of EKS (00-AWS-EKS_K8s-GatewayApi_ALB_intergration) is read.

#### EKS cluster: 
- Set Normal mode, not Auto mode.
- Has two managed worker node. 
- EBS CNI addon is applied at controller setup stage
- > kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true\
    for bypassing IP limitation. VPC should be bigger more than /24, lets make it /16
- GatewayClass, LoadBalancerConfiguration and Gateway should be set according to 00-AWS-EKS_K8s-GatewayApi_ALB_intergration's README.md

## Manual Installation
#### Important TODOs before starting:

- Build the app image with Containerfile
- create_registry_login_secret.sh for creating 09-Docker_secret.yaml which is going to be used to pull private image.
- Checking STS manifests spec.volumeClaimTemplates.spec.storageClassName matches with the SC comes from EBS Addon.
- Checking, HTTPoute manifes'
    - spec.parentRefs.name matches with the Gateway name
    - spec.rules.matches.backendRefs.name matches witg the applications service name

## Helm Chart Installation

Expected resources at the cluster are; GatewayClass and Gateway. For helper details, "00-AWS-EKS_K8s-GatewayApi_ALB_intergration" can be looked up for creating a "gatewayClass, loadBalancerConfiguration and gateway". also for EBS CSI addon for ebs storageClass (gp2) that MongoDB is going to need.

- Content of helm-vals.yaml

    infra: AWS # or KVM
    registryAddr: '' # ex: 'https://index.docker.io/v1/'
    repoUsername: ''
    repoPersonalAccessToken: '' # ex: 'dckr_pat_....'
    httpRouteParentRef: '' # ex: 'my-alb-gateway'
    db:
    storage:
        className: '' # gp2 

To install the chart: 

    helm upgrade --install my-release chart -f helm-vals.yaml

To verify whats going on with the ALB:

    kubectl get gatewayclass {gateway_class_name} # ACCEPTED: True
    kubectl get gateway {gateway_name} # PROGRAMMED: True, look for an address
    kubectl get httproute {httpdRote name} 