import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, HelpCircle, Search, Building } from "lucide-react";

const ActionIconsNew: React.FC = () => {
  const items = [
    {
      id: 1,
      label: "Register
New Phone",
      icon: <Plus className="w-7 h-7 text-orange-500" />,
      path: "/register-phone"
    },
    {
      id: 2,
      label: "Report Lost
Phone",
      icon: <HelpCircle className="w-7 h-7 text-orange-500" />,
      path: "/report"
    },
    {
      id: 3,
      label: "Search
Phone",
      icon: <Search className="w-7 h-7 text-orange-500" />,
      path: "/search"
    },
    {
      id: 4,
      label: "Agencies",
      icon: <Building className="w-7 h-7 text-orange-500" />,
      path: "/agencies"
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 text-center py-3">
      {items.map((item) => (
        <Link 
          key={item.id} 
          to={item.path}
          className="flex flex-col items-center gap-2"
        >
          {/* الدائرة البيضاء */}
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md">
            <div className="w-10 h-16 flex flex-col items-center justify-center">
              {/* شكل الموبايل الخارجي */}
              <div className="w-10 h-14 border-4 border-teal-800 rounded-xl flex items-center justify-center">
                {item.icon}
              </div>
              {/* زر أسفل الشاشة كما في الشكل */}
              <div className="w-3 h-1.5 bg-teal-800 rounded-full mt-1"></div>
            </div>
          </div>
          {/* النص */}
          <p className="text-white text-sm leading-tight whitespace-pre-line">
            {item.label}
          </p>
        </Link>
      ))}
    </div>
  );
};

export default ActionIconsNew;
