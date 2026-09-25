import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const legalDir = fileURLToPath(new URL('../docs/legal/', import.meta.url));
const read = (name: string) => readFileSync(resolve(legalDir, name), 'utf8');
const publicHtml = ['../index.html', 'index.html', 'terms.html', 'privacy.html'];

describe('Pipip public legal pages', () => {
  it('has accessible English pages and visible navigation between legal documents', () => {
    for (const name of publicHtml) {
      const html = read(name);
      expect(html).toMatch(/<html lang="en">/i);
      expect(html).toMatch(/<meta name="viewport"/i);
      expect(html).toMatch(/<title>[^<]+<\/title>/i);
      expect(html).toMatch(/<main[\s>]/i);
      expect(html).toMatch(/<nav[^>]+aria-label=/i);
      expect(html).toMatch(/Pipip Live TikTok/);
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/<(?:iframe|img|video|audio)\b/i);
      expect(html).not.toMatch(/localhost|127\.0\.0\.1|0\.0\.0\.0/i);
      expect(html).not.toMatch(/https?:\/\/(?:example\.(?:com|org|net)|fake\.[^\s"']+)/i);
    }
    expect(read('../index.html')).toMatch(/href="legal\/terms\.html"[^>]*>Terms of Service</i);
    expect(read('../index.html')).toMatch(/href="legal\/privacy\.html"[^>]*>Privacy Policy</i);
    expect(read('index.html')).toMatch(/href="terms\.html"[^>]*>Terms of Service</i);
    expect(read('index.html')).toMatch(/href="privacy\.html"[^>]*>Privacy Policy</i);
    expect(read('terms.html')).toMatch(/href="privacy\.html"[^>]*>Privacy Policy</i);
    expect(read('privacy.html')).toMatch(/href="terms\.html"[^>]*>Terms of Service</i);
  });

  it('resolves all relative HTML navigation links to committed files', () => {
    for (const name of publicHtml) {
      const html = read(name);
      const links = [...html.matchAll(/\b(?:href|src)="([^"]+)"/gi)].map(match => match[1]!);
      for (const link of links) {
        if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
        expect(existsSync(resolve(dirname(resolve(legalDir, name)), link))).toBe(true);
      }
    }
  });

  it('uses explicit owner placeholders and makes no unverified TikTok commerce claim', () => {
    const terms = read('terms.html');
    const privacy = read('privacy.html');
    for (const required of ['[INSERT LEGAL OPERATOR NAME]', '[INSERT OFFICIAL TERMS CONTACT EMAIL]', '[INSERT GOVERNING LAW AND JURISDICTION]', '[INSERT EFFECTIVE DATE]']) expect(terms).toContain(required);
    for (const required of ['[INSERT LEGAL OPERATOR / DATA CONTROLLER NAME]', '[INSERT PRIVACY CONTACT EMAIL]', '[INSERT MINIMUM AGE FOR YOUR JURISDICTION]', '[INSERT EFFECTIVE DATE]']) expect(privacy).toContain(required);
    for (const html of [terms, privacy]) {
      expect(html).not.toMatch(/TikTok (?:LIVE|Shop|Showcase|affiliate product) (?:control|access|sync|integration) (?:is|has been) (?:available|implemented|verified)/i);
      expect(html).not.toMatch(/(?:TIKTOK_CLIENT_SECRET|AI_API_KEY|GEMINI_API_KEY)\s*[:=]\s*\S+/i);
      expect(html).not.toMatch(/(?:Bearer\s+[A-Za-z0-9._-]{16,}|refresh_token\s*[:=]\s*[^\s<]+)/i);
    }
    expect(privacy).toMatch(/Ollama service running locally/i);
    expect(privacy).toMatch(/does not implement camera capture, webcam access, microphone recording/i);
    expect(privacy).toMatch(/does not read TikTok LIVE comments/i);
  });

  it('includes GitHub Pages publishing instructions and only placeholder project URLs', () => {
    const readme = read('README.md');
    expect(readme).toContain('YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY');
    expect(readme).toContain('Settings → Pages');
    expect(readme).toContain('/legal/terms.html');
    expect(readme).toContain('/legal/privacy.html');
    expect(readme).not.toMatch(/(?:localhost|127\.0\.0\.1|TIKTOK_CLIENT_SECRET\s*=)/i);
  });
});
