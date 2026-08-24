import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENTITIES } from './data.js';
import { run } from '@cue/engine';
import { CALENDAR, DEFAULTS, positionAt, timeAt, fmtClock } from './sim/world.js';
import { loadFeedback, saveFeedback, resetFeedback } from './state/store.js';

import Graveyard from './screens/Graveyard.jsx';
import Extract from './screens/Extract.jsx';
import WorldMap from './screens/WorldMap.jsx';
import Nudge from './screens/Nudge.jsx';
import Card from './screens/Card.jsx';
import Gym from './screens/Gym.jsx';
import SimPanel from './screens/SimPanel.jsx';

const SCREENS = [
  ['The graveyard', Graveyard],
  ['Extraction', Extract],
  ['The map', WorldMap],
  ['The nudge', Nudge],
  ['The card', Card],
  ['Gym', Gym],
];

// URL params make a recording take exactly reproducible: ?screen=4&t=10.6&p=0.82
const param = (key, fallback) => {
  const v = Number(new URLSearchParams(location.search).get(key));
  return Number.isFinite(v) && new URLSearchParams(location.search).has(key) ? v : fallback;
};
const startScreen = () => {
  const n = param('screen', 1);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n - 1 : 0;
};

export default function App() {
  // ?screen=4 deep-links straight to a beat, so a recording take can be repeated exactly.
  const [screen, setScreen] = useState(startScreen);
  const [hours, setHours] = useState(() => param('t', DEFAULTS.hours));
  const [routeT, setRouteT] = useState(() => param('p', DEFAULTS.routeT));
  const [feedback, setFeedback] = useState(loadFeedback);
  const [firedToday, setFiredToday] = useState([]);
  const [showSim, setShowSim] = useState(true);

  // The context the engine sees. Nothing here is scripted — change any input and
  // the engine re-decides from scratch.
  const now = useMemo(() => timeAt(hours), [hours]);
  const position = useMemo(() => positionAt(routeT), [routeT]);
  const ctx = useMemo(
    () => ({ now, position, calendar: CALENDAR, feedback, firedToday }),
    [now, position, feedback, firedToday]);

  // "never" is the only thing that shrinks the archive, so it filters the corpus itself.
  const living = useMemo(() => ENTITIES.filter((e) => feedback[e.id] !== 'never'), [feedback]);
  const result = useMemo(() => run(living, ctx), [living, ctx]);

  const react = useCallback((id, verdict) => {
    setFeedback((prev) => saveFeedback({ ...prev, [id]: verdict }));
    if (verdict !== 'never') setFiredToday((prev) => [...new Set([...prev, id])]);
  }, []);

  const reset = useCallback(() => {
    setFeedback(resetFeedback());
    setFiredToday([]);
  }, []);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('screen', String(screen + 1));
    url.searchParams.set('t', hours.toFixed(2));
    url.searchParams.set('p', routeT.toFixed(2));
    history.replaceState(null, '', url);
  }, [screen, hours, routeT]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') setScreen((s) => Math.min(SCREENS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setScreen((s) => Math.max(0, s - 1));
      if (e.key === 's') setShowSim((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const Screen = SCREENS[screen][1];
  const shared = { ctx, result, living, feedback, react, reset, now, position, hours, setHours, setScreen };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Cue<span>.</span></div>
        <div className="tagline">an execution layer for saved intent</div>
        <nav className="steps">
          {SCREENS.map(([name], i) => (
            <button key={name} className={`step${i === screen ? ' on' : ''}`} onClick={() => setScreen(i)}>
              {i + 1}. {name}
            </button>
          ))}
        </nav>
      </header>

      <main className="stage"><Screen {...shared} /></main>

      {showSim
        ? <SimPanel {...shared} routeT={routeT} setRouteT={setRouteT} onHide={() => setShowSim(false)} />
        : <button className="simtoggle" onClick={() => setShowSim(true)}>show simulator · s</button>}
      <div className="hint">← → to step · s toggles the simulator</div>
    </div>
  );
}
