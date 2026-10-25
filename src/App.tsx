import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from './components/Layout';

const Timetable = lazy(() => import('./pages/Timetable'));
const Faculty = lazy(() => import('./pages/Faculty'));
const Batches = lazy(() => import('./pages/Batches'));
const Settings = lazy(() => import('./pages/Settings'));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Loading view...
      </span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={
              <Suspense fallback={<PageLoader />}>
                <Timetable />
              </Suspense>
            }
          />
          <Route
            path="faculty"
            element={
              <Suspense fallback={<PageLoader />}>
                <Faculty />
              </Suspense>
            }
          />
          <Route
            path="batches"
            element={
              <Suspense fallback={<PageLoader />}>
                <Batches />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageLoader />}>
                <Settings />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}