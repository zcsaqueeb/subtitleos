type Props = {
  title: string;
  tagline: string;
  featureName: string;
  bullets: string[];
  children: React.ReactNode;
};

/**
 * Everything in the app is free — this component is now a pass-through.
 * Kept so existing call sites keep working.
 */
export function PaidGate({ children }: Props) {
  return <>{children}</>;
}
