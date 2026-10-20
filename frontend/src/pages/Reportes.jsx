// Reportes para el encargado del centro (seccion 3.9), con exportacion a PDF y Excel.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { reportes } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { useComunidades, useVacunas } from '../hooks/catalogos';
import { CajaError, EncabezadoPagina, Tarjeta } from '../components/ui/Elementos';
import { Selector } from '../components/ui/Campos';
import { Tabla } from '../components/ui/Tabla';
import Boton from '../components/ui/Boton';
import { fecha, numero } from '../utils/formato';

const REPORTES = [
  { clave: 'bajo_peso', ruta: 'ninos-riesgo', texto: 'Niños con bajo peso', params: { tipo: 'bajo_peso' } },
  { clave: 'sobrepeso', ruta: 'ninos-riesgo', texto: 'Niños con sobrepeso', params: { tipo: 'sobrepeso' } },
  { clave: 'talla_baja', ruta: 'ninos-riesgo', texto: 'Niños con talla baja', params: { tipo: 'talla_baja' } },
  { clave: 'vacunas_incompletas', ruta: 'ninos-riesgo', texto: 'Niños con vacunas incompletas', params: { tipo: 'vacunas_incompletas' } },
  { clave: 'cobertura', ruta: 'cobertura-vacunacion', texto: 'Cobertura de vacunación por comunidad', params: {}, conVacuna: true },
  { clave: 'crecimiento', ruta: 'crecimiento-promedio', texto: 'Crecimiento promedio por región', params: {} },
];

// Da formato a cada celda segun el nombre de la columna
function formatear(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (clave.startsWith('fecha')) return fecha(valor);
  if (clave.startsWith('pct_')) return `${numero(valor, 1)}%`;
  if (typeof valor === 'number') return <span className="tabular">{numero(valor, Number.isInteger(valor) ? 0 : 2)}</span>;
  return valor;
}

export default function Reportes() {
  const [seleccion, setSeleccion] = useState(REPORTES[0].clave);
  const [comunidadId, setComunidadId] = useState('');
  const [vacunaId, setVacunaId] = useState('');
  const [descargando, setDescargando] = useState(null);
  const { opciones: comunidades } = useComunidades();
  const { opciones: vacunas } = useVacunas();

  const reporte = REPORTES.find((r) => r.clave === seleccion);
  const params = { ...reporte.params, comunidad_id: comunidadId, ...(reporte.conVacuna ? { vacuna_id: vacunaId } : {}) };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['reportes', reporte.ruta, params],
    queryFn: () => reportes.obtener(reporte.ruta, params),
    placeholderData: (anterior) => anterior,
  });

  const descargar = async (formato) => {
    setDescargando(formato);
    try {
      await reportes.descargar(reporte.ruta, params, formato);
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setDescargando(null);
    }
  };

  return (
    <>
      <EncabezadoPagina titulo="Reportes" descripcion="Consulta en pantalla o descarga en PDF y Excel" />

      <div className="mb-4 flex flex-wrap gap-3">
        <Selector aria-label="Reporte" value={seleccion} onChange={(e) => setSeleccion(e.target.value)} opciones={REPORTES.map((r) => ({ valor: r.clave, texto: r.texto }))} className="w-full sm:w-80" />
        <Selector aria-label="Comunidad" value={comunidadId} onChange={(e) => setComunidadId(e.target.value)} vacio="Todas las comunidades" opciones={comunidades} className="w-full sm:w-56" />
        {reporte.conVacuna && (
          <Selector aria-label="Vacuna" value={vacunaId} onChange={(e) => setVacunaId(e.target.value)} vacio="Todas las vacunas" opciones={vacunas} className="w-full sm:w-56" />
        )}
      </div>

      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta
          titulo={data?.titulo || reporte.texto}
          sinRelleno
          acciones={
            <>
              <Boton variante="secundario" tamano="sm" icono={FileText} onClick={() => descargar('pdf')} cargando={descargando === 'pdf'}>PDF</Boton>
              <Boton variante="secundario" tamano="sm" icono={FileSpreadsheet} onClick={() => descargar('xlsx')} cargando={descargando === 'xlsx'}>Excel</Boton>
            </>
          }
        >
          {data?.subtitulo && <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">{data.subtitulo}</p>}
          <Tabla
            cargando={isLoading || isFetching}
            filas={data?.filas}
            claveFila="__indice"
            vacio="No hay resultados para este reporte"
            columnas={(data?.columnas || []).map((c) => ({
              clave: c.clave,
              titulo: c.titulo,
              render: (fila) => formatear(c.clave, fila[c.clave]),
            }))}
          />
          {data?.filas?.length > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{data.filas.length} fila(s)</p>}
        </Tarjeta>
      )}
    </>
  );
}
