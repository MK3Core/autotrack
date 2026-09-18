import { Link } from 'react-router-dom';
import { useVehicles } from '../lib/VehicleContext';
import './VehicleSwitcher.css';

export default function VehicleSwitcher() {
  const { vehicles, selectedVehicleId, selectVehicle } = useVehicles();

  if (!vehicles.length) {
    return (
      <header className="vswitch vswitch--empty">
        <span>AutoTrack</span>
        <Link to="/vehicles" className="vswitch__add-link">
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
      <Link to="/vehicles" className="vswitch__manage">
        Manage
      </Link>
    </header>
  );
}
