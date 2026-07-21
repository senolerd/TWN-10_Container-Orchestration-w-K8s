
*AWS Load Balancer Controller (LBC) reached GA support for Gateway API in March 2026*

VPC CNI + prefix delegation STS to internet-facing traffic via Gateway API + ALB

-------------------------------------------------------------------
------------- Fresh EKS Gateway API Adoptation w/ ALB path 
-------------------------------------------------------------------

1. IAM trust for the controller 
2. Install Gateway API CRDs
3. Install AWS Load Balancer Controller
4. GatewayClass → Gateway → HTTPRoute
5. Verify + production hardening

-- "EKS Pod Identity" path will be followed, not the "IRSA (IAM Roles for Service Accounts)" --

## Stage 1 — IAM identity for the LBC (Load Balancer Controller) pod 

### 1.1 Apply Pod Identity Agent to EKS cluster

    <!-- If prefering to install Pod Identity Agent via console. -->
    `aws eks create-addon --cluster-name {CLUSTER_NAME} --addon-name eks-pod-identity-agent`

### 1.2 Adding AWS's official LBC IAM policy (includes Gateway API actions as of recent versions)
(https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json)

    aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam-policy.json

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

### 1.3 Attaching policy (from 1.2) to role (from 1.3) (Don't forget to update ACCOUNT_ID)

    aws iam attach-role-policy \
    --role-name AmazonEKSLoadBalancerControllerRole \
    --policy-arn arn:aws:iam::ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy

### 1.4 Attaching policy (from 1.2) to role (from 1.3) (Don't forget to update CLUSTER_NAME)

    aws eks create-pod-identity-association \
    --cluster-name CLUSTER_NAME \
    --namespace kube-system \
    --service-account aws-load-balancer-controller \
    --role-arn arn:aws:iam::ACCOUNT_ID:role/AmazonEKSLoadBalancerControllerRole

Note: Normally, this IAM policy/role creation is Terraform (usually the terraform-aws-modules/eks module has helpers), not one-off CLI calls — you'll want that in your Ansible/Terraform pipeline rather than manual aws iam calls. This git repo is all about doing things hard/boring/teaching/manual way. 

## Stage 2 — Gateway API CRDs

Unlike Ingress (built into K8s core), Gateway API is CRD-based and must be installed explicitly.

    kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml

AWS-specific CRDs:

    `kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller/crds?ref=master"`

TargetGroupConfiguration, LoadBalancerConfiguration, ListenerRuleConfiguration — AWS-specific extensions, bridge Gateway API's cloud-agnostic model into ALB-specific settings (subnets, WAF, ACM certs, etc).

## Stage 3 — The AWS LBC - Load Balancer Controller 

### Stage 3.1 — Install the AWS Load Balancer Controller (Don't forget to update CLUSTER_NAME)

    
    helm repo add eks https://aws.github.io/eks-charts
    helm repo update

    helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
    -n kube-system \
    --set clusterName=CLUSTER_NAME \
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

> **LoadBalancerConfiguration** — the AWS-specific.

    apiVersion: gateway.k8s.aws/v1beta1
    kind: LoadBalancerConfiguration
    metadata:
        name: my-app-lb-config
    spec:
        scheme: internet-facing
        # In production: pin subnets explicitly rather than relying on auto-discovery
        subnets:
            ids:
            - subnet-XXXX
            - subnet-YYYY



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








------------- By-Passing IP limitation 
By-Passing small instance IP limitation for EKS. 
kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true

The Risk: If you created a very tiny VPC Subnet (like a /24 which only holds 256 IPs total), a few t3.small 
nodes utilizing Prefix Delegation can greedily consume all available blocks, causing the subnet to run out of IPs for other resources.

The Fix: Ensure your EKS worker nodes are sitting inside a reasonably sized private subnet (such as a /22 or /21).

------------- EBS Driver
Amazon EBS CSI driver must be installed at cluster Add-On page.

