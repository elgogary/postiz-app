'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Seeded default profile for this instance; the last-entered URL (localStorage) overrides it.
const SEED_URL = 'https://www.linkedin.com/in/eslam-elgogary/';
const LS_URL = 'my_linkedin_url';
const LS_DATA = 'my_linkedin_last';

interface Post {
  text: string;
  url: string;
  date: string;
  likes: number;
  comments: number;
  shares: number;
}
interface Result {
  count: number;
  totals: { likes: number; comments: number; shares: number };
  posts: Post[];
}

export const MyLinkedin: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [url, setUrl] = useState(SEED_URL);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Result | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');

  const runAnalyze = useCallback(
    async (targetUrl: string) => {
      const clean = (targetUrl || '').trim();
      if (!clean) {
        toaster.show(
          t('enter_linkedin_url', 'Enter your LinkedIn profile URL'),
          'warning'
        );
        return;
      }
      setBusy(true);
      try {
        const res = await (
          await fetch('/engagement/my-analytics', {
            method: 'POST',
            body: JSON.stringify({ linkedinUrl: clean, maxPosts: 10 }),
          })
        ).json();
        if (res?.posts) {
          const stamp = new Date().toISOString();
          setData(res);
          setUpdatedAt(stamp);
          try {
            localStorage.setItem(LS_URL, clean);
            localStorage.setItem(
              LS_DATA,
              JSON.stringify({ result: res, updatedAt: stamp, url: clean })
            );
          } catch (e) {
            /* storage unavailable */
          }
        } else {
          toaster.show(
            t('could_not_fetch_posts', 'Could not fetch your posts'),
            'warning'
          );
        }
      } catch (e) {
        toaster.show(
          t('could_not_fetch_posts', 'Could not fetch your posts'),
          'warning'
        );
      }
      setBusy(false);
    },
    [fetch, t, toaster]
  );

  // On open: show the saved last pull instantly; if there is none, auto-pull the seeded profile once.
  useEffect(() => {
    let start = SEED_URL;
    try {
      const savedUrl = localStorage.getItem(LS_URL);
      if (savedUrl) {
        start = savedUrl;
      }
      const raw = localStorage.getItem(LS_DATA);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.result?.posts) {
          setUrl(parsed.url || start);
          setData(parsed.result);
          setUpdatedAt(parsed.updatedAt || '');
          return;
        }
      }
    } catch (e) {
      /* ignore */
    }
    setUrl(start);
    runAnalyze(start);
  }, [runAnalyze]);

  const stat = (label: string, value: number, color: string) => (
    <div className="flex-1 min-w-[140px] bg-sixth border border-fifth rounded-[4px] p-[16px] flex flex-col gap-[6px]">
      <div className="text-[12px] text-customColor18">{label}</div>
      <div className="text-[26px] font-[600]" style={{ color }}>
        {value.toLocaleString()}
      </div>
    </div>
  );

  const metric = (label: string, value: number) => (
    <div className="flex items-center gap-[6px] text-[12px]">
      <span className="text-customColor18">{label}</span>
      <span className="font-[600]">{value.toLocaleString()}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-[16px] p-[16px]">
      <div className="flex flex-col gap-[4px]">
        <div className="text-[20px] font-[600]">
          {t('my_linkedin', 'My LinkedIn')}
        </div>
        <div className="text-[13px] text-customColor18 max-w-[640px]">
          {t(
            'my_linkedin_desc',
            'Public engagement on your recent posts. LinkedIn does not expose impressions or reach for personal profiles, so those stay visible only on LinkedIn itself.'
          )}
        </div>
      </div>

      <div className="flex gap-[8px] items-center">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.linkedin.com/in/your-handle"
          className="flex-1 bg-input border border-fifth rounded-[4px] p-[10px] text-[14px] outline-none"
        />
        <Button onClick={() => runAnalyze(url)} disabled={busy}>
          {busy
            ? t('refreshing', 'Refreshing...')
            : data
            ? t('refresh', 'Refresh')
            : t('analyze', 'Analyze')}
        </Button>
      </div>

      {updatedAt && (
        <div className="text-[11px] text-customColor18">
          {t('last_updated', 'Last updated')}:{' '}
          {new Date(updatedAt).toLocaleString()}
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-[12px]">
          <div className="flex gap-[12px] flex-wrap">
            {stat(t('total_likes', 'Total likes'), data.totals.likes, '#0A66C2')}
            {stat(
              t('total_comments', 'Total comments'),
              data.totals.comments,
              '#378FE9'
            )}
            {stat(
              t('total_reposts', 'Total reposts'),
              data.totals.shares,
              '#612BD3'
            )}
          </div>
          <div className="text-[12px] text-customColor18">
            {t('based_on', 'Based on your')} {data.count}{' '}
            {t('recent_posts', 'most recent posts')}
          </div>
          <div className="flex flex-col gap-[8px]">
            {data.posts.map((p, i) => (
              <div
                key={i}
                className="bg-sixth border border-fifth rounded-[4px] p-[12px] flex flex-col gap-[8px]"
              >
                <div className="flex items-center gap-[10px]">
                  <div className="text-[11px] text-customColor18 flex-1">
                    {p.date ? new Date(p.date).toLocaleDateString() : ''}
                  </div>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#0A66C2]"
                    >
                      {t('view_post', 'View post')}
                    </a>
                  )}
                </div>
                <div className="text-[13px] whitespace-pre-wrap">{p.text}</div>
                <div className="flex gap-[16px]">
                  {metric(t('likes', 'Likes'), p.likes)}
                  {metric(t('comments', 'Comments'), p.comments)}
                  {metric(t('reposts', 'Reposts'), p.shares)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
