
# Autobat AWS Lab – Foundation Series
This repo contains part of the [Autobat Industries Lab](https://autobat.com.au) setup — a secure, scalable AWS environment built to learn, explore, and run real workloads.

## 🔐 [Identity Center (SSO) Configuration](https://www.autobat.com.au/page/lab-foundation--identity-center-sso)

This folder contains YAML configuration for setting up AWS Identity Center across a multi-account environment:

- **Root account org-level config**: defines user groups, permission sets (using AWS-managed policies), and custom policy hooks.
- **Target account config**: defines the custom policies referenced in the org-level file.

Once configured, users are added to groups (e.g. `DevOpsTeam`, `DataEngineers`), and account access is provisioned by AWS based on the group + permission set combo including environment-specific custom permissions (e.g. more control in `NonProd`, more restriction in `Prod`).

## ✅ Why this pattern?

- Centralized group management  
- Environment-aware access control  
- Reusable patterns for any team  
- CLI-ready with `aws sso login`