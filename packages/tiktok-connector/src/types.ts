export type TikTokConnectionState='DISCONNECTED'|'AUTHORIZING'|'CONNECTED'|'REFRESHING'|'REAUTH_REQUIRED'|'PERMISSION_LIMITED'|'ERROR'|'DISCONNECTING';
export type PermissionState='APP_NOT_APPROVED'|'USER_NOT_AUTHORIZED'|'AUTHORIZED'|'PARTIALLY_AUTHORIZED'|'REAUTH_REQUIRED'|'UNKNOWN';
export type CapabilityStatus='AVAILABLE'|'NOT_AUTHORIZED'|'NOT_APPROVED'|'NOT_SUPPORTED'|'NOT_VERIFIED'|'UNKNOWN'|'ERROR';
export type TikTokErrorCode='NETWORK_ERROR'|'TIMEOUT'|'RATE_LIMITED'|'UNAUTHORIZED'|'FORBIDDEN'|'INVALID_REQUEST'|'NOT_APPROVED'|'NOT_SUPPORTED'|'INVALID_RESPONSE'|'TOKEN_EXPIRED'|'TOKEN_REFRESH_FAILED'|'STATE_MISMATCH'|'PKCE_ERROR'|'USER_CANCELLED'|'UNKNOWN';
export interface TikTokConnectorConfig {clientKey:string|null;clientSecret:string|null;redirectUri:string|null;scopes:string[];authorizationTimeoutMs:number;requestTimeoutMs:number}
export interface TikTokAccount {connectionId:string;openId:string;displayName:string|null;avatarUrl:string|null;scopes:string[];connectedAt:number;lastValidatedAt:number}
export interface TikTokCapability {status:CapabilityStatus;reason:string}
export type TikTokCapabilityKey='TIKTOK_LOGIN'|'BASIC_PROFILE'|'DISPLAY_API'|'CREATOR_AUTHORIZATION'|'SHOWCASE_PRODUCTS'|'LIVE_PRODUCT_ACCESS'|'AFFILIATE_PRODUCT_ACCESS';
export interface CreatorCapabilities {accountConnected:boolean;basicProfileAvailable:TikTokCapability;creatorAuthorizationAvailable:TikTokCapability;showcaseAvailable:TikTokCapability;liveProductAccessAvailable:TikTokCapability;affiliateProductAccessAvailable:TikTokCapability}
export type TikTokSyncStatus='NOT_CONFIGURED'|'READY'|'SYNCING'|'SYNCED'|'PARTIAL'|'PERMISSION_LIMITED'|'FAILED'|'STALE'|'NOT_VERIFIED';
export interface TikTokProductMapping {localProductId:string;platform:'tiktok';platformProductId:string;showcasePosition:number|null;productUrl:string|null;commerceType:'UNKNOWN'|'SHOP'|'AFFILIATE'|'LIVE';lastSyncedAt:number|null;syncStatus:TikTokSyncStatus}
export interface TikTokConnectorStatus {state:TikTokConnectionState;configured:boolean;secureStorageAvailable:boolean;account:TikTokAccount|null;requestedScopes:string[];grantedScopes:string[];missingScopes:string[];permissionState:PermissionState;capabilities:Record<TikTokCapabilityKey,TikTokCapability>;syncStatus:TikTokSyncStatus;lastSyncAt:number|null;lastSuccessAt:number|null;lastFailureAt:number|null;itemsSynced:number;itemsSkipped:number;errorCount:number;lastErrorCode:TikTokErrorCode|null;qrAuthorization:'QR_AUTH_UNAVAILABLE'}
export interface TikTokError {code:TikTokErrorCode;message:string;recoverable:boolean;retryAfterMs?:number;source:string}
export interface StoredTikTokCredentials {connectionId:string;accessToken:string;refreshToken:string;accessExpiresAt:number;refreshExpiresAt:number;openId:string;grantedScopes:string[];connectedAt:number;displayName:string|null;avatarUrl:string|null}
export interface CredentialStore {read():Promise<StoredTikTokCredentials|null>;write(credentials:StoredTikTokCredentials):Promise<void>;clear():Promise<void>;isAvailable():boolean}
export interface TikTokAuthorizationCallback {code?:string;state:string;scopes:string[];error?:string}
export interface AuthorizationState {state:string;verifier:string;challenge:string;redirectUri:string;requestedScopes:string[];createdAt:number;expiresAt:number;consumed:boolean}
export interface TokenResponse {access_token:string;expires_in:number;open_id:string;refresh_token:string;refresh_expires_in:number;scope:string;token_type:'Bearer'}
export interface UserProfile {open_id:string;display_name?:string;avatar_url?:string}
