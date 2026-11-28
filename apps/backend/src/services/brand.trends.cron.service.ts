// >>> SANAD-BRANDS
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BrandTrendsService } from '@gitroom/nestjs-libraries/database/prisma/brands/trends/brand.trends.service';

const env = (k: string, d: string) => (process.env[k] && process.env[k]!.length > 0 ? process.env[k]! : d);

// Backend-only timer so the weekly trends run happens in exactly one process. Off unless BRAND_TRENDS_ENABLED=true.
@Injectable()
export class BrandTrendsCronService {
  private readonly _logger = new Logger('BrandTrendsCron');

  constructor(private _trends: BrandTrendsService) {}

  @Cron(env('BRAND_TRENDS_CRON', '0 6 * * 0'), { timeZone: env('BRAND_TRENDS_TZ', 'Asia/Riyadh') })
  async handle() {
    if (process.env.BRAND_TRENDS_ENABLED !== 'true') return;
    try {
      const res = await this._trends.run();
      const done = res.filter((r) => !r.skipped);
      this._logger.log(`trends: ${done.length} brands done, ${done.reduce((n, r) => n + r.trends, 0)} trends saved, ${res.length - done.length} skipped`);
    } catch (e) {
      this._logger.error(`trends failed: ${(e as Error)?.message}`);
    }
  }
}
// <<< SANAD-BRANDS
