import React from 'react';

const Loader: React.FC = () => {
  return (
    <div className="flex justify-center items-center space-x-2" dir="ltr">
      <div className="w-4 h-4 rounded-full animate-pulse bg-blue-400"></div>
      <div className="w-4 h-4 rounded-full animate-pulse bg-blue-400 delay-200"></div>
      <div className="w-4 h-4 rounded-full animate-pulse bg-blue-400 delay-400"></div>
    </div>
  );
};

export default Loader;
