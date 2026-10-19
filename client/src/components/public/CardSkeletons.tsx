import React from 'react';

/**
 * Placeholder cards in the shape of a list that is still loading, so the page keeps roughly its
 * final height and nothing below it jumps when the data arrives. Pass the list's own grid classes
 * and a card height.
 */
export const CardSkeletons: React.FC<{ label: string; count: number; className: string; cardClassName: string }> = ({ label, count, className, cardClassName }) => (
  <div className={className} role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} aria-hidden="true" className={`neu-pressed-sm animate-pulse ${cardClassName}`} />
    ))}
  </div>
);
