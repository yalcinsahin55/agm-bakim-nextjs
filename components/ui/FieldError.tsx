interface FieldErrorProps {
  id: string;
  message?: string;
}

export default function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return <p id={id} role="alert" className="mt-1 text-[11px] font-semibold text-red">{message}</p>;
}
