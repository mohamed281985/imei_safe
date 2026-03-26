import { useEffect, useState } from 'react';

/**
 * Custom hook to determine whether a special ad should be displayed.
 * @returns {boolean} Whether the special ad should be displayed.
 */
const useSpecialAdDisplay = (): boolean => {
  const [shouldDisplay, setShouldDisplay] = useState(true);

  useEffect(() => {
    // Logic to determine if the ad should be displayed can be added here.
    // For now, it always returns true.
    setShouldDisplay(true);
  }, []);

  return shouldDisplay;
};

export default useSpecialAdDisplay;
