import React from 'react';

// PLACEHOLDER(v2.1 phase 2): Privacy policy, terms of service, and refund & cancellation policy.
export const LegalPage: React.FC<{ kind: 'privacy' | 'terms' | 'refunds' }> = () => (
  <section className="max-w-3xl mx-auto my-24 px-6 text-center text-slate-400">Privacy policy, terms of service, and refund & cancellation policy.</section>
);
