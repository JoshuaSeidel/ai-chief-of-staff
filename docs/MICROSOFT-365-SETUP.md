# Microsoft 365 Integration Setup

This guide is for creating the Microsoft Entra app registration used by AI Chief of Staff in a real Microsoft 365 tenant. Do not create this app only for local development unless you also intend to authorize real mailbox, calendar, Planner, and Teams data from that tenant.

The platform uses one Microsoft 365 connection for:

- Calendar and meeting list access
- Email intake
- Microsoft Planner and To Do task sync
- Teams transcript and recording capture when tenant-level app permissions are enabled

## Prerequisites

- Microsoft Entra admin access for the tenant.
- Global Administrator, Cloud Application Administrator, or Application Administrator rights to create and consent to the app registration.
- Teams Administrator or equivalent rights to grant the Teams application access policy if Teams transcript/recording capture is required.
- The public URL where AI Chief of Staff will run in production.

For local testing, the backend callback URL is:

```text
http://localhost:3001/api/calendar/microsoft/callback
```

For production, use your public backend URL:

```text
https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

The redirect URI must match exactly in Microsoft Entra and in the AI Chief of Staff Configuration page.

## macOS CLI Setup: Create And Authorize The App

Use this path from macOS Terminal when you want command-line setup with
Homebrew, Azure CLI, and `jq`. It creates the Microsoft Entra app registration,
Microsoft Graph permissions, client secret, and admin consent.

Run it once for a new app registration. If you already created an app, either
delete the duplicate app registration first or adapt the script to use the
existing app ID.

This grants tenant-wide admin consent for the listed Graph permissions. Review
the permissions before running it.

```bash
# =============================================================================
# AI Chief of Staff - Microsoft 365 macOS CLI setup
# =============================================================================

set -euo pipefail

# ----- Required values you must edit -----
APP_NAME="AI Chief of Staff"
REDIRECT_URI="https://aicos.yourdomain.com/api/calendar/microsoft/callback"
CLIENT_SECRET_YEARS="2"

# Optional but recommended: set your tenant ID or verified tenant domain.
# Leave blank to use the tenant selected during az login.
TENANT=""

# ----- Install tools on macOS -----
brew install azure-cli jq

# ----- Sign in as a Global Admin / Cloud App Admin / Application Admin -----
if [ -n "$TENANT" ]; then
  az login --tenant "$TENANT" --allow-no-subscriptions
else
  az login --allow-no-subscriptions
fi

TENANT_ID="$(az account show --query tenantId -o tsv)"
GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"
GRAPH_SP_JSON="$(az ad sp show --id "$GRAPH_APP_ID" -o json)"

DELEGATED_PERMISSIONS=(
  "offline_access"
  "User.Read"
  "Calendars.ReadWrite"
  "Tasks.ReadWrite"
  "Mail.ReadWrite"
  "OnlineMeetings.Read"
)

APPLICATION_PERMISSIONS=(
  "OnlineMeetings.Read.All"
  "OnlineMeetingTranscript.Read.All"
  "OnlineMeetingRecording.Read.All"
)

get_scope_id() {
  echo "$GRAPH_SP_JSON" | jq -r --arg value "$1" \
    '.oauth2PermissionScopes[] | select(.value == $value and .isEnabled == true) | .id' |
    head -n 1
}

get_role_id() {
  echo "$GRAPH_SP_JSON" | jq -r --arg value "$1" \
    '.appRoles[] | select(.value == $value and .isEnabled == true) | .id' |
    head -n 1
}

API_PERMISSIONS=()

for scope in "${DELEGATED_PERMISSIONS[@]}"; do
  permission_id="$(get_scope_id "$scope")"
  if [ -z "$permission_id" ] || [ "$permission_id" = "null" ]; then
    echo "Missing Microsoft Graph delegated permission: $scope" >&2
    exit 1
  fi
  API_PERMISSIONS+=("${permission_id}=Scope")
done

for role in "${APPLICATION_PERMISSIONS[@]}"; do
  permission_id="$(get_role_id "$role")"
  if [ -z "$permission_id" ] || [ "$permission_id" = "null" ]; then
    echo "Missing Microsoft Graph application permission: $role" >&2
    exit 1
  fi
  API_PERMISSIONS+=("${permission_id}=Role")
done

# ----- Create the app registration -----
APP_ID="$(
  az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience AzureADMyOrg \
    --web-redirect-uris "$REDIRECT_URI" \
    --query appId \
    -o tsv
)"

APP_OBJECT_ID="$(az ad app show --id "$APP_ID" --query id -o tsv)"

# Create the enterprise application / service principal.
az ad sp create --id "$APP_ID" >/dev/null

SP_OBJECT_ID=""
for attempt in {1..12}; do
  SP_OBJECT_ID="$(az ad sp show --id "$APP_ID" --query id -o tsv 2>/dev/null || true)"
  if [ -n "$SP_OBJECT_ID" ]; then
    break
  fi
  sleep 5
done

if [ -z "$SP_OBJECT_ID" ]; then
  echo "Service principal was not available after waiting." >&2
  exit 1
fi

# ----- Add Microsoft Graph permissions to the app registration -----
az ad app permission add \
  --id "$APP_ID" \
  --api "$GRAPH_APP_ID" \
  --api-permissions "${API_PERMISSIONS[@]}"

# ----- Grant admin consent for delegated and application permissions -----
az ad app permission admin-consent --id "$APP_ID"

# ----- Create a client secret -----
CLIENT_SECRET="$(
  az ad app credential reset \
    --id "$APP_ID" \
    --display-name "AI Chief of Staff backend" \
    --years "$CLIENT_SECRET_YEARS" \
    --query password \
    -o tsv
)"

# ----- Output values for AI Chief of Staff -----
cat <<EOF

Save these values in AI Chief of Staff or deployment secrets:

MICROSOFT_CLIENT_ID=$APP_ID
MICROSOFT_TENANT_ID=$TENANT_ID
MICROSOFT_REDIRECT_URI=$REDIRECT_URI
MICROSOFT_CLIENT_SECRET=$CLIENT_SECRET

Store MICROSOFT_CLIENT_SECRET now. Microsoft will not show it again.
EOF
```

### macOS CLI Verification Commands

Use these commands after the setup script completes:

```bash
# Confirm the app registration.
az ad app show \
  --id "$APP_ID" \
  --query "{displayName:displayName, appId:appId, signInAudience:signInAudience, redirectUris:web.redirectUris}" \
  -o json

# Confirm the service principal exists.
az ad sp show \
  --id "$APP_ID" \
  --query "{displayName:displayName, appId:appId, objectId:id}" \
  -o json

# Confirm configured Graph permissions on the app registration.
az ad app permission list \
  --id "$APP_ID" \
  -o table
```

### Teams Transcript And Recording Capture Policy

Azure CLI can create and consent the Microsoft Entra app, but Microsoft does
not currently expose the Teams application access policy through Azure CLI or a
Microsoft Graph administrative endpoint. If you need Teams transcript or
recording capture, Microsoft documents the `New-CsApplicationAccessPolicy` and
`Grant-CsApplicationAccessPolicy` cmdlets for this final policy step.

You can still run those commands on macOS by installing PowerShell 7 and the
Microsoft Teams module:

```bash
brew install --cask powershell
pwsh
```

Then run the Teams policy commands inside `pwsh`:

```powershell
Install-Module MicrosoftTeams -Scope CurrentUser -Force
Connect-MicrosoftTeams

$AppId = "<MICROSOFT_CLIENT_ID_FROM_THE_AZURE_CLI_SCRIPT>"
$PolicyName = "AIChiefOfStaff-Meetings"
$OrganizerUpn = "organizer@yourdomain.com"

New-CsApplicationAccessPolicy `
  -Identity $PolicyName `
  -AppIds $AppId `
  -Description "Allow AI Chief of Staff to read authorized Teams meeting artifacts"

# Recommended: assign only to organizer users whose meetings should be captured.
Grant-CsApplicationAccessPolicy `
  -PolicyName $PolicyName `
  -Identity $OrganizerUpn

# Alternative: assign globally if your compliance posture allows it.
# Grant-CsApplicationAccessPolicy `
#   -PolicyName $PolicyName `
#   -Global
```

If you do not run the Teams policy commands, email, calendar, Planner, and
meeting metadata can still work, but app-only Teams transcript/recording capture
can return forbidden responses. Teams policy changes can take up to 30 minutes
to affect Microsoft Graph API calls.

## Step 1: Register The App

1. Open the Microsoft Entra admin center.
2. Go to **Identity** > **Applications** > **App registrations**.
3. Select **New registration**.
4. Use these values:
   - **Name**: `AI Chief of Staff`
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI platform**: `Web`
   - **Redirect URI**: your production callback URL, for example:

     ```text
     https://aicos.yourdomain.com/api/calendar/microsoft/callback
     ```

5. Select **Register**.
6. On the app Overview page, copy:
   - **Application (client) ID**
   - **Directory (tenant) ID**

Use a single-tenant app for production unless you explicitly operate this as a multi-tenant SaaS product. Teams transcript/recording capture uses app-only permissions and requires a concrete tenant ID, not `common`.

## Step 2: Create A Client Secret

1. In the app registration, go to **Certificates & secrets**.
2. Select **New client secret**.
3. Use a clear description such as `AI Chief of Staff backend`.
4. Choose an expiration that matches your secret rotation policy.
5. Copy the secret **Value** immediately. Microsoft only shows it once.

Store the secret in the AI Chief of Staff Configuration page or in your deployment secret store. Do not commit it to the repository.

## Step 3: Add Delegated Microsoft Graph Permissions

Delegated permissions are used after a user signs in through the Configuration page. Add these Microsoft Graph delegated permissions:

```text
offline_access
User.Read
Calendars.ReadWrite
Tasks.ReadWrite
Mail.ReadWrite
OnlineMeetings.Read
```

These scopes allow the signed-in user to:

- Keep a refresh token for continued sync
- Read their profile
- Read and update calendar events
- Read and update Planner/To Do tasks
- Read and update mailbox messages for email intake
- Read online meeting metadata associated with their meetings

After adding the permissions, select **Grant admin consent** for the tenant if your organization requires admin approval.

## Step 4: Add App-Only Permissions For Teams Capture

Teams transcript and recording capture is not completed by delegated mailbox/calendar permissions alone. If the system should capture Teams meeting transcripts or recording metadata without an interactive user token, add these Microsoft Graph **Application permissions**:

```text
OnlineMeetings.Read.All
OnlineMeetingTranscript.Read.All
OnlineMeetingRecording.Read.All
```

Then select **Grant admin consent**.

These are high-impact permissions. Scope operational access with the Teams application access policy in the next step.

## Step 5: Grant A Teams Application Access Policy

Microsoft requires a Teams application access policy for app-only online meeting artifact APIs. Without it, Graph calls can fail with a forbidden error even when the Graph application permissions have admin consent.

This is the only setup step that Azure CLI does not support. On macOS, install
PowerShell 7 and run the Teams module from Terminal:

```bash
brew install --cask powershell
pwsh
```

Then install and connect the Teams module inside `pwsh`:

```powershell
Install-Module MicrosoftTeams -Scope CurrentUser
Connect-MicrosoftTeams
```

Create a policy for the app. Replace `<APPLICATION_CLIENT_ID>` with the app registration's Application (client) ID:

```powershell
New-CsApplicationAccessPolicy `
  -Identity AIChiefOfStaff-Meetings `
  -AppIds "<APPLICATION_CLIENT_ID>" `
  -Description "Allow AI Chief of Staff to read authorized Teams meeting artifacts"
```

Grant it to a specific organizer user:

```powershell
Grant-CsApplicationAccessPolicy `
  -PolicyName AIChiefOfStaff-Meetings `
  -Identity "<USER_OBJECT_ID_OR_UPN>"
```

Or grant it tenant-wide only if that is acceptable for your compliance posture:

```powershell
Grant-CsApplicationAccessPolicy `
  -PolicyName AIChiefOfStaff-Meetings `
  -Global
```

Policy changes can take up to 30 minutes to affect Microsoft Graph API calls.

## Step 6: Configure AI Chief Of Staff

In AI Chief of Staff, open **Settings** > **Integrations** > **Microsoft 365** and enter:

```text
Client ID:     Application (client) ID
Client Secret: Client secret value
Tenant ID:     Directory (tenant) ID
Redirect URI:  https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

For production, prefer the tenant GUID instead of `common`.

Save the configuration, then select **Connect to Microsoft**. Sign in as the user whose mailbox, calendar, and tasks should be managed. The connection stores the user token in the profile integration table.

## Step 7: Environment Variables

The same values can be supplied through deployment secrets or `.env`:

```env
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret-value
MICROSOFT_TENANT_ID=your-directory-tenant-id
MICROSOFT_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

Also configure the production security controls:

```env
FRONTEND_URL=https://aicos.yourdomain.com
ALLOWED_ORIGINS=https://aicos.yourdomain.com
AICOS_AUTH_TOKEN=generate-a-long-random-token
OAUTH_STATE_SECRET=generate-a-long-random-secret
```

Leave `VITE_API_TOKEN` blank for public deployments and let authorized users enter the API token in the in-app secure API prompt.

## Verification

After connecting Microsoft 365:

1. Open the app header and confirm the configured Microsoft pills appear.
2. Open **Email** and confirm mailbox messages load.
3. Switch to **Meetings** and confirm calendar meetings load.
4. Process a meeting that has a Teams join URL.
5. If Teams transcript capture is configured, verify the processed transcript source is `teams-transcript`.
6. If Teams capture is not available for that meeting, the system falls back to importing calendar meeting metadata and body content.

## Troubleshooting

- **Invalid redirect URI**: The Microsoft Entra redirect URI and the app Configuration redirect URI must match exactly.
- **Microsoft not connected**: Save the Client ID, Client Secret, Tenant ID, and Redirect URI, then run the Connect flow again.
- **Missing email access**: Reconnect Microsoft after adding `Mail.ReadWrite` and granting consent.
- **Missing Planner access**: Reconnect Microsoft after adding `Tasks.ReadWrite` and granting consent.
- **Teams capture forbidden**: Confirm the app has application permissions, admin consent, and the Teams application access policy.
- **No matching Teams online meeting found**: The meeting must include a Teams join URL and still be available through Microsoft Graph.
- **Policy recently added**: Wait up to 30 minutes after granting the Teams application access policy.
- **AADSTS50194 or `/common` endpoint error**: The app is single-tenant. Set `MICROSOFT_TENANT_ID` and the in-app Tenant ID field to the Directory tenant ID GUID or a verified tenant domain, then reconnect Microsoft 365.
- **Client credentials fail with tenant `common`**: Set `MICROSOFT_TENANT_ID` to the Directory (tenant) ID GUID.

## Microsoft References

- App registration and client secret flow: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-web-app-sign-in
- Redirect URI guidance: https://learn.microsoft.com/en-us/entra/identity-platform/reply-url
- Microsoft Graph permissions reference: https://learn.microsoft.com/en-us/graph/permissions-reference
- Teams application access policy: https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy
- List Teams recordings permissions: https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-recordings
- List Teams transcripts permissions: https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts
