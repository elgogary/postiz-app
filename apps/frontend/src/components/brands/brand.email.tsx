'use client';
// >>> SANAD-BRANDS: a brand's Email tab. Prototype: docs/prototypes/postiz/email-tab. Campaigns (the brand's unsent
// email posts first, then the Listmonk campaigns), one campaign, Lists and a list's contacts ride the URL params
// filter and focus. An email starts from New post with the brand's email channel, so there is no New email button here.
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { BrandRole } from '@gitroom/helpers/brands/brand.rules';
import type { EmailCampaignRow, EmailOverview } from '@gitroom/helpers/brands/email.rules';
import { STATE_LABEL } from '@gitroom/helpers/brands/post.rules';
import { BrandPosts, errorText, useBrandsApi } from './brands.api';
import { BrandEmailReport } from './brand.email.report';
import { BrandEmailLists } from './brand.email.lists';
import {
  Chip, EmailGo, EmailSwitch, fmtAt, NUM, RateCell, Retry, Skeleton, StateChip, TD, TH, TONE, Text,
} from './brand.email.ui';

const POST_TONE: Record<string, string> = { review: TONE.purple, changes: TONE.amber, scheduled: TONE.green, draft: TONE.grey, error: TONE.amber };
const STARTED = ['sent', 'sending', 'paused', 'cancelled'];

export const BrandEmail: FC<{
  brandId: string; brandName: string; role: BrandRole; posts: BrandPosts | null; filter: string; focus: string; go: EmailGo;
}> = ({ brandId, brandName, role, posts, filter, focus, go }) => {
  const t = useT();
  const api = useBrandsApi();
  const [data, setData] = useState<EmailOverview | null>(null);
  const [error, setError] = useState('');
  // Only the newest read may set state: an answer for a brand left behind is dropped.
  const seq = useRef(0);
  const tt = useRef(t);
  tt.current = t;

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError('');
    try {
      const d = await api.email(brandId);
      if (mine === seq.current) setData(d);
    } catch (e) {
      if (mine === seq.current) setError(errorText(e, tt.current));
    }
  }, [api, brandId]);

  useEffect(() => { setData(null); load(); return () => { seq.current += 1; }; }, [load]);

  // A deep link to a campaign shows its own report at once; it does not wait for the overview.
  const [kind, channelId, rawId] = focus.split(':');
  if (kind === 'c' && channelId && +rawId) {
    return <BrandEmailReport brandId={brandId} channelId={channelId} campaignId={+rawId} go={go} />;
  }
  if (error && !data) return <Retry text={error} onRetry={load} />;
  if (!data) return <Skeleton />;

  const names = new Set(data.channels.map((c) => c.name));
  const unsent = (posts?.cards || []).filter((c) => names.has(c.channel) && c.state !== 'published' && c.state !== 'planned');
  const total = unsent.length + data.campaigns.length;

  if (filter === 'lists' || kind === 'l') {
    return <BrandEmailLists brandId={brandId} brandName={brandName} role={role} data={data} campaigns={total}
      list={kind === 'l' && channelId && +rawId ? { channelId, id: +rawId } : null} go={go} onChanged={load} />;
  }

  const open = (r: EmailCampaignRow) => STARTED.includes(r.state) && go({ tab: 'email', focus: `c:${r.channelId}:${r.id}` });
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-[16px] flex-wrap">
        <EmailSwitch on="campaigns" campaigns={total} lists={data.lists.length} go={go} />
      </div>
      {data.failed.length > 0 && (
        <Retry text={`${t('email_read_failed', 'Could not read the email numbers of')} ${data.failed.join(', ')}.`} onRetry={load} />
      )}
      {total === 0 && data.failed.length === 0 ? (
        <div className="text-[14px] text-customColor18">{t('email_none_yet', 'No email sent yet. An email starts from New post with the brand\'s email channel.')}</div>
      ) : (
        <div className="overflow-x-auto border border-fifth rounded-[12px]">
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[14px]">
            <thead>
              <tr>
                <th className={TH}>{t('email_campaign', 'Campaign')}</th>
                <th className={`${TH} w-[96px]`}>{t('email_status', 'Status')}</th>
                <th className={`${TH} w-[184px]`}>{t('email_date', 'Date')}</th>
                {[['email_sent_to', 'Sent to'], ['email_opened', 'Opened'], ['email_clicked', 'Clicked'], ['email_unsubscribed', 'Unsubscribed']].map(([k, l]) => (
                  <th key={k} className={`${TH} ${NUM} w-[112px]`}>{t(k, l)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unsent.map((c) => (
                <tr key={c.key} onClick={() => go({ tab: 'posts', focus: c.key })} className="cursor-pointer hover:bg-sixth">
                  <td className={TD}>
                    <button className="text-start block" onClick={(e) => { e.stopPropagation(); go({ tab: 'posts', focus: c.key }); }}>
                      <span className="block font-[600]"><Text text={c.title || c.caption.slice(0, 80)} /></span>
                      {c.sub && <span className="block text-[12px] text-customColor18"><Text text={c.sub} /></span>}
                    </button>
                  </td>
                  <td className={TD}><Chip tone={POST_TONE[c.state] || TONE.grey}>{t(`state_${c.state}`, STATE_LABEL[c.state])}</Chip></td>
                  <td className={TD}>{fmtAt(c.date)}</td>
                  <td className={TD} colSpan={4} />
                </tr>
              ))}
              {data.campaigns.map((r) => (
                <tr key={`${r.channelId}:${r.id}`} onClick={() => open(r)} className={STARTED.includes(r.state) ? 'cursor-pointer hover:bg-sixth' : ''}>
                  <td className={TD}>
                    {STARTED.includes(r.state) ? (
                      <button className="text-start block" onClick={(e) => { e.stopPropagation(); open(r); }}>
                        <span className="block font-[600]"><Text text={r.name} /></span>
                        {r.subject !== r.name && <span className="block text-[12px] text-customColor18"><Text text={r.subject} /></span>}
                      </button>
                    ) : (
                      <>
                        <span className="block font-[600]"><Text text={r.name} /></span>
                        {r.subject !== r.name && <span className="block text-[12px] text-customColor18"><Text text={r.subject} /></span>}
                      </>
                    )}
                  </td>
                  <td className={TD}><StateChip state={r.state} /></td>
                  <td className={TD}>{fmtAt(r.at)}</td>
                  <td className={`${TD} ${NUM}`}>{r.sentTo > 0 ? r.sentTo : ''}</td>
                  <RateCell r={r.opened} /><RateCell r={r.clicked} /><RateCell r={r.unsubscribed} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
// <<< SANAD-BRANDS
