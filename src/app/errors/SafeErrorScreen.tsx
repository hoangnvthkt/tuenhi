export function SafeErrorScreen({
  title = 'Ứng dụng gặp sự cố khi hiển thị trang',
}: {
  title?: string;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <section
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"
      >
        <h1 className="text-xl font-bold text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Vui lòng tải lại ứng dụng. Nếu sự cố tiếp diễn, hãy liên hệ người quản
          lý hệ thống.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white"
        >
          Tải lại ứng dụng
        </button>
      </section>
    </main>
  );
}
