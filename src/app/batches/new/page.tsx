import { BatchForm } from "./batch-form";

export default function NewBatchPage() {
  return (
    <div className="font-sans min-h-screen p-8">
      <main className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold mb-6">New batch</h1>
        <BatchForm />
      </main>
    </div>
  );
}
