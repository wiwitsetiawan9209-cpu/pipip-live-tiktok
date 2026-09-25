# Privacy Policy — Pipip Live TikTok

**Effective date:** [INSERT EFFECTIVE DATE]  
**Operator / data controller:** [INSERT LEGAL OPERATOR NAME]  
**Address:** [INSERT BUSINESS ADDRESS OR REGISTERED LOCATION]  
**Privacy contact:** [INSERT PRIVACY CONTACT EMAIL]

> **Draft completion required:** Confirm the responsible operator, privacy contact, applicable age threshold, jurisdiction, lawful bases where required, and final retention/deletion process before publication.

## 1. Who is responsible

Pipip Live TikTok is operated by the legal operator identified above.

## 2. What this policy covers

This policy describes the Pipip desktop application and its static legal website. Pipip is designed as a local AI live-commerce host assistant. The current project does not implement camera capture, webcam access, microphone recording, or storage of user recordings. Speech synthesis creates output audio files; it is not a recording of the user.

## 3. Information processed

- **TikTok authorization/profile:** When configured and authorized, the application processes the TikTok Open ID, display name, avatar URL, granted scopes, connection identifiers, and connection/validation times. It requests basic profile fields only under the granted `user.info.basic` scope.
- **Authorization data:** OAuth authorization code, state, and PKCE verifier are handled temporarily by the desktop main process. Access and refresh tokens and related account fields are stored in an encrypted local credential file when OS secure storage is available.
- **Product catalog:** Product names, category, description, price/currency, stock, variants, benefits, specifications, images/references, and other operator-entered sales metadata are stored in the local SQLite database.
- **Audience and host text:** Text entered as an audience comment may be held temporarily in the local queue and conversation context and included in a host-generation prompt. The current TikTok integration does not read TikTok LIVE comments. Audience learning labels and routing metadata are held in application memory; event logs may include operational metadata. Generated host responses and related event records may be stored locally.
- **Diagnostics and settings:** The application stores local session/event records, product data, settings, operational statuses, and selected diagnostics. Logs are written to the local application database; the project has no configured central analytics service.
- **Speech output:** Text submitted for TTS is processed by the locally installed Windows OneCore/SAPI speech provider in the current configuration. Generated WAV files may be cached in the local application-data folder, subject to the configured cache limit (up to 200 entries).

## 4. How processing works and disclosures

The current host-generation configuration sends prompts to an Ollama service running locally on the operator's computer. Prompts can include operator instructions, local product facts, and audience text entered into Pipip. If the operator changes the endpoint to a hosted service, those prompt contents may leave the device and that provider's terms/privacy practices apply.

Optional Google Gemini and OpenAI knowledge-advisor integrations are present in the project but disabled in the current configuration. If enabled and configured, relevant knowledge queries may be sent to the selected provider. TikTok data is sent to TikTok's official OAuth and user-info endpoints only when an operator configures and a user authorizes that connection. Pipip does not currently send audience comments, product catalog data, or generated audio to TikTok.

The static legal pages contain no analytics, tracking scripts, or external JavaScript. The chosen static hosting provider may process standard web request information under its own policies.

## 5. TikTok features and limits

The project implements an optional desktop OAuth/Login Kit flow, PKCE, token refresh, secure local token storage, and basic profile lookup. Configuration, TikTok app approval, scopes, and user authorization are required; none should be assumed from the presence of source code. TikTok LIVE control, LIVE comments, Shop/Showcase, affiliate access, product sync, product pinning, and checkout are not verified or available in the current implementation.

## 6. Local storage, retention, and deletion

Products, sessions, event/log records, settings, and generated speech cache files are stored on the user's device in the application's data locations. The project does not implement a general retention schedule or in-app deletion workflow for the local database. Unless the operator configures otherwise, local records remain until the user removes the applicable application data. The operator should document the exact platform-specific folder and provide a safe deletion procedure before release.

Disconnecting TikTok clears the application's stored TikTok credentials and in-memory account/profile state. It does not delete products, session/event logs, or speech-cache files, and it does not itself revoke tokens remotely. You may also use TikTok's account security controls to manage app authorization.

## 7. Security

TikTok tokens are encrypted through the operating system's secure-storage facility before local file storage; the connector refuses token writes when secure storage is unavailable. Credential handling and TikTok API calls are in the Electron main process, while the renderer receives limited account/status data through preload IPC. Local database and speech-cache files remain subject to the security of the user's device and account. No method of storage or transmission is guaranteed to be completely secure.

## 8. Rights and choices

Depending on applicable law, you may have rights to access, correct, delete, restrict, object to, or receive a copy of personal information, and to withdraw consent or complain to a regulator. Because much Pipip data is stored locally, requests may require access to the device or help from the operator. Contact **[INSERT PRIVACY CONTACT EMAIL]**. The operator must identify the applicable legal bases, response deadlines, and regulator/contact process for its jurisdiction before publication.

## 9. Children

Pipip is not designed for children. The operator must set the applicable minimum age as **[INSERT MINIMUM AGE FOR YOUR JURISDICTION]** and implement any legally required protections before public release. Do not submit a child's personal information through Pipip. If you believe a child has provided personal information, contact the privacy address above.

## 10. Policy changes

Material changes will be reflected on this page with a revised effective date. The operator should provide additional notice where required by law.

## 11. Contact

Privacy questions and requests: **[INSERT PRIVACY CONTACT EMAIL]**.
