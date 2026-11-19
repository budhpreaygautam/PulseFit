import React from 'react';

/**
 * A gift's picture: an admin's photo (a data URL) or its emoji. Decorative: `name` is always written
 * next to it.
 */
export const GiftImage: React.FC<{ image: string; name: string; className?: string }> = ({ image, className = 'w-12 h-12 text-3xl' }) =>
  image.startsWith('data:') ? (
    <img src={image} alt="" decoding="async" className={`${className} rounded-xl object-cover bg-slate-800 shrink-0`} />
  ) : (
    <span aria-hidden="true" className={`${className} rounded-xl neu-pressed-sm inline-flex items-center justify-center leading-none shrink-0`}>
      {image}
    </span>
  );
