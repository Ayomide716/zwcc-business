/**
 * Status badge driven entirely by the workflow configuration — a status added
 * to `workflow.config.ts` renders correctly here with no change.
 */
import { Badge } from '@/components/ui/Badge';
import { getStatusDefinition } from '@/workflow/engine';

export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const definition = getStatusDefinition(status);
  return <Badge label={definition.label} tone={definition.tone} size={size} />;
}
