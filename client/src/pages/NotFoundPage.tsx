import React from 'react';
import { Compass } from 'lucide-react';

export const NotFoundPage: React.FC<{ setCurrentTab: (tab: string) => void }> = ({ setCurrentTab }) => (
  <section className="max-w-lg mx-auto my-24 px-6 text-center">
    <div className="neu-flat-lg rounded-3xl p-10 border border-slate-800/80">
      <div className="mx-auto mb-5 w-14 h-14 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">
        <Compass className="w-6 h-6" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-black text-slate-100 font-['Outfit']">Page not found</h1>
      <p className="mt-3 text-sm text-slate-400">That link doesn't lead anywhere at PulseFit. It may have moved, or there may be a typo in the address.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => setCurrentTab('home')} className="neu-btn-lime text-black px-6 py-3 rounded-xl font-bold text-sm">
          Back to home
        </button>
        <button type="button" onClick={() => setCurrentTab('schedule')} className="neu-btn px-6 py-3 rounded-xl font-bold text-sm text-slate-200">
          See the timetable
        </button>
      </div>
    </div>
  </section>
);
