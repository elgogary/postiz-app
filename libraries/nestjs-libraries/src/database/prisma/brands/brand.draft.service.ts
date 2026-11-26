// >>> SANAD-BRANDS: the AI first draft (spec rule 7). DeepSeek through the OpenAI SDK, the same OPENAI_API_KEY and
// OPENAI_BASE_URL the fork already uses; model BRANDS_AI_MODEL, else AGENT_AI_MODEL, else deepseek-chat. Any failure
// (no key, network, timeout, an answer that is not the JSON asked for) returns null and Plan it continues without a draft.
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { Draft, DraftInput, draftPrompt, parseDraft } from '@gitroom/helpers/brands/idea.rules';

@Injectable()
export class BrandDraftService {
  private readonly _log = new Logger('BrandDraftService');

  async write(input: DraftInput): Promise<Draft | null> {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'sk-proj-') return null;
    const { system, user } = draftPrompt(input);
    try {
      const client = new OpenAI({ apiKey: key, timeout: 25000, maxRetries: 0 });
      const res = await client.chat.completions.create({
        model: process.env.BRANDS_AI_MODEL || process.env.AGENT_AI_MODEL || 'deepseek-chat',
        temperature: 0.7,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      });
      const draft = parseDraft(res.choices?.[0]?.message?.content || '');
      if (!draft) this._log.warn('The AI answer was not the JSON asked for');
      return draft;
    } catch (e) {
      this._log.warn(`The AI first draft failed: ${(e as Error).message}`);
      return null;
    }
  }
}
// <<< SANAD-BRANDS
