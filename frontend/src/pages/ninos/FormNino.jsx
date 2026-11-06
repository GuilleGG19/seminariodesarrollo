// Formulario para registrar o editar un nino.
import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import Boton from '../../components/ui/Boton';
import { Entrada, Selector } from '../../components/ui/Campos';
import SelectorPadre from '../../components/SelectorPadre';
import { ninos } from '../../api/recursos';
import { useMutacion } from '../../hooks/utiles';
import { hoy } from '../../utils/formato';

// nino: null para registrar; objeto del nino para editar. padreInicial: padre preseleccionado.
export default function FormNino({ abierto, alCerrar, nino, padreInicial, alGuardar }) {
  const [valores, setValores] = useState({ nombre: '', fecha_nacimiento: '', sexo: '' });
  const [padre, setPadre] = useState(null);

  useEffect(() => {
    if (!abierto) return;
    setValores({
      nombre: nino?.nombre || '',
      fecha_nacimiento: nino?.fecha_nacimiento || '',
      sexo: nino?.sexo || '',
    });
    setPadre(nino ? { id: nino.padre_id, nombre_completo: nino.padre, comunidad: nino.comunidad } : padreInicial || null);
  }, [abierto, nino, padreInicial]);

  const guardar = useMutacion(
    (cuerpo) => (nino ? ninos.actualizar(nino.id, cuerpo) : ninos.crear(cuerpo)),
    {
      exito: nino ? 'Datos del niño actualizados' : 'Niño registrado',
      invalidar: [['ninos'], ['dashboard'], ['padres']],
      alExito: (resultado) => {
        alCerrar();
        alGuardar?.(resultado);
      },
    }
  );

  const enviar = (e) => {
    e.preventDefault();
    if (!padre) return;
    guardar.mutate({ ...valores, padre_id: padre.id });
  };

  const cambiar = (campo) => (e) => setValores((v) => ({ ...v, [campo]: e.target.value }));

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={nino ? 'Editar niño' : 'Registrar niño'}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-nino" cargando={guardar.isPending} disabled={!padre}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="form-nino" onSubmit={enviar} className="space-y-4">
        <Entrada etiqueta="Nombre completo" value={valores.nombre} onChange={cambiar('nombre')} maxLength={150} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada
            etiqueta="Fecha de nacimiento"
            type="date"
            value={valores.fecha_nacimiento}
            onChange={cambiar('fecha_nacimiento')}
            max={hoy()}
            required
          />
          <Selector
            etiqueta="Sexo"
            value={valores.sexo}
            onChange={cambiar('sexo')}
            vacio="Selecciona…"
            opciones={[
              { valor: 'F', texto: 'Femenino' },
              { valor: 'M', texto: 'Masculino' },
            ]}
            required
            ayuda="Se usa para elegir las tablas de la OMS"
          />
        </div>
        <SelectorPadre valor={padre} alCambiar={setPadre} required />
      </form>
    </Modal>
  );
}
