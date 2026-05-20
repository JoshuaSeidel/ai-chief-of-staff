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

Install and connect the Teams PowerShell module from an admin workstation:

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
- **Client credentials fail with tenant `common`**: Set `MICROSOFT_TENANT_ID` to the Directory (tenant) ID GUID.

## Microsoft References

- App registration and client secret flow: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-web-app-sign-in
- Redirect URI guidance: https://learn.microsoft.com/en-us/entra/identity-platform/reply-url
- Microsoft Graph permissions reference: https://learn.microsoft.com/en-us/graph/permissions-reference
- Teams application access policy: https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy
- List Teams recordings permissions: https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-recordings
- List Teams transcripts permissions: https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts
