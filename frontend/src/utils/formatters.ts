/**
 * Format a date string to a readable format.
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

/**
 * Format relative time (e.g., "2 minutes ago").
 */
export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  } catch {
    return 'N/A';
  }
}

/**
 * Format a number with units.
 */
export function formatValue(value: number | null | undefined, unit: string, decimals: number = 1): string {
  if (value === null || value === undefined) return 'Data unavailable';
  return `${value.toFixed(decimals)} ${unit}`;
}

/**
 * Get risk level color.
 */
export function getRiskColor(risk: string): string {
  switch (risk) {
    case 'High': return '#ef4444';
    case 'Medium': return '#eab308';
    case 'Low': return '#22c55e';
    default: return '#6b7280';
  }
}

/**
 * Get risk level background color.
 */
export function getRiskBgColor(risk: string): string {
  switch (risk) {
    case 'High': return 'rgba(239, 68, 68, 0.15)';
    case 'Medium': return 'rgba(234, 179, 8, 0.15)';
    case 'Low': return 'rgba(34, 197, 94, 0.15)';
    default: return 'rgba(107, 114, 128, 0.15)';
  }
}

/**
 * Download a blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get confidence percentage string.
 */
export function formatConfidence(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return 'N/A';
  return `${(confidence * 100).toFixed(1)}%`;
}
