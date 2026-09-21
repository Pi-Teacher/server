import React from 'react';
import { PageHeader } from './PageHeader';

interface PlaceholderPageProps {
  title: string;
  description: string;
  phase: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, description, phase }) => (
  <div className="min-h-full bg-surface">
    <PageHeader eyebrow={phase} title={title} description={description} />
    <main className="p-6 sm:p-8">
      <section className="mx-auto max-w-3xl rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-8 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary">
            <span className="material-symbols-outlined">construction</span>
          </div>
          <div>
            <h2 className="text-headline-sm text-on-surface">路由与应用壳层已就绪</h2>
            <p className="mt-2 text-body-md text-on-surface-variant">
              当前占位页用于确认导航、认证守卫和响应式布局正常工作.
            </p>
          </div>
        </div>
      </section>
    </main>
  </div>
);
