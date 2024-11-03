#!/bin/bash

# Set your AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=""

# Set your ECR repository names
BACKEND_REPO=""
FRONTEND_REPO=""

# Set your Elastic Beanstalk application and environment names
EB_APPLICATION=""
EB_ENVIRONMENT=""

# Set S3 bucket name
S3_BUCKET="elasticbeanstalk-$AWS_REGION-$AWS_ACCOUNT_ID"

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push backend image
cd backend
docker build --platform=linux/amd64 -t $BACKEND_REPO .
docker tag $BACKEND_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_REPO:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_REPO:latest
cd ..

# Build and push frontend image
cd frontend
docker build --platform=linux/amd64 -t $FRONTEND_REPO .
docker tag $FRONTEND_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FRONTEND_REPO:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FRONTEND_REPO:latest
cd ..

# Update docker-compose.yml file
cat > docker-compose.yml << EOL
services:
  backend:
    image: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$BACKEND_REPO:latest
    ports:
      - "8000:8000"
  frontend:
    image: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FRONTEND_REPO:latest
    ports:
      - "80:3000"
    environment:
      - API_URL=http://backend:8000
EOL

# Check if the environment exists
ENV_EXISTS=$(aws elasticbeanstalk describe-environments --environment-names $EB_ENVIRONMENT --query "Environments[].EnvironmentName" --output text)

if [ -z "$ENV_EXISTS" ]; then
  # Create Elastic Beanstalk environment
  aws elasticbeanstalk create-environment \
    --application-name $EB_APPLICATION \
    --environment-name $EB_ENVIRONMENT \
    --solution-stack-name "64bit Amazon Linux 2 v4.0.3 running Docker" \
    --option-settings file://eb-options.json
  
  # Wait for the environment to be ready
  aws elasticbeanstalk wait environment-exists --environment-names $EB_ENVIRONMENT
fi

# Create a source bundle
zip -r deploy.zip docker-compose.yml

# Upload the source bundle to S3
aws s3 cp deploy.zip s3://$S3_BUCKET/

# Create a new application version
VERSION_LABEL=$EB_APPLICATION-$(date +%Y%m%d%H%M%S)
aws elasticbeanstalk create-application-version \
  --application-name $EB_APPLICATION \
  --version-label $VERSION_LABEL \
  --source-bundle S3Bucket=$S3_BUCKET,S3Key=deploy.zip

# Deploy to Elastic Beanstalk
aws elasticbeanstalk update-environment \
  --environment-name $EB_ENVIRONMENT \
  --version-label $VERSION_LABEL

# Get the security group ID
SECURITY_GROUP_ID=$(aws ec2 describe-security-groups --filters Name=group-name,Values=awseb-e-*-stack-AWSEBSecurityGroup-* --query "SecurityGroups[0].GroupId" --output text)

# Add inbound rules for HTTP and HTTPS - comment out if you do not want internet traffic
aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0
# Add inbound rules for HTTP and HTTPS - comment out if you do not want internet traffic
aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# Get and display the public URL
EB_URL=$(aws elasticbeanstalk describe-environments --environment-names $EB_ENVIRONMENT --query "Environments[0].CNAME" --output text)
echo "Deployment complete!"
echo "Your application is accessible at: http://$EB_URL"
