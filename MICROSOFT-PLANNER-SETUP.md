# Microsoft Planner/To Do Integration Setup Guide

This guide will help you set up Microsoft Planner integration using your personal Azure account.

## Prerequisites

- A personal Microsoft/Azure account (not work account)
- Access to [Azure Portal](https://portal.azure.com)

## Step 1: Register an App in Azure Portal

**IMPORTANT**: You must be signed into Azure Portal with a **personal Microsoft account** (like @outlook.com, @hotmail.com, or a personal @gmail.com that's linked to Microsoft), NOT a work/school account. If you're signed in with a work account, sign out and sign in with your personal account.

1. Go to [Azure Portal](https://portal.azure.com)
   - **Make sure you're signed in with your personal Microsoft account**, not your work account
   - If you see your work email in the top right, click it and select "Sign out", then sign in with your personal account
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **+ New registration**
4. Fill in the form:
   - **Name**: `AI Chief of Staff` (or any name you prefer)
   - **Supported account types**: Select **Personal Microsoft accounts only** or **Accounts in any organizational directory and personal Microsoft accounts**
     - **Note**: If you want to use your work account, you must select "Accounts in any organizational directory and personal Microsoft accounts" and your work admin must approve the app
   - **Redirect URI**: 
     - Type: **Web**
     - URI: `http://localhost:3001/api/planner/microsoft/callback` (for local dev)
     - For production: `https://yourdomain.com/api/planner/microsoft/callback`
5. Click **Register**

## Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Add the following permissions:
   - `Tasks.ReadWrite` - Read and write user tasks (Microsoft To Do)
   - `User.Read` - Read user profile
6. Click **Add permissions**
7. **Important**: Click **Grant admin consent** (if available) or consent when you connect

## Step 3: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **+ New client secret**
3. Fill in:
   - **Description**: `AI Chief of Staff Secret`
   - **Expires**: Choose your preferred expiration (24 months recommended)
4. Click **Add**
5. **IMPORTANT**: Copy the **Value** immediately (you won't be able to see it again)
   - This is your **Client Secret**

## Step 4: Get Your Tenant ID

1. In Azure Portal, go to **Azure Active Directory** → **Overview**
2. Copy the **Tenant ID** (looks like: `12345678-1234-1234-1234-123456789abc`)

## Step 5: Get Your Application (Client) ID

1. In your app registration, go to **Overview**
2. Copy the **Application (client) ID** (looks like: `87654321-4321-4321-4321-cba987654321`)

## Step 6: Configure in AI Chief of Staff

1. Open the Configuration page in AI Chief of Staff
2. Scroll to **Microsoft Planner Integration**
3. Enter:
   - **Tenant ID**: Your Azure Tenant ID
   - **Client ID**: Your Application (Client) ID
   - **Client Secret**: The client secret value you copied
   - **Redirect URI**: Should match what you registered (or leave blank for default)
4. Click **Save Configuration**
5. Click **Connect Microsoft Planner**
6. Sign in with your Microsoft account and grant permissions
7. ✅ Done! Tasks will now automatically sync to Microsoft To Do

## What You Need to Provide

When setting up, you'll need these values from Azure:

1. **Tenant ID** - From Azure AD Overview
2. **Client ID** - From App Registration Overview  
3. **Client Secret** - From Certificates & secrets (create new one)
4. **Redirect URI** - The callback URL (configured in app registration)

## Features

- **Automatic Sync**: New tasks from transcripts automatically create Microsoft To Do tasks
- **Manual Sync**: Use the "Sync to Microsoft Planner" button on the Tasks page to backfill existing tasks
- **Task Details**: Tasks include description, due date, priority, and suggested approach
- **Status Sync**: Task status is mapped between systems

## Troubleshooting

- **"Invalid client"**: Check that Client ID and Tenant ID are correct
- **"Invalid redirect URI"**: Ensure redirect URI in Azure matches the one in configuration
- **"Insufficient permissions"**: Make sure you've granted all required permissions
- **"Token expired"**: The app will automatically refresh tokens, but you may need to reconnect if refresh fails
- **"AADSTS50020: User account does not exist in tenant"**: 
  - **Problem**: You're trying to sign in with a work/school account but the app is registered for personal accounts only
  - **Solution 1 (Recommended)**: Sign in with a personal Microsoft account (@outlook.com, @hotmail.com, or personal @gmail.com)
  - **Solution 2**: Update your app registration to support work accounts:
    1. Go to Azure Portal → App registrations → Your app
    2. Click **Authentication** → **Supported account types**
    3. Select **Accounts in any organizational directory and personal Microsoft accounts**
    4. Save and try connecting again
    5. Your work admin may need to approve the app

