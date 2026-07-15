"use client";

export default function HubungiAdminPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-8 shadow-sm space-y-4 text-center">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-bold text-foreground">
          Akun Belum Terhubung
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Akun Anda sudah berhasil login, tetapi belum terhubung ke data
          investor atau broker di sistem. Fitur access Anda sangat terbatas —
          silakan hubungi admin untuk menghubungkan akun ini ke data Anda.
        </p>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.href = "/";
            }
          }}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Kembali ke Halaman Login
        </button>
      </div>
    </main>
  );
}
