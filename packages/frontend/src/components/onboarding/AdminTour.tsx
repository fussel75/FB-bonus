/**
 * AdminTour — Onboarding-Walkthrough für neue Admins
 *
 * Steuerung über localStorage: bonustrack-tour-seen-v1
 * Zeigt sich nur beim ersten Besuch der Admin-UI.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface Step {
  title:   string;
  text:    string;
  selector?: string;       // optionaler CSS-Selektor für Highlight
  route?:    string;        // erwartete Route — Schritt wird übersprungen wenn anders
}

const STEPS: Step[] = [
  {
    title: 'Willkommen bei BonusTrack',
    text:  'Diese kurze Tour zeigt dir die wichtigsten Bereiche. Du kannst sie jederzeit über das Fragezeichen-Symbol erneut starten.',
  },
  {
    title: 'Dashboard',
    text:  'Hier siehst du den aktuellen Bonus-Topf, die Anzahl qualifizierter Mitarbeiter und einen schnellen Überblick über offene Aufgaben.',
    route: '/admin',
  },
  {
    title: 'Mitarbeiter',
    text:  'Stammdaten, Stundenlöhne (für § 4a EFZG), Kranktage und Rollen kannst du hier inline bearbeiten. Klick auf einen Wert zum Ändern.',
    selector: 'a[href="/admin/mitarbeiter"]',
  },
  {
    title: 'Konfiguration',
    text:  'Krankheits-Staffel, Bonus-Stufen, Stundensätze und der § 4a EFZG-Schutz werden hier gepflegt. Mit Vorschau-Widget!',
    selector: 'a[href="/admin/konfiguration"]',
  },
  {
    title: 'Jahresabschluss',
    text:  'Am Jahresende erzeugst du hier die endgültigen Auszahlungen. Erst nach deiner Bestätigung — keine Automatik.',
    selector: 'a[href="/admin/jahresabschluss"]',
  },
  {
    title: 'Mail-Versand',
    text:  'Mitarbeiter-Mails werden NIE automatisch verschickt. Du siehst jeden Draft vorab und klickst aktiv auf "Versenden".',
  },
  {
    title: 'Bereit!',
    text:  'Tipp: Setze in der Konfiguration `ganzjahres_bedingung_mindest_monate_im_jahr=6`, damit Austretende anteilig qualifiziert bleiben. Viel Erfolg!',
  },
];

const STORAGE_KEY = 'bonustrack-tour-seen-v1';

export function AdminTour() {
  const [active,  setActive]  = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    // Nur in der Admin-UI starten
    if (!seen && location.pathname.startsWith('/admin')) {
      // Kurze Verzögerung, damit die App erstmal geladen ist
      const t = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(t);
    }
  }, [location.pathname]);

  if (!active) return null;

  const step = STEPS[stepIdx];
  const isLast = stepIdx >= STEPS.length - 1;

  const close = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setActive(false);
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4 animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 shadow-lift">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">💡</span>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Schritt {stepIdx + 1} von {STEPS.length}
          </p>
        </div>

        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{step.title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">{step.text}</p>

        {/* Fortschrittsbalken */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full mb-5">
          <div
            className="h-1 bg-info-500 rounded-full transition-all"
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={close}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Tour beenden
          </button>
          <div className="flex gap-2">
            {stepIdx > 0 && (
              <button
                onClick={() => setStepIdx((i) => i - 1)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Zurück
              </button>
            )}
            <button
              onClick={() => isLast ? close() : setStepIdx((i) => i + 1)}
              className="px-4 py-1.5 text-sm rounded-lg bg-info-600 hover:bg-info-700 text-white font-medium"
            >
              {isLast ? 'Verstanden' : 'Weiter →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
