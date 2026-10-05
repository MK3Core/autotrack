import { createContext, useContext, useState, type ReactNode } from 'react';
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
  // Undefined until the first read completes; see the render guard below.
  const loadedVehicles = useLiveQuery(() => db.vehicles.orderBy('name').toArray(), []);
  const vehicles = loadedVehicles ?? [];
  const [storedVehicleId, setStoredVehicleId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  // Falls back to the first active vehicle during render (not in an effect),
  // so pages never render a frame with nothing selected.
  const selectedVehicleId = vehicles.some((v) => v.id === storedVehicleId)
    ? storedVehicleId
    : ((vehicles.find((v) => v.active) ?? vehicles[0])?.id ?? null);

  const selectVehicle = (id: string) => {
    setStoredVehicleId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;

  // Render nothing for the instant before the first read, rather than a
  // "no vehicles yet" state that the real data immediately replaces.
  if (!loadedVehicles) return null;

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
