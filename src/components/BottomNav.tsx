import { NavLink } from 'react-router-dom';
import './BottomNav.css';

const items = [
  { to: '/', label: 'Log', icon: '⛽', end: true, iconClass: 'bottom-nav__icon--pump' },
  { to: '/vehicles', label: 'Vehicles', icon: '🚗', end: false, iconClass: 'bottom-nav__icon--boost' },
  { to: '/reports', label: 'Reports', icon: '📈', end: false },
  { to: '/data', label: 'Data', icon: '💿', end: false },
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
          <span className={`bottom-nav__icon ${'iconClass' in item ? item.iconClass : ''}`}>{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
