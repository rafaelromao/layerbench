import { VERSION } from '@layoutmaster/core';

export function App() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">LayoutMaster</h1>
      <p className="text-sm opacity-70">engine v{VERSION}</p>
    </main>
  );
}
