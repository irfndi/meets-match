import { NavLink } from 'react-router-dom';
import { User, Heart, MessageCircle, Settings } from 'lucide-react';
import { cn } from '../utils/cn';

const navigation = [
  { name: 'Profile', href: '/profile', icon: User },
  { name: 'Matches', href: '/matches', icon: Heart },
  { name: 'Messages', href: '/messages', icon: MessageCircle },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Navigation() {
  return (
    <nav className="w-64 bg-white shadow-sm border-r border-gray-200 min-h-screen">
      <div className="p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.name}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-pink-100 text-pink-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}