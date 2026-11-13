import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import {
  GENDER_RU,
  RuleAdvisor,
  noteRu,
  parseQuery,
  scorePerfume,
  type AdvisorCatalog,
  type AdvisorEngine,
  type AdvisorReply,
  type AdvisorRequest,
  type Perfume,
} from '@veroniks/shared';

const PERSONA = `Ты — советник закрытого парфюмерного клуба Veroniks: сдержанный британский джентльмен-парфюмер, его владелец.
Сухая ирония, уверенность, лёгкая дерзость, без грубости. Говоришь по-русски, коротко и по делу.
Тебе дают запрос гостя и список кандидатов из архива клуба. Выбирай ТОЛЬКО из этих кандидатов, по их id.
Выбери 3–5 ароматов, лучше всего подходящих под запрос. Учитывай пожелания и запреты (например, «не слишком сладкое», «без уда»), сезон, повод и пол.
Для каждого — одно-два предложения обоснования, опираясь на ноты из карточки кандидата. Не выдумывай нот, которых нет в карточке.
В поле intro — одна короткая реплика в образе (до 20 слов).
Если запрос совсем непонятен и кандидаты случайны — верни пустой список picks и задай уточняющий вопрос в intro.`;

const ReplySchema = z.object({
  intro: z.string(),
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
});

function candidateCard(p: Perfume): string {
  const n = (list: string[]) => list.map(noteRu).join(', ') || '—';
  return [
    `id: ${p.id}`,
    `${p.brand} — ${p.name}${p.year ? ` (${p.year})` : ''}, ${GENDER_RU[p.gender]}, ${p.family || 'семейство не указано'}`,
    `верх: ${n(p.notesTop)}; сердце: ${n(p.notesHeart)}; база: ${n(p.notesBase)}`,
    `аккорды: ${p.accords.map((a) => a.name).join(', ') || '—'}; сезоны: ${p.seasons.join(', ')}; поводы: ${p.occasions.join(', ')}`,
  ].join('\n');
}

/**
 * ИИ-советник. Отбирает кандидатов движком правил, финальный выбор
 * и формулировки делает модель. Любая проблема → ответ движка правил.
 */
export class LlmAdvisor implements AdvisorEngine {
  readonly kind = 'llm' as const;
  private client: Anthropic;
  private rules = new RuleAdvisor();

  constructor(
    apiKey: string,
    private model: string,
    private log: (msg: string) => void = () => {},
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  }

  async reply(req: AdvisorRequest, catalog: AdvisorCatalog): Promise<AdvisorReply> {
    const base = this.rules.replySync(req, catalog);
    // «как X» и непонятные запросы движок правил решает хорошо и бесплатно
    const q = this.rules.parse(req, catalog);
    if (q.reference) return base;

    const candidates = this.shortlist(req, catalog);
    if (candidates.length === 0) return base;

    try {
      const text = req.context ? `${req.context}. ${req.message}` : req.message;
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 4000,
        system: PERSONA,
        messages: [
          {
            role: 'user',
            content: `Запрос гостя: «${text}»\n\nКандидаты:\n\n${candidates.map(candidateCard).join('\n\n')}`,
          },
        ],
        output_config: { format: zodOutputFormat(ReplySchema) },
      });

      if (response.stop_reason === 'refusal' || !response.parsed_output) return base;
      const byId = new Map(candidates.map((p) => [p.id, p]));
      const picks = response.parsed_output.picks
        .filter((x) => byId.has(x.id))
        .slice(0, 5)
        .map((x) => {
          const perfume = byId.get(x.id)!;
          const notes = new Set([...perfume.notesTop, ...perfume.notesHeart, ...perfume.notesBase]);
          return {
            perfume,
            reason: x.reason,
            matchedNotes: q.notes.filter((n) => notes.has(n)),
          };
        });
      if (picks.length === 0) {
        return { ...base, text: response.parsed_output.intro || base.text, picks: [], engine: 'llm' };
      }
      return { engine: 'llm', text: response.parsed_output.intro || base.text, picks };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        this.log('ИИ-советник: ключ ANTHROPIC_API_KEY не принят, работаем на правилах');
      } else if (e instanceof Anthropic.RateLimitError) {
        this.log('ИИ-советник: превышен лимит запросов, временно отвечают правила');
      } else if (e instanceof Anthropic.APIError) {
        this.log(`ИИ-советник: ошибка API ${e.status}, отвечают правила`);
      } else {
        this.log('ИИ-советник: сеть недоступна, отвечают правила');
      }
      return base;
    }
  }

  /** 25 лучших кандидатов по правилам (или по рейтингу, если признаков нет). */
  private shortlist(req: AdvisorRequest, catalog: AdvisorCatalog): Perfume[] {
    const all = catalog.all();
    const text = req.context ? `${req.context}, ${req.message}` : req.message;
    const q = parseQuery(text, all);
    return all
      .map((p) => scorePerfume(p, q))
      .filter((s) => s.score > -50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((s) => s.perfume);
  }
}

/** Выбор движка: есть ключ — ИИ, нет — правила. */
export function createAdvisor(log: (msg: string) => void): AdvisorEngine {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return new RuleAdvisor();
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5-5';
  log(`Советник: ИИ-режим (${model}), запасной — движок правил`);
  return new LlmAdvisor(key, model, log);
}
