import { NavLink } from 'react-router-dom';
import './BottomNav.css';

const items = [
  { to: '/', label: 'Log', icon: '☰', end: true },
  { to: '/reports', label: 'Reports', icon: '📈', end: false },
  { to: '/vehicles', label: 'Vehicles', icon: '🚗', end: false },
  { to: '/data', label: 'Data', icon: '⇅', end: false },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
        >
          <span className="bottom-nav__icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
