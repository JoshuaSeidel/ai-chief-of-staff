import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for pull-to-refresh functionality
 * @param {Function} onRefresh - Callback function to execute on refresh
 * @param {Object} options - Configuration options
 * @returns {Object} - State and handlers for pull-to-refresh
 */
export function usePullToRefresh(onRefresh, options = {}) {
  const {
    threshold = 80, // Distance in pixels to trigger refresh
    resistance = 2.5, // Resistance factor for pull
    disabled = false
  } = options;

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const elementRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const checkScrollTop = useCallback(() => {
    // Check if we're at the top of the page
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    return scrollTop <= 5; // Allow small margin for rounding
  }, []);

  useEffect(() => {
    if (disabled || !onRefresh) return;

    let touchStartY = 0;
    let isPulling = false;

    const handleTouchStart = (e) => {
      if (isRefreshingRef.current) return;
      
      touchStartY = e.touches[0].clientY;
      const atTop = checkScrollTop();
      
      // Check if we're in PWA mode
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                    window.navigator.standalone === true ||
                    document.referrer.includes('android-app://');
      
      // Only start if we're at the top
      if (atTop) {
        isPulling = true;
        // In iOS PWA mode, prevent default immediately to block native pull-to-refresh
        if (isPWA) {
          // iOS Safari PWA requires preventDefault on touchstart to block native pull-to-refresh
          e.preventDefault();
          console.log('[PullToRefresh] iOS PWA mode - preventing default on touchstart');
        } else {
          console.log('[PullToRefresh] Touch start at top, enabled');
        }
      }
    };

    const handleTouchMove = (e) => {
      if (!isPulling || isRefreshingRef.current) return;
      
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;
      const atTop = checkScrollTop();
      
      // Check if we're in PWA mode
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                    window.navigator.standalone === true ||
                    document.referrer.includes('android-app://');

      // Only allow pull-to-refresh if at the top and pulling down
      if (deltaY > 0 && atTop) {
        // Always prevent default when pulling down at top to block native pull-to-refresh
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Prevent default browser pull-to-refresh
        const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        if (scrollTop === 0) {
          const distance = Math.min(deltaY / resistance, threshold * 1.5);
          setPullDistance(distance);
          pullDistanceRef.current = distance;
          if (distance > 10 && distance % 20 < 5) {
            console.log('[PullToRefresh] Pulling:', Math.round(distance), 'px', isPWA ? '(PWA)' : '');
          }
        }
      } else if (deltaY <= 0 || !atTop) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        isPulling = false;
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling) {
        setPullDistance(0);
        isPulling = false;
        return;
      }

      const currentDistance = pullDistanceRef.current;
      console.log('[PullToRefresh] Touch end, distance:', Math.round(currentDistance), 'threshold:', threshold);
      
      if (currentDistance >= threshold && !isRefreshingRef.current) {
        console.log('[PullToRefresh] Triggering refresh');
        setIsRefreshing(true);
        // Keep the pull distance visible during refresh
        setPullDistance(threshold);
        
        try {
          // Call the refresh function
          if (onRefresh && typeof onRefresh === 'function') {
            await onRefresh();
            console.log('[PullToRefresh] Refresh complete');
          } else {
            console.warn('[PullToRefresh] onRefresh is not a function:', typeof onRefresh);
          }
        } catch (error) {
          console.error('[PullToRefresh] Refresh error:', error);
        } finally {
          // Small delay before resetting to show completion
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 300);
        }
      } else {
        console.log('[PullToRefresh] Not enough distance, canceling');
        // Animate back smoothly
        setPullDistance(0);
      }
      
      isPulling = false;
    };

    // Attach to document for better capture
    // Use capture phase to intercept before other handlers
    // In iOS PWA, we need to be more aggressive with event handling
    // Use { passive: false } to allow preventDefault
    const options = { passive: false, capture: true };
    document.addEventListener('touchstart', handleTouchStart, options);
    document.addEventListener('touchmove', handleTouchMove, options);
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    
    // Also attach to window for iOS PWA compatibility
    window.addEventListener('touchstart', handleTouchStart, options);
    window.addEventListener('touchmove', handleTouchMove, options);
    window.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });

    return () => {
      const options = { capture: true };
      document.removeEventListener('touchstart', handleTouchStart, options);
      document.removeEventListener('touchmove', handleTouchMove, options);
      document.removeEventListener('touchend', handleTouchEnd, options);
      window.removeEventListener('touchstart', handleTouchStart, options);
      window.removeEventListener('touchmove', handleTouchMove, options);
      window.removeEventListener('touchend', handleTouchEnd, options);
    };
  }, [threshold, resistance, onRefresh, disabled, checkScrollTop]);

  const pullProgress = Math.min(pullDistance / threshold, 1);
  const shouldTrigger = pullDistance >= threshold;

  return {
    pullDistance,
    isRefreshing,
    pullProgress,
    shouldTrigger,
    elementRef
  };
}
