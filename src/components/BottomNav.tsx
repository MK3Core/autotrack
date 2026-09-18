import { NavLink } from 'react-router-dom';
import './BottomNav.css';

const items = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/add', label: 'Add', icon: '+' },
  { to: '/fillups', label: 'Log', icon: '☰' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/data', label: 'Data', icon: '⇅' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
        >
          <span className="bottom-nav__icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
