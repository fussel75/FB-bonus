/**
 * YearPicker — Jahres-Selektor
 *
 * Zeigt einen kompakten Dropdown von firstYear bis currentYear.
 * Hebt das laufende Jahr optisch hervor.
 */

interface YearPickerProps {
  value:     number;
  onChange:  (year: number) => void;
  firstYear?: number;
  className?: string;
}

export function YearPicker({ value, onChange, firstYear = 2025, className = '' }: YearPickerProps) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= firstYear; y--) {
    years.push(y);
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        disabled={value >= currentYear}
        onClick={() => onChange(value + 1)}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-600"
        aria-label="Nächstes Jahr"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-sm font-semibold text-gray-800 bg-gray-100 border-0 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-info-500 appearance-none text-center"
        style={{ minWidth: '4.5rem' }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}{y === currentYear ? ' ★' : ''}
          </option>
        ))}
      </select>

      <button
        disabled={value <= firstYear}
        onClick={() => onChange(value - 1)}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-600"
        aria-label="Vorheriges Jahr"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    </div>
  );
}
