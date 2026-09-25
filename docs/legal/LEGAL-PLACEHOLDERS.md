# Legal and Publishing Placeholders

Do not replace these values with guesses. Complete the legal fields with the responsible operator's real information, review the disclosures, and only then publish the pages.

| Placeholder | File(s) | What must be supplied | Why it is required |
|---|---|---|---|
| `[INSERT LEGAL OPERATOR NAME]` | `terms.html`, `terms-of-service.md` | Full legal name of the service operator | Identifies the contracting party and accountable service operator. |
| `[INSERT LEGAL OPERATOR / DATA CONTROLLER NAME]` | `privacy.html`, `privacy-policy.md` | Legal name of the privacy data controller/operator | Identifies who determines and is responsible for personal-data processing. |
| `[INSERT BUSINESS ADDRESS OR REGISTERED LOCATION]` | `terms.html`, `terms-of-service.md`, `privacy.html`, `privacy-policy.md` | Real business/registered address or location that should be disclosed | Gives users and reviewers a real operator contact location; do not invent one. |
| `[INSERT OFFICIAL TERMS CONTACT EMAIL]` | `terms.html`, `terms-of-service.md` | Monitored official Terms contact email | Provides a working channel for contract and service questions. |
| `[INSERT PRIVACY CONTACT EMAIL]` | `privacy.html`, `privacy-policy.md` | Monitored privacy and rights-request email | Gives users a channel for privacy questions and data-rights requests. |
| `[INSERT EFFECTIVE DATE]` | `terms.html`, `terms-of-service.md`, `privacy.html`, `privacy-policy.md` | Date the operator approves and puts each document into effect | Makes the applicable version and start date identifiable. |
| `[INSERT GOVERNING LAW AND JURISDICTION]` | `terms.html`, `terms-of-service.md` | Jurisdiction selected by the responsible operator after legal review | The limitation and dispute terms must match the operator's real legal context. |
| `[INSERT MINIMUM AGE FOR YOUR JURISDICTION]` | `privacy.html`, `privacy-policy.md` | Applicable minimum age and any required safeguards | The age/children disclosure depends on the operator's audience and applicable law. |
| Lawful basis, rights process, response deadlines, and regulator/contact details (currently described as needing operator completion) | `privacy.html`, `privacy-policy.md` | Applicable legal bases, rights, response deadlines, and regulator information | Privacy obligations vary by jurisdiction; the project cannot determine them. |
| Exact local app-data location and deletion procedure (called out in the page but not a bracket token) | `privacy.html`, `privacy-policy.md` | Supported release platform path and tested user deletion steps | Current app does not provide a general in-app database deletion workflow. |

## GitHub Pages-only placeholders

These are deployment values, not legal terms. Replace them only after creating the actual repository and verifying its Pages URL.

| Placeholder | File | What it means |
|---|---|---|
| `YOUR-GITHUB-USERNAME` | `README.md` | GitHub account or organization that owns the repository. |
| `YOUR-REPOSITORY` | `README.md` | Actual GitHub repository name. |

The expected public paths are `/`, `/legal/terms.html`, and `/legal/privacy.html`. They are not live until the owner pushes `main`, configures Pages from `/docs`, and verifies the deployment.
