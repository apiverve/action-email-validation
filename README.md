# APIVerve Email Validation Action

> Validate email addresses, check deliverability, and verify email authentication records

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Email_Validation-blue?logo=github)](https://github.com/apiverve/action-email-validation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Browse All APIs](https://apiverve.com/marketplace?utm_source=github&utm_medium=action&utm_campaign=email-validation)** | **[Get Free API Key](https://dashboard.apiverve.com/signup?utm_source=github&utm_medium=action&utm_campaign=email-validation)** | **[Documentation](https://docs.apiverve.com?utm_source=github&utm_medium=action&utm_campaign=email-validation)**

---

## What does this action do?

This action provides access to APIVerve's Email Validation APIs directly in your GitHub workflows:

- Validate email addresses before sending
- Detect disposable/temporary email addresses
- Verify SPF, DKIM, and DMARC records
- Check email deliverability configuration

### Available APIs

| API | Description |
|-----|-------------|
| `emailvalidator` | Email Validator checks whether an email address is valid, deliverable and safe. It validates the format, resolves the domain's mail (MX) records, flags disposable and role-based addresses, and returns a composite risk score with typo correction. |
| `emaildisposablechecker` | Disposable Email Checker tests whether an email address belongs to a disposable email provider. Pass any email to receive its domain and a true or false flag showing if it is temporary. |
| `spfvalidator` | SPF Validator checks the Sender Policy Framework (SPF) DNS record for a domain to verify if it’s valid and optionally whether a given IP address is authorized to send emails for that domain. |
| `dkimvalidator` | DKIM Validator checks the DomainKeys Identified Mail (DKIM) DNS records for a domain to verify that they are present and correctly formatted. |
| `dmarcvalidator` | DMARC Validator checks the Domain-based Message Authentication, Reporting and Conformance (DMARC) record for a domain to ensure it is correctly configured. |

---

## Quick Start

```yaml
- name: Email Validation
  uses: apiverve/action-email-validation@v1
  with:
    api_key: ${{ secrets.APIVERVE_KEY }}
    api: emailvalidator
    params: '{"email": "test@example.com"}'
```

---

## Setup

### 1. Get Your API Key

Sign up for a free account at [dashboard.apiverve.com/signup](https://dashboard.apiverve.com/signup?utm_source=github&utm_medium=action&utm_campaign=email-validation) and create an API key.

### 2. Add Secret to Repository

Go to your repository **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

- Name: `APIVERVE_KEY`
- Value: Your API key from the dashboard

### 3. Use in Workflow

```yaml
- name: Email Validation
  uses: apiverve/action-email-validation@v1
  with:
    api_key: ${{ secrets.APIVERVE_KEY }}
    api: emailvalidator
    params: '{"your": "parameters"}'
```

---

## Pass/fail checks

Set `check` and the action stops being a plain API call: it evaluates the result and fails the job when something is wrong, so problems surface in CI instead of in production.

### Gate on SPF, DKIM and DMARC

Fail the job if SPF or DMARC is missing or invalid, or DMARC is not enforced

```yaml
- name: Gate on SPF, DKIM and DMARC
  uses: apiverve/action-email-validation@v1
  with:
    api_key: $
    check: email-auth
    domain: example.com
    dkim_selector: google
    require_dmarc_enforced: true
```

---

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api_key` | Your APIVerve API key (or set `APIVERVE_API_KEY` env var) | Yes* | - |
| `api` | API to use: `emailvalidator`, `emaildisposablechecker`, `spfvalidator`, `dkimvalidator`, `dmarcvalidator` | No | `emailvalidator` |
| `params` | JSON parameters for the API | No | `{}` |
| `output_file` | Path to save binary output (images, PDFs) | No | - |
| `format` | Response format: `json`, `yaml`, or `xml` | No | `json` |
| `fail_on_error` | Fail workflow if API returns error | No | `true` |
| `check` | Run a pass/fail check instead: `email-auth` | No | - |
| `domain` | Domain to check | With `check` | - |
| `dkim_selector` | DKIM selector to verify (skipped if empty) | No | - |
| `require_dmarc_enforced` | Fail unless DMARC is `quarantine` or `reject` | No | `false` |
*\*API key is required but can be provided via input OR `APIVERVE_API_KEY` / `APIVERVE_KEY` environment variable.*

## Outputs

| Output | Description |
|--------|-------------|
| `result` | Full API response as JSON |
| `data` | The `data` field from response as JSON |
| `status` | API status (`ok` or `error`) |
| `file` | Path to downloaded file (if `output_file` was used) |
| `days_remaining` | Days until expiry (`ssl-expiry`, `domain-expiry`) |
| `records` | Matching DNS records as JSON (`dns-record`) |
---

## Examples

### Email Validation

Validate an email address

```yaml
- name: Email Validation
  id: email-validation-0
  uses: apiverve/action-email-validation@v1
  with:
    api_key: ${{ secrets.APIVERVE_KEY }}
    api: emailvalidator
    params: '{"email": "test@example.com"}'

- name: Use result
  run: echo "Result: ${{ steps.email-validation-0.outputs.data }}"
```

### SPF Check

Verify SPF record configuration

```yaml
- name: SPF Check
  id: email-validation-1
  uses: apiverve/action-email-validation@v1
  with:
    api_key: ${{ secrets.APIVERVE_KEY }}
    api: spfvalidator
    params: '{"domain": "example.com"}'

- name: Use result
  run: echo "Result: ${{ steps.email-validation-1.outputs.data }}"
```

### DMARC Check

Verify DMARC record configuration

```yaml
- name: DMARC Check
  id: email-validation-2
  uses: apiverve/action-email-validation@v1
  with:
    api_key: ${{ secrets.APIVERVE_KEY }}
    api: dmarcvalidator
    params: '{"domain": "example.com"}'

- name: Use result
  run: echo "Result: ${{ steps.email-validation-2.outputs.data }}"
```


---

## Full Workflow Example

```yaml
name: Email Validation Workflow

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  email-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Email Validation
        id: result
        uses: apiverve/action-email-validation@v1
        with:
          api_key: ${{ secrets.APIVERVE_KEY }}
          api: emailvalidator
          params: '{"email": "test@example.com"}'

      - name: Show result
        run: |
          echo "Status: ${{ steps.result.outputs.status }}"
          echo "Data: ${{ steps.result.outputs.data }}"
```

---

## Related Actions

Looking for more APIVerve actions?

- [apiverve/action](https://github.com/apiverve/action) - Generic action for all 350+ APIs
- [apiverve/action-release-assets](https://github.com/apiverve/action-release-assets) - Generate QR codes, barcodes, and badges for your GitHub releases
- [apiverve/action-visual-testing](https://github.com/apiverve/action-visual-testing) - Capture screenshots and generate PDFs for visual regression testing and documentation
- [apiverve/action-dns-monitor](https://github.com/apiverve/action-dns-monitor) - Verify DNS configuration, check propagation, and validate DNSSEC after deployments

**[Browse all APIVerve Actions →](https://github.com/marketplace?query=apiverve)**

---

## Pricing

- **Free tier** - Get started with generous free limits
- **Pro plans** - Higher rate limits and priority support for production use

Check out [pricing details](https://apiverve.com/pricing?utm_source=github&utm_medium=action&utm_campaign=email-validation).

---

## Resources

- **API Documentation**: [docs.apiverve.com](https://docs.apiverve.com?utm_source=github&utm_medium=action&utm_campaign=email-validation)
- **API Marketplace**: [apiverve.com/marketplace](https://apiverve.com/marketplace?utm_source=github&utm_medium=action&utm_campaign=email-validation)
- **Issues & Support**: [GitHub Issues](https://github.com/apiverve/action-email-validation/issues)
- **Email**: support@apiverve.com

---

## License

MIT - see [LICENSE](LICENSE)

---

Built by [APIVerve](https://apiverve.com?utm_source=github&utm_medium=action&utm_campaign=email-validation) - 350+ APIs for developers
