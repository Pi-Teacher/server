import React from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description }) => (
  <header className="border-b border-outline-variant/30 bg-surface-container-lowest px-6 py-6 sm:px-8">
    {eyebrow && <p className="font-mono text-label-sm uppercase tracking-widest text-primary">{eyebrow}</p>}
    <h1 className="mt-1 text-headline-md text-on-surface">{title}</h1>
    <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">{description}</p>
  </header>
);
