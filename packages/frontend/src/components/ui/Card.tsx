import React from 'react';

interface CardProps {
  children:  React.ReactNode;
  className?: string;
  padding?:  'none' | 'sm' | 'md' | 'lg';
  onClick?:  () => void;
}

const paddingClasses = {
  none: '',
  sm:   'p-3',
  md:   'p-4 sm:p-5',
  lg:   'p-5 sm:p-6',
};

export function Card({ children, className = '', padding = 'md', onClick }: CardProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-xl border border-gray-100 shadow-card',
        paddingClasses[padding],
        interactive ? 'cursor-pointer hover:shadow-lift transition-shadow duration-250' : '',
        'animate-fadeIn',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

// ── Card-Header-Hilfselemente ──────────────────────────────────────────────

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-sm font-semibold text-gray-500 uppercase tracking-wide ${className}`}>
      {children}
    </h3>
  );
}
