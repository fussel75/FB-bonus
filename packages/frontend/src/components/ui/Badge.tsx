type BadgeVariant = 'bonus' | 'malus' | 'grenz' | 'info' | 'neutral';

interface BadgeProps {
  variant?:  BadgeVariant;
  children:  React.ReactNode;
  className?: string;
  dot?:       boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  bonus:   'bg-bonus-100 text-bonus-700',
  malus:   'bg-malus-100 text-malus-700',
  grenz:   'bg-grenz-100 text-grenz-700',
  info:    'bg-info-100  text-info-700',
  neutral: 'bg-gray-100  text-gray-600',
};

const dotClasses: Record<BadgeVariant, string> = {
  bonus:   'bg-bonus-500',
  malus:   'bg-malus-500',
  grenz:   'bg-grenz-500',
  info:    'bg-info-500',
  neutral: 'bg-gray-400',
};

export function Badge({ variant = 'neutral', children, className = '', dot = false }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {dot && (
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClasses[variant]}`} />
      )}
      {children}
    </span>
  );
}
