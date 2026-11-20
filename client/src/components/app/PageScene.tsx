import React from 'react';
import { AppArt } from './AppArt.js';
import { PAGE_TABS } from '../../lib/appArt.js';

/** Pages whose first screen has no room for the full strip (only a page that fails e2e/app-art-pages.spec.ts). */
const COMPACT_TABS = new Set<string>([]);

/** The scene of a page, in a strip above its content; hidden on a short (landscape) screen by CSS. */
export const PageScene: React.FC<{ tab: string }> = ({ tab }) =>
  PAGE_TABS.includes(tab) ? (
    <div className={`page-scene${COMPACT_TABS.has(tab) ? ' page-scene-compact' : ''}`} data-page-scene={tab}>
      <AppArt scene={`page.${tab}`} size="page" />
    </div>
  ) : null;
