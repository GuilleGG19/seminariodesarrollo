// Padres y tutores (seccion 3.2). El DPI llega enmascarado en el listado y
// completo solo al abrir el detalle (el backend lo guarda cifrado).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Mail, Pencil, Plus, Send, Trash2, Baby } from 'lucide-react';
import { padres } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import { useAuth } from '../../auth/AuthContext';
import { useMutacion, useRetrasado } from '../../hooks/utiles';
import { useComunidades } from '../../hooks/catalogos';
import { CajaError, Dato, EncabezadoPagina, Insignia, Tarjeta } from '../../components/ui/Elementos';
import { Buscador, Entrada, Selector } from '../../components/ui/Campos';
import { Tabla, Paginacion } from '../../components/ui/Tabla';
import { Modal, Confirmar } from '../../components/ui/Modal';
import { CargandoBloque } from '../../components/ui/Cargando';
import Boton from '../../components/ui/Boton';
import FormNino from '../ninos/FormNino';
import { fecha, sexo } from '../../utils/formato';

const VACIO = { comunidad_id: '', nombre_completo: '', dpi: '', telefono: '', correo: '', canal_preferido: 'Email', telegram_chat_id: '' };

function Canal({ canal }) {
  return canal === 'Telegram' ? <Insignia tono="azul" icono={Send}>Telegram</Insignia> : <Insignia icono={Mail}>Email</Insignia>;
}

function FormPadre({ abierto, alCerrar, padre }) {
  const { opciones } = useComunidades();
  const [v, setV] = useState(VACIO);

  useEffect(() => {
    if (abierto) {
      setV(padre ? Object.fromEntries(Object.keys(VACIO).map((k) => [k, padre[k] ?? ''])) : VACIO);
    }
  }, [abierto, padre]);

  const guardar = useMutacion((cuerpo) => (padre ? padres.actualizar(padre.id, cuerpo) : padres.crear(cuerpo)), {
    exito: padre ? 'Datos actualizados' : 'Padre o tutor registrado',
    invalidar: [['padres'], ['ninos'], ['dashboard']],
    alExito: alCerrar,
  });

  const cambiar = (campo) => (e) => setV((x) => ({ ...x, [campo]: e.target.value }));

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={padre ? 'Editar padre o tutor' : 'Registrar padre o tutor'}
      ancho="lg"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-padre" cargando={guardar.isPending}>Guardar</Boton>
        </>
      }
    >
      <form
        id="form-padre"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate(v);
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Entrada etiqueta="Nombre completo" value={v.nombre_completo} onChange={cambiar('nombre_completo')} maxLength={150} required className="sm:col-span-2" />
        <Entrada etiqueta="DPI" value={v.dpi} onChange={cambiar('dpi')} inputMode="numeric" placeholder="13 dígitos" required ayuda="Documento Personal de Identificación" />
        <Selector etiqueta="Comunidad" value={v.comunidad_id} onChange={cambiar('comunidad_id')} vacio="Selecciona…" opciones={opciones} required />
        <Entrada etiqueta="Teléfono" type="tel" value={v.telefono} onChange={cambiar('telefono')} placeholder="5555 1234" />
        <Entrada etiqueta="Correo electrónico" type="email" value={v.correo} onChange={cambiar('correo')} required={v.canal_preferido === 'Email'} />
        <Selector
          etiqueta="Canal preferido de notificación"
          value={v.canal_preferido}
          onChange={cambiar('canal_preferido')}
          opciones={[
            { valor: 'Email', texto: 'Correo electrónico' },
            { valor: 'Telegram', texto: 'Telegram' },
          ]}
        />
        <Entrada
          etiqueta="Chat ID de Telegram"
          value={v.telegram_chat_id}
          onChange={cambiar('telegram_chat_id')}
          inputMode="numeric"
          required={v.canal_preferido === 'Telegram'}
          ayuda="Solo si el canal es Telegram (número que da el bot del centro)"
        />
        <p className="text-xs text-slate-500 sm:col-span-2">El DPI, el teléfono y el correo se guardan cifrados.</p>
      </form>
    </Modal>
  );
}

function DetallePadre({ id, alCerrar, alEditar, alAgregarNino }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['padres', id], queryFn: () => padres.obtener(id), enabled: Boolean(id) });
  return (
    <Modal abierto={Boolean(id)} alCerrar={alCerrar} titulo={data?.nombre_completo || 'Padre o tutor'} ancho="lg"
      pie={data && (
        <>
          <Boton variante="secundario" icono={Baby} onClick={() => alAgregarNino(data)}>Registrar hijo/a</Boton>
          <Boton icono={Pencil} onClick={() => alEditar(data)}>Editar</Boton>
        </>
      )}
    >
      {isLoading && <CargandoBloque />}
      {error && <CajaError mensaje={mensajeError(error)} />}
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etiqueta="DPI"><span className="tabular">{data.dpi}</span></Dato>
            <Dato etiqueta="Teléfono">{data.telefono}</Dato>
            <Dato etiqueta="Correo">{data.correo}</Dato>
            <Dato etiqueta="Comunidad">{data.comunidad}</Dato>
            <Dato etiqueta="Canal de avisos"><Canal canal={data.canal_preferido} /></Dato>
            {data.telegram_chat_id && <Dato etiqueta="Chat de Telegram">{data.telegram_chat_id}</Dato>}
          </dl>
          <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-800">Hijos e hijas ({data.ninos.length})</h3>
          {data.ninos.length === 0 ? (
            <p className="text-sm text-slate-500">No tiene niños registrados.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {data.ninos.map((n) => (
                <li key={n.id}>
                  <Link to={`/ninos/${n.id}`} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-marca-50">
                    <span className="font-medium text-marca-700">{n.nombre}</span>
                    <span className="text-xs text-slate-500">{sexo(n.sexo)} · {fecha(n.fecha_nacimiento)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

export default function Padres() {
  const { tiene } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const [buscar, setBuscar] = useState('');
  const [comunidadId, setComunidadId] = useState('');
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState({ abierto: false, padre: null });
  const [borrar, setBorrar] = useState(null);
  const [ninoPara, setNinoPara] = useState(null);
  const { opciones } = useComunidades();
  const busqueda = useRetrasado(buscar.trim());
  const verId = parametros.get('ver');

  const filtros = { buscar: busqueda, comunidad_id: comunidadId, pagina, limite: 25 };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['padres', filtros],
    queryFn: () => padres.listar(filtros),
    placeholderData: (anterior) => anterior,
  });

  const eliminar = useMutacion((id) => padres.eliminar(id), {
    exito: 'Padre o tutor eliminado',
    invalidar: [['padres']],
    alExito: () => setBorrar(null),
  });

  const ver = (id) => setParametros(id ? { ver: id } : {}, { replace: true });

  return (
    <>
      <EncabezadoPagina
        titulo="Padres y tutores"
        descripcion="Datos de contacto y canal preferido para los avisos"
        acciones={<Boton icono={Plus} onClick={() => setForm({ abierto: true, padre: null })}>Registrar padre o tutor</Boton>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Buscador
          valor={buscar}
          alCambiar={(t) => {
            setBuscar(t);
            setPagina(1);
          }}
          placeholder="Nombre o DPI completo"
          className="w-full sm:w-72"
        />
        <Selector
          aria-label="Comunidad"
          value={comunidadId}
          onChange={(e) => {
            setComunidadId(e.target.value);
            setPagina(1);
          }}
          vacio="Todas las comunidades"
          opciones={opciones}
          className="w-full sm:w-56"
        />
      </div>

      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          <Tabla
            cargando={isLoading || isFetching}
            filas={data?.datos}
            vacio="No se encontraron padres o tutores"
            alClicFila={(p) => ver(p.id)}
            columnas={[
              { clave: 'nombre_completo', titulo: 'Nombre', render: (p) => <span className="font-medium text-slate-900">{p.nombre_completo}</span> },
              { clave: 'dpi', titulo: 'DPI', render: (p) => <span className="tabular">{p.dpi}</span>, className: 'hidden sm:table-cell' },
              { clave: 'telefono', titulo: 'Teléfono', className: 'hidden md:table-cell' },
              { clave: 'canal_preferido', titulo: 'Avisos', render: (p) => <Canal canal={p.canal_preferido} />, className: 'hidden md:table-cell' },
              { clave: 'comunidad', titulo: 'Comunidad', className: 'hidden lg:table-cell' },
              { clave: 'total_ninos', titulo: 'Niños', render: (p) => <span className="tabular">{p.total_ninos}</span> },
              {
                clave: 'acciones',
                titulo: <span className="sr-only">Acciones</span>,
                className: 'text-right',
                render: (p) =>
                  tiene('administrador') && (
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      icono={Trash2}
                      onClick={(e) => {
                        e.stopPropagation();
                        setBorrar(p);
                      }}
                      aria-label={`Eliminar a ${p.nombre_completo}`}
                    />
                  ),
              },
            ]}
          />
          <Paginacion datos={data} alCambiar={setPagina} />
        </Tarjeta>
      )}

      <DetallePadre
        id={verId}
        alCerrar={() => ver(null)}
        alEditar={(p) => setForm({ abierto: true, padre: p })}
        alAgregarNino={(p) => setNinoPara(p)}
      />
      <FormPadre abierto={form.abierto} padre={form.padre} alCerrar={() => setForm({ abierto: false, padre: null })} />
      <FormNino abierto={Boolean(ninoPara)} padreInicial={ninoPara} alCerrar={() => setNinoPara(null)} />
      <Confirmar
        abierto={Boolean(borrar)}
        alCerrar={() => setBorrar(null)}
        alConfirmar={() => eliminar.mutate(borrar.id)}
        cargando={eliminar.isPending}
        titulo="Eliminar padre o tutor"
        textoConfirmar="Eliminar"
        mensaje={borrar ? `Se eliminará a ${borrar.nombre_completo}. Solo es posible si no tiene niños asociados.` : ''}
      />
    </>
  );
}

