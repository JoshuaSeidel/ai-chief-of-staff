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
      
      // Only start if we're at the top
      if (atTop) {
        isPulling = true;
        // In PWA mode, prevent default immediately to block browser pull-to-refresh
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true ||
            document.referrer.includes('android-app://')) {
          // This is a PWA - be more aggressive
          console.log('[PullToRefresh] PWA mode detected, touch start at top');
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

      // Only allow pull-to-refresh if at the top and pulling down
      if (deltaY > 0 && atTop) {
        // In PWA mode, we need to be more aggressive with preventDefault
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Prevent default browser pull-to-refresh
        if (window.scrollY === 0) {
          const distance = Math.min(deltaY / resistance, threshold * 1.5);
          setPullDistance(distance);
          if (distance > 10 && distance % 20 < 5) {
            console.log('[PullToRefresh] Pulling:', Math.round(distance), 'px');
          }
        }
      } else if (deltaY <= 0 || !atTop) {
        setPullDistance(0);
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
        setPullDistance(threshold);
        
        try {
          await onRefresh();
          console.log('[PullToRefresh] Refresh complete');
        } catch (error) {
          console.error('[PullToRefresh] Refresh error:', error);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        console.log('[PullToRefresh] Not enough distance, canceling');
        setPullDistance(0);
      }
      
      isPulling = false;
    };

    // Attach to document for better capture
    // Use capture phase to intercept before other handlers
    document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('touchend', handleTouchEnd, { capture: true });
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
