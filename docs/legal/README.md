# Public Legal Pages — GitHub Pages Setup

These static pages are under `docs/legal/`. Nothing has been pushed, and no GitHub login, repository, username, or custom domain has been assumed.

## Before publishing

1. Complete every bracketed placeholder in `terms.html`, `privacy.html`, `terms-of-service.md`, and `privacy-policy.md`: legal operator/controller name, business address or registered location, official contact emails, effective date, governing law/jurisdiction, minimum age, and applicable privacy-law details.
2. Have the responsible operator review the factual statements and obtain legal review for the governing law and required disclosures.
3. Keep all credentials, tokens, private user information, and local databases out of the published `docs/` folder. GitHub Pages content is public.

## Manual GitHub Pages steps

1. Create an empty GitHub repository. Suggested name: `pipip-live-tiktok`; do not add unrelated starter files.
2. In this checkout, confirm `git status --short --branch` shows local branch `main`; review `.gitignore` and the legal placeholders before publishing.
3. Add the real repository clone URL manually as `origin`. Never use the template URL below literally.
4. Review staged files for credentials, `.env` files, databases, generated data, and local audio. Stage, inspect the staged diff, commit, then push branch `main` manually.
5. In GitHub repository settings, open **Settings → Pages**.
7. Under **Build and deployment**, select **Deploy from a branch**.
8. Select branch `main`.
9. Select folder `/docs`.
10. Save the Pages settings.
11. Wait for the GitHub Pages deployment to complete and for the status page to show its generated site address.
12. Open the generated HTTPS URL shown by GitHub Pages.
13. Verify `/`, `/legal/terms.html`, and `/legal/privacy.html` in a private/incognito browser window while signed out of GitHub; confirm navigation works and legal placeholders have been completed.

Example commands after creating the remote and substituting the actual account and repository. Inspect the staged files before committing:

```sh
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/YOUR-REPOSITORY.git
git status --short
git add -A
git diff --cached
git commit -m "Add Pipip public legal pages"
git push -u origin main
```

If `origin` already exists, inspect it and only update it if it is the intended repository. Do not commit credentials. If the Pages settings offer **Enforce HTTPS**, enable it after the site is available.

GitHub Pages supports publishing from a selected branch and either the repository root or a `/docs` folder. The site is publicly accessible after deployment; do not publish sensitive repository content. See [GitHub's publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [HTTPS guide](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Expected URLs

With the repository path publishing from `/docs`, the expected base URL is:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/
```

Legal home:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/legal/
```

Terms of Service URL for TikTok Developer:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/legal/terms.html
```

Privacy Policy URL for TikTok Developer:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/legal/privacy.html
```

Expected relative paths on the deployed site are `/`, `/legal/terms.html`, and `/legal/privacy.html`. These are URL templates, not live URLs. Replace the placeholders with the real GitHub account and repository after publishing. If you instead use a user/organization site repository, GitHub's base URL format differs; use the live URL shown in Pages settings.

## Verify public access and configure TikTok Developer

After public verification, enter the live Terms of Service URL and Privacy Policy URL above in the matching TikTok Developer fields. Use the exact deployed URLs, not the placeholders. TikTok requires valid Terms and Privacy Policy links to be visible on the official website and asks developers to verify URL ownership; review [TikTok's Developer Guidelines](https://developers.tiktok.com/docs/en/our-guidelines-developer-guidelines) and [Login Kit requirements](https://developers.tiktok.com/docs/en/login-kit-desktop) before submitting.

## Required owner information

- Legal operator/data-controller name and address or registered location.
- Official Terms contact email and privacy/rights-request email.
- Effective date and governing law/jurisdiction.
- Applicable minimum age, privacy-law lawful bases, rights process, response deadlines, and regulator information.
- Exact local app-data location and deletion procedure for the release platform.
- Whether the operator will enable external Gemini/OpenAI advisors or change Ollama to a hosted endpoint; revise disclosures before doing so.
