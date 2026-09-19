import { Routes, Route } from 'react-router-dom';
import VehicleSwitcher from './components/VehicleSwitcher';
import BottomNav from './components/BottomNav';
import NativeBackHandler from './components/NativeBackHandler';
import FillupForm from './pages/FillupForm';
import Log from './pages/Log';
import Vehicles from './pages/Vehicles';
import Reports from './pages/Reports';
import ImportExport from './pages/ImportExport';
import './App.css';

export default function App() {
  return (
    <div className="app-shell">
      <NativeBackHandler />
      <VehicleSwitcher />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Log />} />
          <Route path="/add" element={<FillupForm />} />
          <Route path="/fillup/:id" element={<FillupForm />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/data" element={<ImportExport />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
