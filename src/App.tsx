import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Timetable from './components/Timetable';
import Faculty from './pages/Faculty';
import Batches from './pages/Batches';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Default route loads the timetable */}
          <Route index element={<Timetable />} />
          <Route path="faculty" element={<Faculty />} />
          <Route path="batches" element={<Batches />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}