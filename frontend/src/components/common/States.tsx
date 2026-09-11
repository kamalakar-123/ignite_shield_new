

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading data...' }: LoadingStateProps) {
  return (
    <div className="state-container loading-state">
      <div className="loading-spinner" />
      <p>{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Failed to load data', onRetry }: ErrorStateProps) {
  return (
    <div className="state-container error-state">
      <div className="state-icon">⚠️</div>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  message?: string;
  icon?: string;
}

export function EmptyState({ message = 'No data available', icon = '📭' }: EmptyStateProps) {
  return (
    <div className="state-container empty-state">
      <div className="state-icon">{icon}</div>
      <p>{message}</p>
    </div>
  );
}

export function LoadingSkeleton({ count = 3, height = 80 }: { count?: number; height?: number }) {
  return (
    <div className="skeleton-container">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-item" style={{ height: `${height}px` }} />
      ))}
    </div>
  );
}
