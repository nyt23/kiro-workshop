# AWS Profile Enforcement

This project uses the AWS profile `workshop` (us-east-1).

When running any AWS CLI command or generating any AWS-related code:

- Always use `--profile workshop` with AWS CLI commands
- Always set `AWS_PROFILE=workshop` when suggesting environment variables
- When generating AWS SDK code, configure it to use the `workshop` profile
- When creating SAM or CloudFormation deployment commands, include `--profile workshop`
- Never use a default profile or any other named profile