
import React from 'react';
import { Role } from '../types';

interface RoleSwitcherProps {
  currentRole: Role;
  onRoleChange: (role: Role) => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ currentRole, onRoleChange }) => {
  return (
    <div className="bg-white p-4 shadow-sm border-b border-gray-300 flex items-center justify-between flex-wrap gap-2">
      <span className="text-sm font-extrabold text-gray-700 uppercase tracking-wider">Viewing as:</span>
      <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
        {Object.values(Role).map((role) => (
          <button
            key={role}
            onClick={() => onRoleChange(role)}
            className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors whitespace-nowrap flex-shrink-0 border ${
              currentRole === role
                ? 'bg-kauvery-purple text-white border-kauvery-purple shadow-md'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100 hover:border-gray-400 hover:text-gray-900'
            }`}
          >
            {role}
          </button>
        ))}
      </div>
    </div>
  );
};
