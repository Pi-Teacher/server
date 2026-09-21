import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => (
  <main className="flex min-h-screen items-center justify-center bg-surface p-6">
    <section className="max-w-md rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-8 text-center shadow-card">
      <p className="font-mono text-label-md text-primary">404</p>
      <h1 className="mt-2 text-headline-md text-on-surface">页面不存在</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">当前地址不是 Pi Teacher 已注册的前端路由.</p>
      <Link to="/review" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-container">
        返回复习页
      </Link>
    </section>
  </main>
);
