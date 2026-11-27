-- auth.sqlite as noticebox 0.22.0 made it, before next-app-kit (backend/upgrade.test.ts): one person, ada@test.example,
-- with a session, a read+write and a read API token (scopes under "inbox") and a consent for the client "claude". Made
-- with that release's own openAuth and createApiToken, secret "f" x 40, then dumped; the session's expiry is moved to 2126
-- so the test doesn't age. A throwaway file: none of its tokens or sessions works anywhere else.
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
INSERT INTO user VALUES('L16emyZQhVd9oag1jZgQyDTsuOXERXMX','Ada','ada@test.example',1,NULL,'2026-11-27T06:56:06.569Z','2026-11-27T06:56:06.569Z');
CREATE TABLE IF NOT EXISTS "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
INSERT INTO session VALUES('BAzAsaXae8SZxyrcnnCUcRBboafbzd4X','2126-12-04T06:56:06.572Z','x0LhYbJ372g3gCY9Wjhf62DF7YfAuquC','2026-11-27T06:56:06.572Z','2026-11-27T06:56:06.572Z','','','L16emyZQhVd9oag1jZgQyDTsuOXERXMX');
CREATE TABLE IF NOT EXISTS "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE IF NOT EXISTS "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE IF NOT EXISTS "jwks" ("id" text not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" date not null, "expiresAt" date, "alg" text, "crv" text);
CREATE TABLE IF NOT EXISTS "oauthClient" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" integer, "skipConsent" integer, "enableEndSession" integer, "subjectType" text, "scopes" text, "clientCredentialsScopes" text, "userId" text references "user" ("id") on delete cascade, "createdAt" date, "updatedAt" date, "name" text, "uri" text, "icon" text, "contacts" text, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" text not null, "postLogoutRedirectUris" text, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" integer, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" text, "responseTypes" text, "requirePKCE" integer, "dpopBoundAccessTokens" integer, "referenceId" text, "metadata" text);
INSERT INTO oauthClient VALUES('omuwS5hcwxWQZFaeGpSlDGKwo4KxERJ6','claude',NULL,NULL,0,NULL,NULL,NULL,NULL,'[]',NULL,'2026-11-27T06:56:06.611Z','2026-11-27T06:56:06.611Z','Claude',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'["https://claude.ai/cb"]',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL);
CREATE TABLE IF NOT EXISTS "oauthResource" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" text, "customClaims" text, "dpopBoundAccessTokensRequired" integer, "disabled" integer, "createdAt" date, "updatedAt" date, "policyVersion" integer, "metadata" text);
INSERT INTO oauthResource VALUES('sK1fVtJlM70KUYroz4TIyyoSVJh3dQzb','https://inbox.test/api/v1','https://inbox.test/api/v1',NULL,NULL,NULL,NULL,NULL,'null',0,0,'2026-11-27T06:56:06.562Z','2026-11-27T06:56:06.562Z',1,'null');
INSERT INTO oauthResource VALUES('RBRv1GJEXKhxXmK3fipybwHzJrN5m7Aj','https://inbox.test/mcp','https://inbox.test/mcp',NULL,NULL,NULL,NULL,NULL,'null',0,0,'2026-11-27T06:56:06.566Z','2026-11-27T06:56:06.566Z',1,'null');
CREATE TABLE IF NOT EXISTS "oauthClientResource" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "resourceId" text not null references "oauthResource" ("identifier") on delete cascade, "metadata" text, "createdAt" date);
CREATE TABLE IF NOT EXISTS "oauthRefreshToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references "session" ("id") on delete set null, "userId" text not null references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" text, "requestedUserInfoClaims" text, "expiresAt" date not null, "createdAt" date not null, "revoked" date, "rotatedAt" date, "rotationReplayResponse" text, "rotationReplayExpiresAt" date, "authTime" date, "confirmation" text, "scopes" text not null);
CREATE TABLE IF NOT EXISTS "oauthAccessToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references "session" ("id") on delete set null, "userId" text references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" text, "requestedUserInfoClaims" text, "refreshId" text references "oauthRefreshToken" ("id") on delete cascade, "expiresAt" date not null, "createdAt" date not null, "revoked" date, "confirmation" text, "scopes" text not null);
CREATE TABLE IF NOT EXISTS "oauthConsent" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "userId" text references "user" ("id") on delete cascade, "referenceId" text, "resources" text, "requestedUserInfoClaims" text, "scopes" text not null, "createdAt" date not null, "updatedAt" date not null);
INSERT INTO oauthConsent VALUES('Ur4djvsIUuWbblJW2Z8RBAtedfzzctOS','claude','L16emyZQhVd9oag1jZgQyDTsuOXERXMX',NULL,NULL,NULL,'["openid"]','2026-11-27T06:56:06.611Z','2026-11-27T06:56:06.611Z');
CREATE TABLE IF NOT EXISTS "oauthClientAssertion" ("id" text not null primary key, "expiresAt" date not null);
CREATE TABLE IF NOT EXISTS "apikey" ("id" text not null primary key, "configId" text not null, "name" text, "start" text, "referenceId" text not null, "prefix" text, "key" text not null, "refillInterval" integer, "refillAmount" integer, "lastRefillAt" date, "enabled" integer, "rateLimitEnabled" integer, "rateLimitTimeWindow" integer, "rateLimitMax" integer, "requestCount" integer, "remaining" integer, "lastRequest" date, "expiresAt" date, "createdAt" date not null, "updatedAt" date not null, "permissions" text, "metadata" text);
INSERT INTO apikey VALUES('isWRWeYI962DxhbtVFUhqh02x8EdsUWI','default','backup','nbx_RM','L16emyZQhVd9oag1jZgQyDTsuOXERXMX','nbx_','TtOOJA7rj5CLy4O0dwj6acpC5XIimTHFu-Jdzwpnc20',NULL,NULL,NULL,1,0,86400000,10,0,NULL,NULL,NULL,'2026-11-27T06:56:06.605Z','2026-11-27T06:56:06.605Z','{"inbox":["read","write"]}','null');
INSERT INTO apikey VALUES('cnFetEsK00v6I9EUW8BHUBnqFYNIEJKC','default','reader','nbx_yu','L16emyZQhVd9oag1jZgQyDTsuOXERXMX','nbx_','DTBpWDv5nPVeCoeY4eMr4vEgJpOvb1y_5idOIAJWZlA',NULL,NULL,NULL,1,0,86400000,10,0,NULL,NULL,NULL,'2026-11-27T06:56:06.610Z','2026-11-27T06:56:06.610Z','{"inbox":["read"]}','null');
CREATE INDEX "session_userId_idx" on "session" ("userId");
CREATE INDEX "account_userId_idx" on "account" ("userId");
CREATE INDEX "verification_identifier_idx" on "verification" ("identifier");
CREATE INDEX "oauthClient_userId_idx" on "oauthClient" ("userId");
CREATE INDEX "oauthClientResource_clientId_idx" on "oauthClientResource" ("clientId");
CREATE INDEX "oauthClientResource_resourceId_idx" on "oauthClientResource" ("resourceId");
CREATE INDEX "oauthRefreshToken_clientId_idx" on "oauthRefreshToken" ("clientId");
CREATE INDEX "oauthRefreshToken_sessionId_idx" on "oauthRefreshToken" ("sessionId");
CREATE INDEX "oauthRefreshToken_userId_idx" on "oauthRefreshToken" ("userId");
CREATE INDEX "oauthRefreshToken_authorizationCodeId_idx" on "oauthRefreshToken" ("authorizationCodeId");
CREATE INDEX "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");
CREATE INDEX "oauthAccessToken_sessionId_idx" on "oauthAccessToken" ("sessionId");
CREATE INDEX "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");
CREATE INDEX "oauthAccessToken_authorizationCodeId_idx" on "oauthAccessToken" ("authorizationCodeId");
CREATE INDEX "oauthAccessToken_refreshId_idx" on "oauthAccessToken" ("refreshId");
CREATE INDEX "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");
CREATE INDEX "oauthConsent_userId_idx" on "oauthConsent" ("userId");
CREATE INDEX "apikey_configId_idx" on "apikey" ("configId");
CREATE INDEX "apikey_referenceId_idx" on "apikey" ("referenceId");
CREATE INDEX "apikey_key_idx" on "apikey" ("key");
CREATE UNIQUE INDEX "oauthClientResource_clientId_resourceId_uidx" on "oauthClientResource" ("clientId", "resourceId");
COMMIT;
