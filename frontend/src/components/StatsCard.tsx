import React from 'react';

interface StatsCardProps {
  title: string;
  value: number;
  colorClass: string;
  icon: React.ReactNode;
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, colorClass, icon }) => {
  return (
    <div className={`bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center space-x-4 ${colorClass}`}>
      <div className="p-3 rounded-lg bg-opacity-20 bg-white backdrop-blur-sm">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
      </div>
    </div>
  );
};