import { useLayoutEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import VehicleSwitcher from './components/VehicleSwitcher';
import BottomNav from './components/BottomNav';
import NativeBackHandler from './components/NativeBackHandler';
import FillupForm from './pages/FillupForm';
import Log from './pages/Log';
import ServiceForm from './pages/ServiceForm';
import Garage from './pages/Garage';
import Reports from './pages/Reports';
import ImportExport from './pages/ImportExport';
import { useVehicles } from './lib/VehicleContext';
import './App.css';

// Bottom-nav tabs stay mounted for the life of the app, like a native tab
// bar: switching tabs only toggles which one is visible, so there's no
// remount and no flash of empty data while IndexedDB answers. Each tab is
// its own scroll container, so each keeps its scroll position too.
const TABS = [
  { path: '/', element: <Log /> },
  { path: '/garage', element: <Garage /> },
  { path: '/reports', element: <Reports /> },
  { path: '/data', element: <ImportExport /> },
];

export default function App() {
  const location = useLocation();
  const { pathname } = location;
  const onTab = TABS.some((t) => t.path === pathname);
  const { selectedVehicleId } = useVehicles();
  const paneRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll positions are per tab, not per vehicle: a different vehicle starts
  // every tab back at the top. Layout effect, so the old position is never
  // painted with the new vehicle's content.
  useLayoutEffect(() => {
    for (const pane of paneRefs.current) if (pane) pane.scrollTop = 0;
  }, [selectedVehicleId]);

  return (
    <div className="app-shell">
      <NativeBackHandler />
      <VehicleSwitcher />
      <main className="app-content">
        {TABS.map((t, i) => {
          const active = t.path === pathname;
          return (
            <div
              key={t.path}
              ref={(el) => {
                paneRefs.current[i] = el;
              }}
              className={`app-pane ${active ? 'is-active' : ''}`}
              inert={!active}
            >
              {t.element}
            </div>
          );
        })}
        {/* Detail pages open over the tabs, which stay alive underneath. Keyed
            by history entry so every visit starts from a fresh form: unsaved
            edits never carry over into the next page. */}
        {!onTab && (
          <div key={`${pathname}${location.search}:${location.key}`} className="app-pane is-active">
            <Routes>
              <Route path="/add" element={<FillupForm />} />
              <Route path="/fillup/:id" element={<FillupForm />} />
              <Route path="/service/new" element={<ServiceForm />} />
              <Route path="/service/:id" element={<ServiceForm />} />
              <Route path="/vehicles" element={<Navigate to="/garage" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
