## Deploying "Online Boutique" microservices with Helm


### About the project:
**Google Online Boutique**: 
    
"Online Boutique is a cloud-first microservices demo application. The application is a web-based e-commerce app where users can browse items, add them to the cart, and purchase them."

Project lives at https://github.com/GoogleCloudPlatform/microservices-demo.

### Usage instructions:

The chart is ready to use on **K8s Gateway API**_**  on AWS EKS+ALB. Since AWS needs some extra settings to adjust Target Group with ALB loadbalancer; 

#### NodePort accessable deployment
- "nodePort" is empty by default. It can be set in values.yaml or `--set nodePort=(30000:32767)` will make the fronend accessable via any k8s node ip and port.

#### LoadBalance accessable deployment
- To apply httpRoute, **_isLbEnabled_** should set to true and **_gateway_** shoulh be given. The Helm chart assumes Gateway API's gatewayClass and gateway are set for ingress traffic *(for guidance, 00-AWS-EKS_K8s-GatewayApi_ALB_integration can be checked out in this repo)*.

- If the chart is being deployed with on EKS and desired to use ALB, 'platform' should set to "AWS" in values.yaml or `--set platform=AWS` at helm command to set extra settings for AWS platform. For bare-metal ```KVM``` can be used.

<br>

---
### Some helm commands related to deployment

To deploy;

    helm upgrade --install my-release helm-chart


To enable nodePort for the deployment;

    helm upgrade --install  --set nodePort=30000 my-release helm-chart


To enable loadbalancer for the deployment;

    helm upgrade --install \
      --set isLbEnabled=true \
      --set gateway="gateway-ext" \
      --set platform="AWS" \
      my-release helm-chart

To enable loadbalancer for the deployment with specific hostname;

    helm upgrade --install \
      --set isLbEnabled=true \
      --set gateway=my-gateway-ext \
      --set hostname="test.mydomain.com" \
      my-release helm-chart
