#!/bin/bash
# This script deploys the AutobatControl-ConfigLight CloudFormation StackSet to a specific OU

# Exit on error
set -euo pipefail

# Configuration - Edit these values
STACK_SET_NAME="AWSControlTowerBP-BASELINE-CONFIG"
TEMPLATE_FILE="./AWSControlTowerBP-BASELINE-CONFIG.yaml"
AWS_PROFILE="<<YOUR SSO ADMIN PROFILE>>"
HOME_REGION="<<YOUR HOME REGION>>"
MANAGEMENT_ACCOUNT_ID="<<YOUR MANAGEMENT ACCOUNT ID>>"
SECURITY_ACCOUNT_ID="<<YOUR SECURITY/AUDIT ACCOUNT ID>>"
LOG_ACCOUNT_ID="<<YOUR LOG ARCHIVE ACCOUNT ID>>"
LOG_PREFIX="<<LOG PREFIX CONFIGURED BY CONTROL TOWER>>"

# Roles for StackSet operations
ADMIN_ROLE_ARN="arn:aws:iam::${MANAGEMENT_ACCOUNT_ID}:role/service-role/AWSControlTowerStackSetRole"
EXECUTION_ROLE_NAME="AWSControlTowerExecution"

# Define resource types to monitor
declare -a RESOURCE_TYPES=(
  "AWS::ACM::Certificate"
  "AWS::AutoScaling::AutoScalingGroup"
  "AWS::CloudFormation::Stack"
  "AWS::CloudTrail::Trail"
  "AWS::CloudWatch::Alarm"
  "AWS::DynamoDB::Table"
  "AWS::EC2::EIP"
  "AWS::EC2::Instance"
  "AWS::EC2::NetworkAcl"
  "AWS::EC2::RouteTable"
  "AWS::EC2::SecurityGroup"
  "AWS::EC2::Subnet"
  "AWS::EC2::VPC"
  "AWS::EC2::VPCEndpoint"
  "AWS::EC2::Volume"
  "AWS::ElasticLoadBalancing::LoadBalancer"
  "AWS::ElasticLoadBalancingV2::LoadBalancer"
  "AWS::IAM::Group"
  "AWS::IAM::Policy"
  "AWS::IAM::Role"
  "AWS::IAM::User"
  "AWS::KMS::Key"
  "AWS::Lambda::Function"
  "AWS::RDS::DBInstance"
  "AWS::RDS::DBSecurityGroup"
  "AWS::RDS::DBSnapshot"
  "AWS::RDS::DBSubnetGroup"
  "AWS::S3::Bucket"
  "AWS::SecretsManager::Secret"
  "AWS::SNS::Topic"
  "AWS::SQS::Queue"
)
# Join array elements with pipe separator
RESOURCES=$(IFS="|"; echo "${RESOURCE_TYPES[*]}")

# Parameter values
declare -A PARAMS=(
  ["ManagedResourcePrefix"]="aws-controltower"
  ["AllSupported"]="false"
  ["IncludeGlobalResourceTypes"]="false"
  ["ResourceTypesPsv"]="$RESOURCES"
  ["Frequency"]="24hours"
  ["AllConfigTopicName"]="aws-controltower-AllConfigNotifications"
  ["SecurityAccountId"]=$SECURITY_ACCOUNT_ID
  ["AuditBucketName"]="aws-controltower-logs-${LOG_ACCOUNT_ID}-ap-southeast-2"
  ["AWSLogsS3KeyPrefix"]=$LOG_PREFIX
  ["HomeRegionName"]="$HOME_REGION"
  ["IsHomeRegionInitialControlTowerRegion"]="true"
  ["KMSKeyArn"]="NONE"
)

# Validate template file exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "Error: Template file not found at $TEMPLATE_FILE"
    exit 1
fi

echo "Updating StackSet: $STACK_SET_NAME"
echo "Using template: $TEMPLATE_FILE"
echo "Using AWS profile: $AWS_PROFILE"

# Build parameters string for AWS CLI
PARAMETERS=""
for key in "${!PARAMS[@]}"; do
    PARAMETERS="$PARAMETERS ParameterKey=$key,ParameterValue=${PARAMS[$key]}"
done

# Common arguments for both create and update operations
COMMON_ARGS=(
    --stack-set-name "$STACK_SET_NAME"
    --template-body "file://$TEMPLATE_FILE"
    --parameters $PARAMETERS
    --capabilities CAPABILITY_NAMED_IAM
    --administration-role-arn "$ADMIN_ROLE_ARN"
    --execution-role-name "$EXECUTION_ROLE_NAME"
    --profile "$AWS_PROFILE"
    --region "$HOME_REGION"
)


# Update existing StackSet
echo "Executing CloudFormation update-stack-set..."
aws cloudformation update-stack-set \
    "${COMMON_ARGS[@]}" \
    --operation-preferences "FailureToleranceCount=0"