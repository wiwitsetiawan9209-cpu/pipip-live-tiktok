import {createHash,randomBytes} from 'node:crypto';
export function createPkce(){const verifier=randomBytes(48).toString('base64url');if(verifier.length<43||verifier.length>128)throw new Error('PKCE verifier generation failed');const challenge=createHash('sha256').update(verifier,'ascii').digest('hex');return{verifier,challenge,method:'S256' as const}}
