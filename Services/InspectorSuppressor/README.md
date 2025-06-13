
# Autobat AWS Lab – Foundation Series
This repo contains part of the [Autobat Industries Lab](https://autobat.com.au) setup — a secure, scalable AWS environment built to learn, explore, and run real workloads.

## 🔐 [Inspector Suppressor](https://www.autobat.com.au/page/lab-foundation--inspector-suppressor)

The Inspector Suppressor is a solution that automates the management of AWS Inspector scanning for Lambda functions across your AWS accounts. It helps control costs and optimize security scanning by scheduling when Inspector scans are active.

### Key Features:

- **Scheduled Scanning Control**: Automatically enables Inspector scanning on the 1st of each month and disables it on the 3rd
- **Tag-Based Management**: Uses AWS resource tags to control which Lambda functions are included in or excluded from scanning
- **Exclusion Support**: Functions with the `InspectorSuppressorExclusion` tag set to `true` are skipped

### Components:

- **Lambda Function**: Updates tags on all Lambda functions in the account based on scanning configuration
- **EventBridge Rules**: Schedule the enabling and disabling of scanning on a monthly basis
- **IAM Role**: Provides necessary permissions for the Lambda to list and tag functions

This solution helps balance security needs with cost optimization by ensuring Inspector scans run only during specific windows, reducing the overall cost while maintaining security visibility.