interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  confirmDanger?: boolean;
  allowDecimal?: boolean;
  maxLength?: number;
}

/** Teclado numérico grande (botones >= 56x56 px). Sin gestos complejos. */
export function NumericKeypad({
  value,
  onChange,
  onConfirm,
  confirmLabel = 'Aceptar',
  confirmDisabled = false,
  confirmDanger = false,
  allowDecimal = true,
  maxLength = 12,
}: NumericKeypadProps) {
  const press = (digit: string) => {
    if (value.length >= maxLength) return;
    if (digit === '.' && value.includes('.')) return;
    onChange(value + digit);
  };
  const backspace = () => onChange(value.slice(0, -1));
  const clear = () => onChange('');

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="btn btn-neutral py-4 text-3xl"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => (allowDecimal ? press('.') : clear())}
          className="btn btn-neutral py-4 text-3xl"
          aria-label={allowDecimal ? 'Punto decimal' : 'Borrar todo'}
        >
          {allowDecimal ? '.' : 'C'}
        </button>
        <button type="button" onClick={() => press('0')} className="btn btn-neutral py-4 text-3xl">
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          className="btn btn-neutral py-4 text-3xl"
          aria-label="Borrar"
        >
          ⌫
        </button>
      </div>
      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className={`btn py-5 text-2xl text-white ${
            confirmDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
          } ${confirmDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
        >
          {confirmLabel}
        </button>
      )}
    </div>
  );
}
