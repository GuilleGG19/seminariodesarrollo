// Usuarios del personal (solo administrador).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Power } from 'lucide-react';
import { usuarios } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { useAuth } from '../auth/AuthContext';
import { useMutacion } from '../hooks/utiles';
import { CajaError, EncabezadoPagina, Insignia, Tarjeta } from '../components/ui/Elementos';
import { Entrada, Selector } from '../components/ui/Campos';
import { Tabla } from '../components/ui/Tabla';
import { Modal } from '../components/ui/Modal';
import Boton from '../components/ui/Boton';
import { dia } from '../utils/formato';
import { ROLES } from '../utils/roles';

const AYUDA_PASSWORD = 'Mínimo 8 caracteres, con letras y números';

function FormUsuario({ abierto, alCerrar, usuario }) {
  const { data: roles = [] } = useQuery({ queryKey: ['usuarios', 'roles'], queryFn: usuarios.roles, enabled: abierto });
  const [v, setV] = useState({ nombre_completo: '', correo: '', rol_id: '', password: '' });
  useEffect(() => {
    if (abierto) setV({ nombre_completo: usuario?.nombre_completo || '', correo: usuario?.correo || '', rol_id: usuario?.rol_id || '', password: '' });
  }, [abierto, usuario]);

  const guardar = useMutacion(
    ({ password, ...datos }) => (usuario ? usuarios.actualizar(usuario.id, datos) : usuarios.crear({ ...datos, password })),
    { exito: usuario ? 'Usuario actualizado' : 'Usuario creado', invalidar: [['usuarios']], alExito: alCerrar }
  );
  const cambiar = (campo) => (e) => setV((x) => ({ ...x, [campo]: e.target.value }));

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={usuario ? 'Editar usuario' : 'Nuevo usuario'}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-usuario" cargando={guardar.isPending}>Guardar</Boton>
        </>
      }
    >
      <form id="form-usuario" className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar.mutate(v); }}>
        <Entrada etiqueta="Nombre completo" value={v.nombre_completo} onChange={cambiar('nombre_completo')} required maxLength={150} />
        <Entrada etiqueta="Correo" type="email" value={v.correo} onChange={cambiar('correo')} required maxLength={150} />
        <Selector etiqueta="Rol" value={v.rol_id} onChange={cambiar('rol_id')} vacio="Selecciona…" required opciones={roles.map((r) => ({ valor: r.id, texto: ROLES[r.nombre] || r.nombre }))} />
        {!usuario && <Entrada etiqueta="Contraseña inicial" type="password" autoComplete="new-password" value={v.password} onChange={cambiar('password')} required minLength={8} ayuda={AYUDA_PASSWORD} />}
      </form>
    </Modal>
  );
}

function FormPassword({ usuario, alCerrar }) {
  const [password, setPassword] = useState('');
  const guardar = useMutacion(() => usuarios.asignarPassword(usuario.id, password), { exito: (r) => r.mensaje, alExito: alCerrar });
  return (
    <Modal
      abierto={Boolean(usuario)}
      alCerrar={alCerrar}
      titulo="Asignar contraseña"
      descripcion={usuario?.nombre_completo}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-pass" cargando={guardar.isPending}>Guardar</Boton>
        </>
      }
    >
      <form id="form-pass" onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}>
        <Entrada etiqueta="Nueva contraseña" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} ayuda={`${AYUDA_PASSWORD}. Se cerrarán sus sesiones abiertas.`} />
      </form>
    </Modal>
  );
}

export default function Usuarios() {
  const { usuario: yo } = useAuth();
  const [form, setForm] = useState({ abierto: false, usuario: null });
  const [passwordPara, setPasswordPara] = useState(null);
  const { data = [], isLoading, error, refetch } = useQuery({ queryKey: ['usuarios'], queryFn: usuarios.listar });

  const cambiarEstado = useMutacion(({ id, estado }) => usuarios.cambiarEstado(id, estado), {
    exito: (u) => `${u.nombre_completo} quedó ${u.estado}`,
    invalidar: [['usuarios']],
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Personal con acceso al sistema"
        acciones={<Boton icono={Plus} onClick={() => setForm({ abierto: true, usuario: null })}>Nuevo usuario</Boton>}
      />
      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          <Tabla
            cargando={isLoading}
            filas={data}
            columnas={[
              { clave: 'nombre_completo', titulo: 'Nombre', render: (u) => (<><p className="font-medium text-slate-900">{u.nombre_completo}{u.id === yo.id && <span className="text-xs text-slate-500"> (tú)</span>}</p><p className="text-xs text-slate-500">{u.correo}</p></>) },
              { clave: 'rol', titulo: 'Rol', render: (u) => ROLES[u.rol] || u.rol },
              { clave: 'estado', titulo: 'Estado', render: (u) => <Insignia tono={u.estado === 'activo' ? 'verde' : 'gris'}>{u.estado === 'activo' ? 'Activo' : 'Inactivo'}</Insignia> },
              { clave: 'fecha_creacion', titulo: 'Desde', render: (u) => dia(u.fecha_creacion), className: 'hidden md:table-cell' },
              {
                clave: 'acciones',
                titulo: <span className="sr-only">Acciones</span>,
                className: 'text-right',
                render: (u) => (
                  <div className="flex justify-end gap-1">
                    <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={() => setForm({ abierto: true, usuario: u })} aria-label={`Editar ${u.nombre_completo}`} />
                    <Boton variante="fantasma" tamano="sm" icono={KeyRound} onClick={() => setPasswordPara(u)} aria-label={`Asignar contraseña a ${u.nombre_completo}`} />
                    {u.id !== yo.id && (
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        icono={Power}
                        onClick={() => cambiarEstado.mutate({ id: u.id, estado: u.estado === 'activo' ? 'inactivo' : 'activo' })}
                        aria-label={u.estado === 'activo' ? `Desactivar a ${u.nombre_completo}` : `Activar a ${u.nombre_completo}`}
                        title={u.estado === 'activo' ? 'Desactivar' : 'Activar'}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Tarjeta>
      )}
      <FormUsuario abierto={form.abierto} usuario={form.usuario} alCerrar={() => setForm({ abierto: false, usuario: null })} />
      <FormPassword usuario={passwordPara} alCerrar={() => setPasswordPara(null)} />
    </>
  );
}
