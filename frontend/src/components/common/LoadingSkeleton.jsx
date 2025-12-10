import React from 'react';

export function LoadingSkeleton({
  width = '100%',
  height = '1rem',
  borderRadius = '4px',
  className = ''
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius }}
    />
  );
}

export function CardSkeleton({ lines = 3 }) {
  return (
    <div className="card skeleton-card">
      <LoadingSkeleton width="60%" height="1.5rem" className="mb-md" />
      {Array.from({ length: lines }).map((_, i) => (
        <LoadingSkeleton
          key={i}
          width={i === lines - 1 ? '40%' : '100%'}
          className="mb-sm"
        />
      ))}
    </div>
  );
}

export function TaskCardSkeleton() {
  return (
    <div className="task-card-skeleton">
      <div className="skeleton-row">
        <LoadingSkeleton width="80px" height="24px" borderRadius="6px" />
        <LoadingSkeleton width="60px" height="24px" borderRadius="6px" />
      </div>
      <LoadingSkeleton width="100%" height="1rem" className="mb-sm" />
      <LoadingSkeleton width="70%" height="1rem" className="mb-md" />
      <div className="skeleton-row">
        <LoadingSkeleton width="100px" height="0.875rem" />
        <LoadingSkeleton width="120px" height="0.875rem" />
      </div>
    </div>
  );
}

export function TaskListSkeleton({ count = 3 }) {
  return (
    <div className="task-list-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <TaskCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <div className="card">
        <div className="skeleton-row mb-lg">
          <LoadingSkeleton width="200px" height="1.5rem" />
          <LoadingSkeleton width="140px" height="40px" borderRadius="8px" />
        </div>
        <div className="insights-skeleton mb-lg">
          <LoadingSkeleton width="180px" height="1.25rem" className="mb-md" />
          <div className="grid-auto">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card-skeleton">
                <LoadingSkeleton width="60px" height="2rem" className="mb-sm" />
                <LoadingSkeleton width="80px" height="0.875rem" />
              </div>
            ))}
          </div>
        </div>
        <LoadingSkeleton width="100%" height="200px" borderRadius="8px" />
      </div>
      <div className="card">
        <LoadingSkeleton width="150px" height="1.25rem" className="mb-md" />
        <div className="quick-actions-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} width="100%" height="80px" borderRadius="8px" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="table-skeleton">
      <div className="table-skeleton-header">
        {Array.from({ length: columns }).map((_, i) => (
          <LoadingSkeleton key={i} width="100%" height="1rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="table-skeleton-row">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <LoadingSkeleton
              key={colIndex}
              width={colIndex === 0 ? '80%' : '60%'}
              height="0.875rem"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4 }) {
  return (
    <div className="form-skeleton">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="form-field-skeleton mb-md">
          <LoadingSkeleton width="100px" height="0.875rem" className="mb-sm" />
          <LoadingSkeleton width="100%" height="42px" borderRadius="6px" />
        </div>
      ))}
      <LoadingSkeleton width="120px" height="42px" borderRadius="8px" />
    </div>
  );
}

export default LoadingSkeleton;
