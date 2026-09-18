import { Routes, Route } from 'react-router-dom';
import VehicleSwitcher from './components/VehicleSwitcher';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import FillupForm from './pages/FillupForm';
import Fillups from './pages/Fillups';
import Vehicles from './pages/Vehicles';
import Reports from './pages/Reports';
import ImportExport from './pages/ImportExport';
import './App.css';

export default function App() {
  return (
    <div className="app-shell">
      <VehicleSwitcher />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/add" element={<FillupForm />} />
          <Route path="/fillup/:id" element={<FillupForm />} />
          <Route path="/fillups" element={<Fillups />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/data" element={<ImportExport />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
