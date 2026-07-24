
# K8s Gateway API Adoptation for Fresh EKS to use AWS LBC (w/ Pod Identity) with ALB 

AWS Load Balancer Controller (LBC) the K8s Gateway Api Controller is reached GA (General Availability, which means can be used in prod env.) support for Gateway API in March 2026. With this setup the EKS fresh infra is being ready to use Gateway API (instead Ingress) via AWS Load Balancer Controller to use AWS ALB. Resources, GatewayClass, Gateway and LoadBalancerConfiguration are for only once, HTTPRoute and TargetGroupConfiguration are per application. My application is usgin mongo. To make MongoDB's data persistent I added AWS EBS addon to cluster (don't forget create/add its role wile adding addon), and used EBS CNI to provision PV via Dynamic provision. 

The path will be followed;

1. IAM trust for the controller 
2. Install Gateway API CRDs
3. Install AWS Load Balancer Controller
4. GatewayClass → Gateway → HTTPRoute
5. Verify 

#### By-Passing IP limitation for fresh EKS
By-Passing small instance IP limitation for EKS. It should be done before worker nodes created. If the worker nodes are deployed, should be deleted and created again.

    kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true

>  "EKS Pod Identity" will be used, not the "IRSA (IAM Roles for Service Accounts)"

## Stage 1 — IAM identity for the LBC (Load Balancer Controller) pod 

### 1.1 Apply Pod Identity Agent to EKS cluster

*If prefering to install Pod Identity Agent via console. Don't forget to update CLUSTER_NAME*

aws eks create-addon --cluster-name {CLUSTER_NAME} --addon-name eks-pod-identity-agent

### 1.2 Adding AWS's official LBC IAM policy (includes Gateway API actions as of recent versions)
(https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json)

    aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json

### 1.3 Creating a role for LBC 

    aws iam create-role --role-name AmazonEKSLoadBalancerControllerRole \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "pods.eks.amazonaws.com"},
        "Action": ["sts:AssumeRole", "sts:TagSession"]
        }]
    }'

### 1.3 Attaching policy (from 1.2) to role (from 1.3) (Don't forget to update ACCOUNT_ID (no dashes))

    aws iam attach-role-policy \
    --role-name AmazonEKSLoadBalancerControllerRole \
    --policy-arn arn:aws:iam::ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy

### 1.4 Letting EKS to use this role when LBC pod needs to talk AWS APIs (Don't forget to update CLUSTER_NAME and ACCOUNT_ID (no dashes))

    aws eks create-pod-identity-association \
    --cluster-name CLUSTER_NAME \
    --namespace kube-system \
    --service-account aws-load-balancer-controller \
    --role-arn arn:aws:iam::ACCOUNT_ID:role/AmazonEKSLoadBalancerControllerRole

Note: Normally, this IAM policy/role creation is Terraform works (usually the terraform-aws-modules/eks module has helpers), not one-off CLI calls — you'll want that in your Ansible/Terraform pipeline rather than manual aws iam calls. This git repo is all about doing things hard/boring/learning/teaching/POW/manual way. 

## Stage 2 — Gateway API CRDs

Unlike Ingress (built into K8s core), Gateway API is CRD-based and must be installed explicitly.

    kubectl apply --server-side=true -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.0/standard-install.yaml
    kubectl apply --server-side=true -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.0/experimental-install.yaml
    (experimental is TCPRoute, UDPRoute, TLSRoute of NLBGatewayAPI of L4 routing NLB. Just a superset of standard, harmless. 
    Maybe I would like to try those when the cluster ready, after I understand ALB, and super bored looking trouble. 
    It gave some errors while applying experimental because some of the CRDs not allowed with experimentals, i ignore errors for now)

AWS-specific CRDs:

    will come with Helm install for aws-load-balancer-controller

TargetGroupConfiguration, LoadBalancerConfiguration, ListenerRuleConfiguration — AWS-specific extensions, bridge Gateway API's cloud-agnostic model into ALB-specific settings (subnets, WAF, ACM certs, etc).

## Stage 3 — The AWS LBC - Load Balancer Controller 

### Stage 3.1 — Install the AWS Load Balancer Controller (Don't forget to update CLUSTER_NAME, VPC_ID, REGION)
    
    helm repo add eks https://aws.github.io/eks-charts
    helm repo update

    helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
    --version 3.4.2 \
    -n kube-system \
    --set clusterName=CLUSTER_NAME \
    --set vpcId=vpc-XXXXXXXXXXXX \
    --set region=REGION \
    --set serviceAccount.create=true \
    --set serviceAccount.name=aws-load-balancer-controller \
    --set enableServiceMutatorWebhook=false \
    --set-json 'featureGates={"ALBGatewayAPI":true}'

    helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller \
    --version 3.4.2 \
    -n kube-system \
    --set clusterName=test-eks \
    --set vpcId=vpc-04c88d4b577826fa3 \
    --set region=us-east-1 \
    --set serviceAccount.create=true \
    --set serviceAccount.name=aws-load-balancer-controller \
    --set enableServiceMutatorWebhook=false \
    --set-json 'featureGates={"ALBGatewayAPI":true}'

Gateway API support is behind a "feature gate", off by default even in current LBC versions. For not wondering why GatewayClass never gets ACCEPTED: True.

### Stage 3.2 — Verifying LBC pod

    kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
    kubectl logs -n kube-system deploy/aws-load-balancer-controller

## Stage 4 — GatewayClass, Gateway, HTTPRoute

> **GatewayClass** — cluster-scoped, references the controller:

    apiVersion: gateway.networking.k8s.io/v1
    kind: GatewayClass
    metadata:
        name: alb
    spec:
        controllerName: gateway.k8s.aws/alb

> **LoadBalancerConfiguration** — the AWS-specific:

    apiVersion: gateway.k8s.aws/v1beta1
    kind: LoadBalancerConfiguration
    metadata:
        name: my-app-lb-config
    spec:
        scheme: internet-facing # the LB comes with internal facing as default. This config manifest with this scheme settings, becomes internet facing.
        # Pinning subnets explicitly rather than relying on auto-discovery
        # subnets:
        #    ids:
        #    - subnet-XXXX
        #    - subnet-YYYY

> **Gateway**:

    apiVersion: gateway.networking.k8s.io/v1
    kind: Gateway
    metadata:
        name: my-app-gateway
    spec:
        gatewayClassName: alb
        infrastructure:
            parametersRef:
                group: gateway.k8s.aws
                kind: LoadBalancerConfiguration
                name: my-app-lb-config
        listeners:
            - name: http
            protocol: HTTP
            port: 80
            allowedRoutes:
                namespaces:
                    from: Same

> **HTTPRoute** — Example HTTPRoute to points at application's Service:

    apiVersion: gateway.networking.k8s.io/v1
    kind: HTTPRoute
    metadata:
        name: my-app-route
    spec:
        parentRefs:
            - name: my-app-gateway
        rules:
            - matches:
                - path:
                    type: PathPrefix
                    value: /
            backendRefs:
            - name: my-app-svc  # the service of the application
                port: 3000

> **TargetGroupConfiguration** — set target type to ip via TargetGroupConfiguration (one per STS/Deployment service):

    apiVersion: gateway.k8s.aws/v1beta1
    kind: TargetGroupConfiguration
    metadata:
        name: nodejs-mongo-tg-config
    namespace: default
    spec:
        targetReference:
            name: nodejs-mongo
        defaultConfiguration:
            targetType: ip #it is going to be pod's ip. Other option is "instance" which uses NodePort. ip is faster and preferred option, they say.


Apply in order (GatewayClass → LoadBalancerConfiguration → Gateway → HTTPRoute → TargetGroupConfiguration)

## Stage 5 — Verifying

At this point things should be done. To verify;

    kubectl get gatewayclass alb          # ACCEPTED: True
    kubectl get gateway my-app-gateway    # PROGRAMMED: True, look for an address
    kubectl get httproute my-app-route -n default






==== Unplaced but good to know notes couldn't find a placed lo locate in the readme.md ====
#### About By-Passing IP limitation for fresh EKS
By-Passing small instance IP limitation for EKS. It should be done before worker node. If the worker nodes are deployed, should be deleted and created again.\

> kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true

The Problem: If you created a very tiny VPC Subnet (like a /24 which only holds 256 IPs total), a few t3.small 
nodes utilizing Prefix Delegation can greedily consume all available blocks, causing the subnet to run out of IPs for other resources.

The Fix: Ensure your EKS worker nodes are sitting inside a reasonably sized private subnet (such as a /22 or /21).

EBS Driver:
Amazon EBS CSI driver must be installed at cluster Add-On page to use provision/use EBS disks.

### Multiple domain Gateway and HTTPRoute example in case
Routes probably will need seperated TargetGroupConfiguration for single LB but i didn't try 

    apiVersion: gateway.networking.k8s.io/v1
    kind: Gateway
    metadata:
    name: shared-gateway
    spec:
    gatewayClassName: alb
    listeners:
        - name: https
        protocol: HTTPS
        port: 443
        allowedRoutes:
            namespaces:
            from: All 
    ---
    apiVersion: gateway.networking.k8s.io/v1
    kind: HTTPRoute
    metadata:
    name: app-one-route
    spec:
    parentRefs:
        - name: shared-gateway
    hostnames:
        - "app-one.com"
    rules:
        - backendRefs:
            - name: app-one-svc
            port: 3000
    ---
    apiVersion: gateway.networking.k8s.io/v1
    kind: HTTPRoute
    metadata:
    name: app-two-route
    spec:
    parentRefs:
        - name: shared-gateway
    hostnames:
        - "app-two.com"
    rules:
        - backendRefs:
            - name: app-two-svc
            port: 3000