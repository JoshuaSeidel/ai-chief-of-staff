# Unraid Community Apps Submission

This note tracks the files and checks needed to submit AI Chief of Staff to
Unraid Community Apps.

## Submission Files

All Unraid assets live in `unraid/`:

- `ai-chief-of-staff.xml`: primary all-in-one template
- `ai-chief-of-staff-microservices.xml`: template for a main app container that
  points at separately deployed microservices
- `icon.png`: application icon
- `README.md`: user-facing Unraid setup guide

## Current URLs

```text
Repository: https://github.com/JoshuaSeidel/ai-chief-of-staff
Template:   https://raw.githubusercontent.com/JoshuaSeidel/ai-chief-of-staff/main/unraid/ai-chief-of-staff.xml
Icon:       https://raw.githubusercontent.com/JoshuaSeidel/ai-chief-of-staff/main/unraid/icon.png
Support:    https://github.com/JoshuaSeidel/ai-chief-of-staff/issues
Image:      ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-monolith:latest
```

## Required User Configuration

The template must make these settings clear before submission:

- `AICOS_AUTH_TOKEN` is preferred. `API_TOKEN` remains as a legacy alias.
- At least one backend API token must be configured before destructive admin
  tools can run.
- Destructive admin tools, including history wipe, are disabled until
  `AICOS_AUTH_TOKEN` or `API_TOKEN` is configured.
- `FRONTEND_URL`, `ALLOWED_ORIGINS`, and `TRUST_PROXY` should be configured for
  SWAG or any other HTTPS reverse proxy.
- PostgreSQL is recommended, and first-run config is generated from `DB_TYPE`,
  `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, and
  `POSTGRES_PASSWORD`.

## Pull Request Text

```text
Title: Add AI Chief of Staff - AI-powered executive operations workspace

Application: AI Chief of Staff
Category: Productivity / Tools
Repository: https://github.com/JoshuaSeidel/ai-chief-of-staff
Template URL: https://raw.githubusercontent.com/JoshuaSeidel/ai-chief-of-staff/main/unraid/ai-chief-of-staff.xml
Icon URL: https://raw.githubusercontent.com/JoshuaSeidel/ai-chief-of-staff/main/unraid/icon.png

Features:
- Meeting transcript processing and task extraction
- Executive briefs, follow-up tracking, and productivity insights
- Microsoft 365 and Google Calendar connectivity
- Jira or Microsoft Planner connectivity status
- Admin history wipe with token-protected destructive action
- Mobile-responsive PWA with push notifications
- PostgreSQL or SQLite database support

Requirements:
- AICOS_AUTH_TOKEN or API_TOKEN for API auth and destructive admin tools
- PostgreSQL database recommended; SQLite supported for smaller deployments
- Optional AI provider API keys configured in Settings

Tested on: Unraid 6.12+
```

## Manual Installation URL

Until accepted into Community Apps, users can add this template URL manually in
Docker -> Add Container -> Template repositories:

```text
https://raw.githubusercontent.com/JoshuaSeidel/ai-chief-of-staff/main/unraid/ai-chief-of-staff.xml
```

## Validation Checklist

- [ ] XML is well-formed.
- [ ] Template, icon, support, and project URLs resolve.
- [ ] Icon is PNG and at least 512x512.
- [ ] `AICOS_AUTH_TOKEN` is visible and documented as the preferred token.
- [ ] `API_TOKEN` is present only as an advanced legacy alias.
- [ ] PostgreSQL first-run env values are documented.
- [ ] SWAG values are documented: `FRONTEND_URL`, `ALLOWED_ORIGINS`,
      `TRUST_PROXY`, and OAuth redirect URIs.
- [ ] Container starts successfully.
- [ ] Web UI is accessible.
- [ ] SQLite mode works.
- [ ] PostgreSQL mode works on a fresh appdata directory.
- [ ] Admin history wipe is blocked when no token is configured.
- [ ] Admin history wipe works after entering the configured token.
- [ ] Configuration persists across restarts.
- [ ] Updates work correctly.

## Community Apps Process

1. Fork `https://github.com/Squidly271/Community-Applications-Moderators`.
2. Create a branch such as `add-ai-chief-of-staff`.
3. Add the XML template to the appropriate category directory.
4. Commit and push the branch.
5. Open a pull request using the text above.

After acceptance, keep the template in sync with any breaking environment
variable, image, port, or storage changes.
