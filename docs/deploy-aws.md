# Deploy on AWS

Run steps 1–6 on your own computer with the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). Run step 7 on the new server over SSH.

## Step 1: Sign the AWS CLI in

```bash
aws login --profile osmcp --region us-east-1 --remote
export AWS_PROFILE=osmcp AWS_REGION=us-east-1
```

`aws login` opens the AWS console sign-in and gives the CLI that user's access. Any credentials that can create EC2 resources work instead.

## Step 2: Create an SSH key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/opensuitemcp -N ""
aws ec2 import-key-pair --key-name opensuitemcp \
  --public-key-material fileb://$HOME/.ssh/opensuitemcp.pub
```

## Step 3: Create the security group

```bash
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 create-security-group --group-name opensuitemcp \
  --description "OpenSuiteMCP" --vpc-id $VPC --query GroupId --output text)
MYIP=$(curl -fsS https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id $SG --ip-permissions \
  "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MYIP/32}]" \
  "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]" \
  "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]"
```

- **Port 22** opens only to the IP address you run this from.
- **Ports 80 and 443** serve the app. Let's Encrypt also needs port 80 to issue the certificate.
- **Using your own VPC?** Set `VPC` to its ID, and add `--subnet-id` with a public subnet in step 4.

## Step 4: Launch the server

**Decide first:** pick the instance type.

| Account | Instance type | Size | On-demand price (us-east-1) |
|---|---|---|---|
| Paid | `t3.medium` | 2 vCPU, 4 GB | $0.0416/hour |
| Free plan | `c7i-flex.large` | 2 vCPU, 4 GB | $0.0848/hour, taken from credits |

```bash
TYPE=t3.medium
AMI=$(aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text)
IID=$(aws ec2 run-instances --image-id $AMI --instance-type $TYPE \
  --key-name opensuitemcp --security-group-ids $SG \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3}' \
  --metadata-options HttpTokens=required \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=opensuitemcp}]' \
  --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids $IID
```

## Step 5: Give the server a fixed IP address

```bash
ALLOC=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id $IID --allocation-id $ALLOC
IP=$(aws ec2 describe-addresses --allocation-ids $ALLOC \
  --query 'Addresses[0].PublicIp' --output text)
echo $IP
```

## Step 6: Point the domain at the server

Add a DNS **A** record from the domain people will open, for example `osmcp.example.com`, to the IP address from step 5.

No domain yet? Use `<ip-with-dashes>.sslip.io`, for example `34-194-85-42.sslip.io`. It already resolves to that IP address.

## Step 7: Install OpenSuiteMCP

```bash
ssh -i ~/.ssh/opensuitemcp ubuntu@$IP
```

On the server, run one of these:

**Organization install**: one organization, with an owner and admins.

```bash
curl -fsSL https://raw.githubusercontent.com/unstackedapps/opensuitemcp/main/deploy/install.sh \
  | sudo bash -s -- --domain osmcp.example.com --mode org --root-email you@example.com
```

**Solo install**: individual accounts.

```bash
curl -fsSL https://raw.githubusercontent.com/unstackedapps/opensuitemcp/main/deploy/install.sh \
  | sudo bash -s -- --domain osmcp.example.com --mode solo
```

The installer prints the address when the app answers.

- **`--root-email`** is the NetSuite user who becomes the owner. Use their NetSuite login email.
- **A warning about DNS** means the A record from step 6 doesn't point here yet. The certificate request keeps failing until it does.

## Step 8: Sign in

- **Organization install:** open `https://<domain>/setup` and sign in as the `--root-email` user. See [NetSuite OIDC login](netsuite-oidc-login.md) for the NetSuite sign-in.
- **Solo install:** open `https://<domain>/login` and create your account.

**Afterward:** see [Self-host reference](self-host.md) for updates, backups and rollback.

## Remove everything

This deletes the server, its disk and every backup on it. It cannot be undone.

```bash
aws ec2 terminate-instances --instance-ids $IID
aws ec2 wait instance-terminated --instance-ids $IID
aws ec2 release-address --allocation-id $ALLOC
aws ec2 delete-security-group --group-id $SG
aws ec2 delete-key-pair --key-name opensuitemcp
```
