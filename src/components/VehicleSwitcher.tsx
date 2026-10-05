import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useVehicles } from '../lib/VehicleContext';
import './VehicleSwitcher.css';

export default function VehicleSwitcher() {
  const { vehicles, selectedVehicleId, selectVehicle } = useVehicles();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (!vehicles.length) {
    return (
      <header className="vswitch vswitch--empty">
        <span>AutoTrack</span>
        <Link to="/garage" className="vswitch__add-link">
          + Add your first vehicle
        </Link>
      </header>
    );
  }

  return (
    <header className="vswitch">
      <div className="vswitch__chips">
        {vehicles
          .filter((v) => v.active)
          .map((v) => (
            <button
              key={v.id}
              className={`vswitch__chip ${v.id === selectedVehicleId ? 'is-active' : ''}`}
              onClick={() => selectVehicle(v.id)}
            >
              {v.name}
            </button>
          ))}
      </div>
      {/* Only on the Garage tab, which opens its add form from ?add=1. */}
      {pathname === '/garage' && (
        <button
          type="button"
          className="vswitch__chip vswitch__chip--add"
          onClick={() => navigate('/garage?add=1', { replace: true })}
        >
          + Add Vehicle
        </button>
      )}
    </header>
  );
}
