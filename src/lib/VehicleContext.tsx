import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Vehicle } from '../types';

interface VehicleContextValue {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  selectVehicle: (id: string) => void;
  selectedVehicle: Vehicle | null;
}

const VehicleContext = createContext<VehicleContextValue | null>(null);

const STORAGE_KEY = 'autotrack.selectedVehicleId';

export function VehicleProvider({ children }: { children: ReactNode }) {
  const vehicles = useLiveQuery(() => db.vehicles.orderBy('name').toArray(), [], []) ?? [];
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  useEffect(() => {
    if (!vehicles.length) return;
    const stillExists = vehicles.some((v) => v.id === selectedVehicleId);
    if (!stillExists) {
      const firstActive = vehicles.find((v) => v.active) ?? vehicles[0];
      setSelectedVehicleId(firstActive.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles]);

  const selectVehicle = (id: string) => {
    setSelectedVehicleId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;

  return (
    <VehicleContext.Provider value={{ vehicles, selectedVehicleId, selectVehicle, selectedVehicle }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicles() {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicles must be used within VehicleProvider');
  return ctx;
}
