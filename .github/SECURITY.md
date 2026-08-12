# Security Policy

Fenéla is a public MIT-licensed portfolio and software project.

Security issues should be reported privately where possible so they can be reviewed before public disclosure.

## Reporting a vulnerability

Please use GitHub's **Private Vulnerability Reporting** for this repository.

Do not open a public GitHub issue for a suspected vulnerability that could expose:

- credentials or secrets;
- authentication or authorization weaknesses;
- cross-user data access;
- account deletion or retention failures;
- insecure API routes;
- injection vulnerabilities;
- sensitive user data;
- other security-relevant implementation details.

When reporting a vulnerability, include enough information to reproduce and assess the issue, such as:

- the affected route, component or dependency;
- the expected behavior;
- the observed behavior;
- reproduction steps;
- relevant environment details;
- potential impact.

Do not include real user data, credentials, API keys or other secrets in the report.

## Supported version

Security fixes are applied to the current version of the repository.

Older revisions, historical commits and independently modified forks are not maintained as supported releases.

## Public deployments

Fenéla is provided as MIT-licensed software.

Anyone operating their own public deployment is responsible for securing and maintaining that deployment, including:

- environment and secret management;
- authentication configuration;
- database access controls;
- dependency updates;
- hosting and network configuration;
- provider configuration;
- monitoring and incident response.

Security settings and assumptions documented in this repository should be reviewed against the operator's own deployment environment.

## Disclosure

Please allow reasonable time for a reported issue to be reviewed and, where appropriate, corrected before publishing technical details that could put users or deployments at risk.

This policy does not create a guaranteed response time, support agreement or security warranty.
