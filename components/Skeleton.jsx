export default function Skeleton({ className = "", ...props }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted/20 ${className}`}
      {...props}
    />
  );
}
