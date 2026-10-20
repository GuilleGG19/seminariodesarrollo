// Carnet digital para padres (seccion 3.7): se abre al escanear el QR y se
// desbloquea con el PIN de 6 digitos. No requiere cuenta. Los datos solo viven
// en la memoria de esta pagina (no se guardan en el navegador).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { AlertOctagon, HeartPulse, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { carnetPublico } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import Boton from '../../components/ui/Boton';
import { CargandoPagina } from '../../components/ui/Cargando';
import { EstadoDosis, NivelAlerta, Tarjeta } from '../../components/ui/Elementos';
import CurvaCrecimiento from '../../components/graficas/CurvaCrecimiento';
import { fecha, fechaHora, numero, sexo } from '../../utils/formato';

function Marco({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-marca-700 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <HeartPulse className="size-5" aria-hidden />
          <span className="text-sm font-semibold">Carnet de crecimiento y vacunación</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}

function IngresoPin({ token, bloqueado, alAcceder }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(bloqueado ? 'El carnet está bloqueado temporalmente por demasiados intentos. Intenta más tarde.' : '');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      alAcceder(await carnetPublico.acceder(token, pin));
    } catch (err) {
      setError(mensajeError(err));
      setPin('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mx-auto max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
      <Lock className="mx-auto size-10 text-marca-600" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Ingresa el PIN</h1>
      <p className="mt-1 text-sm text-slate-500">Es el número de 6 dígitos que te entregaron en el centro de salud junto con el código QR.</p>
      <label htmlFor="pin" className="sr-only">PIN de 6 dígitos</label>
      <input
        id="pin"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        autoFocus
        className="tabular mt-5 w-full rounded-xl border-0 py-3 text-center text-3xl tracking-[0.5em] ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-600"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'pin-error' : undefined}
      />
      {error && <p id="pin-error" role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <Boton type="submit" className="mt-5 w-full" cargando={enviando} disabled={pin.length !== 6}>Ver carnet</Boton>
    </form>
  );
}

function Carnet({ datos, alSalir }) {
  const { nino, crecimiento, vacunas, alertas, carnet } = datos;
  const ultima = crecimiento.mediciones[crecimiento.mediciones.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white p-5 shadow-xs ring-1 ring-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{nino.nombre}</h1>
          <p className="text-sm text-slate-500">{sexo(nino.sexo)} · nació el {fecha(nino.fecha_nacimiento)} · {nino.comunidad}</p>
          {ultima && (
            <p className="mt-2 text-sm text-slate-700">
              Último control: {fecha(ultima.fecha_medicion)} · <strong>{numero(ultima.peso_kg, 2)} kg</strong> · <strong>{numero(ultima.talla_cm, 1)} cm</strong>
            </p>
          )}
        </div>
        <Boton variante="secundario" icono={LogOut} onClick={alSalir}>Cerrar</Boton>
      </div>

      {alertas.length > 0 ? (
        <Tarjeta titulo="Avisos del centro de salud">
          <ul className="space-y-3">
            {alertas.map((a, i) => (
              <li key={i}>
                <NivelAlerta nivel={a.nivel} />
                <p className="mt-1 text-sm text-slate-700">{a.mensaje}</p>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <ShieldCheck className="size-5" aria-hidden /> No hay avisos pendientes.
        </div>
      )}

      <Tarjeta titulo="Vacunas" sinRelleno>
        {vacunas.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Aún no hay vacunas registradas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {vacunas.map((v, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{v.vacuna}</p>
                  <p className="text-xs text-slate-500">
                    Dosis {v.numero_dosis} de {v.dosis_total} ·{' '}
                    {v.fecha_aplicada ? `aplicada el ${fecha(v.fecha_aplicada)}` : `programada para el ${fecha(v.proxima_dosis)}`}
                  </p>
                </div>
                <EstadoDosis estado={v.estado} />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {crecimiento.mediciones.length > 0 && (
        <CurvaCrecimiento
          titulo="Peso para la edad"
          unidad="kg"
          alto={260}
          referencia={crecimiento.referencia.peso_edad}
          mediciones={crecimiento.mediciones.map((m) => ({ ...m, valor: m.peso_kg, percentil: m.percentil_peso }))}
        />
      )}

      <p className="text-center text-xs text-slate-500">Carnet válido hasta el {fechaHora(carnet.fecha_expiracion)}</p>
    </div>
  );
}

export default function CarnetPublico() {
  const { token } = useParams();
  const [estado, setEstado] = useState({ fase: 'verificando' });

  useEffect(() => {
    // Evita que el token del QR se filtre a otros sitios por el encabezado Referer
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    carnetPublico
      .estado(token)
      .then((r) => setEstado({ fase: 'pin', bloqueado: r.bloqueado }))
      .catch((err) => setEstado({ fase: 'error', mensaje: mensajeError(err) }));
  }, [token]);

  if (estado.fase === 'verificando') return <CargandoPagina />;

  return (
    <Marco>
      {estado.fase === 'error' && (
        <div className="mx-auto max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <AlertOctagon className="mx-auto size-10 text-slate-400" aria-hidden />
          <p className="mt-3 text-sm text-slate-700">{estado.mensaje}</p>
        </div>
      )}
      {estado.fase === 'pin' && <IngresoPin token={token} bloqueado={estado.bloqueado} alAcceder={(datos) => setEstado({ fase: 'carnet', datos })} />}
      {estado.fase === 'carnet' && <Carnet datos={estado.datos} alSalir={() => setEstado({ fase: 'pin' })} />}
    </Marco>
  );
}
