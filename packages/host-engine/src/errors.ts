export type HostErrorCode='AI_OFFLINE'|'MODEL_NOT_FOUND'|'AI_TIMEOUT'|'INVALID_AI_RESPONSE'|'AUTONOMY_OFF'|'COOLDOWN'|'AI_ERROR';
export class HostEngineError extends Error {
  constructor(readonly code:HostErrorCode,message:string=code.replaceAll('_',' ')){super(message);this.name='HostEngineError'}
}
export function classifyProviderError(error:unknown):HostEngineError {
  if(error instanceof HostEngineError)return error;
  const message=error instanceof Error?error.message:String(error);
  if(/model.*not found|model_not_found|pull model/i.test(message)||/HTTP 404/.test(message))return new HostEngineError('MODEL_NOT_FOUND');
  if(/timeout|timed out|aborterror|aborted/i.test(message))return new HostEngineError('AI_TIMEOUT');
  return new HostEngineError('AI_ERROR',message);
}
