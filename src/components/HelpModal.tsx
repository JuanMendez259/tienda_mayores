import { useId, useState } from 'react';
import { useModalA11y } from '../lib/useModalA11y';

interface HelpModalProps {
  onClose: () => void;
}

interface Guide {
  id: string;
  icon: string;
  title: string;
  steps: string[];
}

const GUIDES: Guide[] = [
  {
    id: 'cobrar',
    icon: '🛒',
    title: 'Cobrar una venta',
    steps: [
      'Toca los productos en la cuadrícula para agregarlos.',
      'Para productos a granel escribe cuántos kilos o litros pesaste.',
      'Usa los botones + y − para cambiar cantidades.',
      'Si hay una promoción, se aplica sola. Para un descuento manual toca “Descuento”; puede pedir autorización.',
      'Toca el botón verde “Cobrar”, elige efectivo, Clip, Mercado Pago o fiado y confirma.',
    ],
  },
  {
    id: 'producto',
    icon: '➕',
    title: 'Agregar un producto nuevo',
    steps: [
      'En la pantalla de venta toca “Nuevo / Manual”.',
      'Escribe el nombre y el precio; elige pieza, kilo o litro.',
      'Puedes tomar una foto desde el celular con “📷 Cargar fotos”.',
      'Guarda; el producto queda disponible de inmediato.',
    ],
  },
  {
    id: 'corte',
    icon: '💵',
    title: 'Corte de caja',
    steps: [
      'Toca “Caja” en la barra superior.',
      'Revisa las ventas, entradas y salidas del turno.',
      'Cuenta el dinero físico y escríbelo en “Efectivo contado”.',
      'Confirma el corte; verás la diferencia si la hay.',
    ],
  },
  {
    id: 'promos',
    icon: '🏷️',
    title: 'Promociones (2×1 o por cantidad)',
    steps: [
      'Entra a “Menú” → “Promociones”.',
      'Elige el producto y el tipo: 2×1 o descuento por cantidad.',
      'Guarda; el descuento se aplica solo al vender ese producto.',
    ],
  },
];

/** Ayuda visual paso a paso para las tareas más comunes (F-705). */
export function HelpModal({ onClose }: HelpModalProps) {
  const [guideId, setGuideId] = useState(GUIDES[0].id);
  const guide = GUIDES.find((g) => g.id === guideId) ?? GUIDES[0];
  const titleId = useId();
  const panelRef = useModalA11y(onClose);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="card max-h-[92dvh] w-full max-w-3xl overflow-y-auto p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="title mb-4 text-3xl">
          Ayuda
        </h2>

        <div className="mb-4 flex flex-wrap gap-2">
          {GUIDES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGuideId(item.id)}
              aria-pressed={guideId === item.id}
              className={`btn px-4 py-3 text-lg ${guideId === item.id ? 'btn-primary text-white' : 'btn-neutral'}`}
            >
              <span aria-hidden="true">{item.icon}</span> {item.title}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="mb-3 text-6xl" aria-hidden="true">
            {guide.icon}
          </p>
          <h3 className="mb-3 text-2xl font-extrabold">{guide.title}</h3>
          <ol className="space-y-3">
            {guide.steps.map((step, index) => (
              <li key={index} className="flex items-start gap-3 text-xl">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <button type="button" onClick={onClose} className="btn btn-primary mt-6 w-full py-4 text-xl text-white">
          Entendido
        </button>
      </div>
    </div>
  );
}
