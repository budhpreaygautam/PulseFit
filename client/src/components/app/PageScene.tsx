import React from 'react';
import { AppArt } from './AppArt.js';
import { PAGE_TABS } from '../../lib/appArt.js';
import { isAppMode } from '../../lib/appMode.js';

/**
 * A page's scene, placed by the page inside its own content (app mode only; nothing on the website):
 * `beside` floats right of the heading, intro or address that follows it, so only text and boxes that
 * keep clear of floats (flex, grid, buttons) may come after it in its block; `in-card` and
 * `between-sections` are a centred row inside a card or between two sections. Hidden on a short
 * (landscape) screen by CSS.
 */
export const PageScene: React.FC<{ tab: string; placement: 'beside' | 'in-card' | 'between-sections' }> = ({ tab, placement }) =>
  isAppMode && PAGE_TABS.includes(tab) ? (
    <div className={`page-scene page-scene-${placement}`} data-page-scene={tab}>
      <AppArt scene={`page.${tab}`} size="page" />
    </div>
  ) : null;
