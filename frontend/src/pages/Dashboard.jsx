// Inicio: indicadores generales del centro (GET /api/dashboard).
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, Baby, CalendarClock, ClipboardList, Ruler, ShieldCheck, Syringe, ArrowRight, Send } from 'lucide-react';
import { dashboard } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { useComunidades } from '../hooks/catalogos';
import { useAuth } from '../auth/AuthContext';
import { EncabezadoPagina, Tarjeta, CajaError } from '../components/ui/Elementos';
import { Selector } from '../components/ui/Campos';
import { CargandoPagina } from '../components/ui/Cargando';
import GraficaTendencia from '../components/graficas/GraficaTendencia';
import BarrasHorizontales from '../components/graficas/BarrasHorizontales';
import { numero, TIPOS_ALERTA } from '../utils/formato';

function Indicador({ icono: Icono, titulo, valor, detalle, enlace, alerta }) {
  const contenido = (
    <div className={`h-full rounded-xl bg-white p-4 shadow-xs ring-1 ${alerta ? 'ring-red-200' : 'ring-slate-200'} ${enlace ? 'transition hover:ring-marca-200' : ''}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icono className={`size-4 ${alerta ? 'text-red-600' : 'text-marca-500'}`} aria-hidden />
        {titulo}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
  return enlace ? <Link to={enlace} className="block">{contenido}</Link> : contenido;
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const [comunidadId, setComunidadId] = useState('');
  const { opciones } = useComunidades();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard', comunidadId],
    queryFn: () => dashboard.resumen({ comunidad_id: comunidadId }),
    placeholderData: (anterior) => anterior, // mantiene la vista mientras recarga
  });

  if (isLoading) return <CargandoPagina />;
  if (error) return <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />;

  const { totales, alertas_abiertas: alertas, estado_nutricional_menores_5: nutricion, vacunacion, notificaciones } = data;
  const primerNombre = usuario.nombre_completo.split(' ')[0];

  return (
    <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <EncabezadoPagina
        titulo={`Hola, ${primerNombre}`}
        descripcion="Resumen del control de crecimiento y vacunación"
      />

      {/* Filtros: una fila, arriba de todo, y afectan a todos los indicadores */}
      <div className="mb-5 flex flex-wrap gap-3">
        <Selector
          aria-label="Comunidad"
          value={comunidadId}
          onChange={(e) => setComunidadId(e.target.value)}
          vacio="Todas las comunidades"
          opciones={opciones}
          className="w-full sm:w-64"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador icono={Baby} titulo="Niños menores de 5 años" valor={numero(totales.ninos_menores_5)} detalle={`${numero(totales.ninos)} registrados en total`} enlace="/ninos" />
        <Indicador
          icono={AlertOctagon}
          titulo="Alertas críticas abiertas"
          valor={numero(alertas.criticas)}
          detalle={`${numero(alertas.preventivas)} preventivas`}
          enlace="/alertas"
          alerta={alertas.criticas > 0}
        />
        <Indicador
          icono={ShieldCheck}
          titulo="Esquema de vacunación al día"
          valor={vacunacion.pct_esquema_al_dia === null ? '—' : `${numero(vacunacion.pct_esquema_al_dia, 1)}%`}
          detalle={`${numero(vacunacion.esquema_al_dia)} de ${numero(vacunacion.ninos_en_esquema)} niños menores de 7 años`}
        />
        <Indicador icono={CalendarClock} titulo="Sin control reciente" valor={numero(totales.ninos_sin_control_reciente)} detalle="Mensual hasta 2 años, trimestral hasta 5" />
        <Indicador icono={Ruler} titulo="Mediciones este mes" valor={numero(totales.mediciones_mes)} />
        <Indicador icono={Syringe} titulo="Dosis aplicadas este mes" valor={numero(totales.dosis_aplicadas_mes)} />
        <Indicador icono={ClipboardList} titulo="Dosis atrasadas" valor={numero(vacunacion.dosis_atrasadas)} detalle={`${numero(vacunacion.dosis_proximos_30_dias)} tocan en los próximos 30 días`} />
        <Indicador
          icono={Send}
          titulo="Avisos a padres"
          valor={numero(notificaciones.enviadas_30_dias)}
          detalle={`enviados en 30 días · ${numero(notificaciones.fallidas)} fallidos`}
          enlace="/notificaciones"
          alerta={notificaciones.fallidas > 0}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <GraficaTendencia
            titulo="Actividad de los últimos 6 meses"
            subtitulo="Número de registros por mes"
            datos={data.tendencia_6_meses}
            series={[
              { clave: 'mediciones', texto: 'Mediciones' },
              { clave: 'dosis_aplicadas', texto: 'Dosis aplicadas' },
              { clave: 'alertas_generadas', texto: 'Alertas generadas' },
            ]}
          />
        </div>
        <div className="lg:col-span-2">
          <BarrasHorizontales
            titulo="Estado nutricional"
            subtitulo="Menores de 5 años, según su última medición"
            filas={[
              { etiqueta: 'Peso normal', valor: nutricion.normal },
              { etiqueta: 'Bajo peso (P < 5)', valor: nutricion.bajo_peso },
              { etiqueta: 'Sobrepeso (P > 95)', valor: nutricion.sobrepeso },
              { etiqueta: 'Talla baja (P < 5)', valor: nutricion.talla_baja },
              { etiqueta: 'Sin mediciones', valor: nutricion.sin_medicion },
            ]}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <BarrasHorizontales
            titulo="Cobertura por comunidad"
            subtitulo="Porcentaje de niños menores de 7 años con el esquema al día"
            maximo={100}
            sufijo="%"
            filas={data.por_comunidad.map((c) => ({
              etiqueta: c.nombre,
              valor: c.pct_esquema_al_dia,
              detalle: `${c.esquema_al_dia} de ${c.ninos_en_esquema} niños · ${c.alertas_criticas} alertas críticas`,
            }))}
            vacio="No hay comunidades registradas"
          />
        </div>
        <div className="lg:col-span-2">
          <Tarjeta
            titulo="Alertas abiertas por tipo"
            acciones={
              <Link to="/alertas" className="flex items-center gap-1 text-xs font-medium text-marca-600 hover:underline">
                Ver todas <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            {alertas.total === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No hay alertas abiertas.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {Object.entries(alertas.por_tipo)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tipo, total]) => (
                    <li key={tipo}>
                      <Link to={`/alertas?tipo=${tipo}`} className="flex items-center justify-between py-2 text-sm hover:text-marca-700">
                        <span className="text-slate-600">{TIPOS_ALERTA[tipo] || tipo}</span>
                        <span className="tabular font-semibold text-slate-900">{numero(total)}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
