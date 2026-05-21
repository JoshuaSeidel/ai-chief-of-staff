const UNSUPPORTED_TENANT_ALIASES = new Set(['common', 'organizations', 'consumers']);

function normalizeMicrosoftTenantId(value) {
  return String(value || '').trim();
}

function isUnsupportedMicrosoftTenantAlias(value) {
  return UNSUPPORTED_TENANT_ALIASES.has(normalizeMicrosoftTenantId(value).toLowerCase());
}

function resolveMicrosoftTenantId(configuredTenantId, fallbackTenantId) {
  const configured = normalizeMicrosoftTenantId(configuredTenantId);
  const fallback = normalizeMicrosoftTenantId(fallbackTenantId);

  if (configured && !isUnsupportedMicrosoftTenantAlias(configured)) {
    return configured;
  }

  return fallback || configured;
}

function requireMicrosoftTenantId(value) {
  const tenantId = normalizeMicrosoftTenantId(value);

  if (!tenantId) {
    throw new Error('Microsoft Tenant ID is required. Use the Directory tenant ID GUID or a verified tenant domain.');
  }

  if (UNSUPPORTED_TENANT_ALIASES.has(tenantId.toLowerCase())) {
    throw new Error(`Microsoft Tenant ID must be a tenant GUID or verified domain. "${tenantId}" uses a shared endpoint that is not supported for this single-tenant app.`);
  }

  return tenantId;
}

function getMicrosoftIdentityBaseUrl(tenantId) {
  return `https://login.microsoftonline.com/${encodeURIComponent(requireMicrosoftTenantId(tenantId))}/oauth2/v2.0`;
}

module.exports = {
  normalizeMicrosoftTenantId,
  resolveMicrosoftTenantId,
  requireMicrosoftTenantId,
  getMicrosoftIdentityBaseUrl,
  isUnsupportedMicrosoftTenantAlias,
  UNSUPPORTED_TENANT_ALIASES
};
