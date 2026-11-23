import { useEffect, useId, useRef, useState } from 'react';
import { Info, LoaderCircle, LogOut, X } from 'lucide-react';
import './logout-confirmation.css';

export function LogoutConfirmation({
  appName = 'بوابة إدارة Motion',
  confirm,
  forceLocal,
  closed,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const pending = useRef(false);
  const alive = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = useId();
  const description = useId();

  useEffect(() => {
    alive.current = true;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      alive.current = false;
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  const close = () => {
    if (!pending.current) dialogRef.current?.close();
  };

  const logout = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await confirm();
      if (alive.current) dialogRef.current?.close();
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="logout-confirmation"
      aria-labelledby={title}
      aria-describedby={description}
      aria-busy={busy}
      onClose={() => {
        if (!dialogRef.current?.open) closed();
      }}
      onCancel={(event) => {
        if (pending.current) event.preventDefault();
      }}
    >
      <div className="logout-confirmation-head">
        <span className="logout-confirmation-icon">
          <LogOut size={25} aria-hidden="true" />
        </span>
        <button
          type="button"
          className="logout-confirmation-close"
          aria-label="إغلاق نافذة تسجيل الخروج"
          disabled={busy}
          onClick={close}
        >
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <h2 id={title}>تأكيد تسجيل الخروج</h2>
      <p id={description}>
        هل تريد تسجيل الخروج من {appName}؟ سيتم إنهاء جلستك الحالية، وستحتاج إلى
        تسجيل الدخول للعودة.
      </p>
      <div className="logout-confirmation-hint">
        <Info size={17} aria-hidden="true" />
        <span>تأكد من حفظ أي تغييرات قبل المتابعة.</span>
      </div>
      {failed && (
        <div className="logout-confirmation-error" role="alert">
          <p>تعذّر تسجيل الخروج. تحقّق من الاتصال وحاول مجددًا.</p>
          {forceLocal && (
            <button
              type="button"
              className="logout-confirmation-local"
              disabled={busy}
              onClick={() => {
                dialogRef.current?.close();
                forceLocal();
              }}
            >
              إنهاء الجلسة محليًا على هذا الجهاز
            </button>
          )}
        </div>
      )}
      <div className="logout-confirmation-actions">
        <button
          type="button"
          className="logout-confirmation-confirm"
          disabled={busy}
          onClick={() => void logout()}
        >
          <span
            className="logout-confirmation-label"
            aria-hidden={busy}
            data-hidden={busy}
          >
            <LogOut size={17} aria-hidden="true" />
            تأكيد تسجيل الخروج
          </span>
          {busy && (
            <span className="logout-confirmation-pending" role="status">
              <LoaderCircle size={17} aria-hidden="true" />
              جارٍ تسجيل الخروج…
            </span>
          )}
        </button>
        <button
          ref={cancelRef}
          type="button"
          className="logout-confirmation-cancel"
          disabled={busy}
          onClick={close}
        >
          البقاء في اللوحة
        </button>
      </div>
    </dialog>
  );
}
