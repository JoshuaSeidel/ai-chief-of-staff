import React from 'react';
import { usePullToRefresh } from '../utils/usePullToRefresh';

/**
 * Pull-to-refresh wrapper component
 * Shows visual feedback when user pulls down to refresh
 */
export function PullToRefresh({ onRefresh, children, disabled = false, style = {} }) {
  const threshold = 80;
  const { pullDistance, isRefreshing, pullProgress, elementRef } = usePullToRefresh(onRefresh, { disabled, threshold });

  const indicatorStyle = {
    position: 'absolute',
    top: 0,
    left: '50%',
    width: '100%',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 10,
    transform: `translateX(-50%) translateY(${Math.max(0, -60 + pullDistance)}px)`,
    opacity: pullDistance > 10 ? Math.min(pullProgress * 2, 1) : 0,
    transition: pullDistance === 0 ? 'opacity 0.3s ease-out, transform 0.3s ease-out' : 'none',
    backgroundColor: pullDistance > threshold ? 'rgba(96, 165, 250, 0.1)' : 'transparent'
  };

  const contentStyle = {
    transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : 'translateY(0)',
    transition: pullDistance === 0 && !isRefreshing ? 'transform 0.3s ease-out' : 'none',
    minHeight: '100%'
  };

  const spinnerStyle = {
    width: '24px',
    height: '24px',
    border: '3px solid rgba(96, 165, 250, 0.3)',
    borderTop: '3px solid #60a5fa',
    borderRadius: '50%',
    animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none'
  };

  return (
    <div 
      ref={elementRef} 
      style={{ 
        ...style, 
        position: 'relative',
        minHeight: '100%',
        // Prevent browser pull-to-refresh in PWA
        overscrollBehavior: 'none',
        overscrollBehaviorY: 'none',
        touchAction: 'pan-y'
      }}
    >
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {/* Indicator that moves with the pull */}
      <div style={indicatorStyle}>
        {pullDistance > 10 && (
          <>
            {isRefreshing ? (
              <div style={spinnerStyle} />
            ) : (
              <div style={{ 
                color: '#60a5fa', 
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: pullProgress >= 1 ? 'bold' : 'normal'
              }}>
                <span style={{ 
                  transform: `rotate(${pullProgress * 180}deg)`, 
                  transition: 'transform 0.1s',
                  fontSize: '1.2rem'
                }}>
                  ↓
                </span>
                <span>
                  {pullProgress >= 1 ? 'Release to refresh' : 'Pull to refresh'}
                </span>
              </div>
            )}
          </>
        )}
      </div>
      {/* Content that moves down with the pull */}
      <div style={contentStyle}>
        {children}
      </div>
    </div>
  );
}
