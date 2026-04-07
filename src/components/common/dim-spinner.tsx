import { Spinner } from "./spinner";

export function DimSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Spinner size={48} className="text-white" />
    </div>
  );
}
