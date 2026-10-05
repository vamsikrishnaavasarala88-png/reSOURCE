import type { LucideIcon } from 'lucide-react';

/** A single entry in the main navigation. */
export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}
