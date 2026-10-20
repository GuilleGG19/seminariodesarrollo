// Exporta un reporte (ver reporte.service.js) a Excel o PDF y lo envia como descarga.
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const TIPOS = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

const texto = (valor) => (valor === null || valor === undefined || valor === '' ? '-' : String(valor));

function cabeceras(res, formato, nombreArchivo) {
  res.set({
    'Content-Type': TIPOS[formato],
    'Content-Disposition': `attachment; filename="${nombreArchivo}.${formato}"`,
    'Cache-Control': 'no-store',
  });
}

// ---------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------
async function enviarExcel(res, reporte, nombreArchivo) {
  const { titulo, subtitulo, columnas, filas } = reporte;
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SCCVI';
  libro.created = new Date();

  // El nombre de una hoja admite maximo 31 caracteres y no puede llevar : \ / ? * [ ]
  const hoja = libro.addWorksheet(titulo.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31));
  const n = columnas.length;

  hoja.addRow([titulo]).font = { bold: true, size: 14 };
  hoja.addRow([subtitulo]).font = { italic: true, color: { argb: 'FF555555' } };
  hoja.addRow([]);
  if (n > 1) {
    hoja.mergeCells(1, 1, 1, n);
    hoja.mergeCells(2, 1, 2, n);
  }

  const filaEncabezado = hoja.addRow(columnas.map((c) => c.titulo));
  filaEncabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  filaEncabezado.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    celda.alignment = { vertical: 'middle', wrapText: true };
  });

  for (const fila of filas) {
    hoja.addRow(columnas.map((c) => (fila[c.clave] === undefined || fila[c.clave] === null ? '' : fila[c.clave])));
  }

  // Ancho de cada columna segun su contenido (con un tope)
  columnas.forEach((c, i) => {
    const mayor = filas.reduce((max, fila) => Math.max(max, texto(fila[c.clave]).length), c.titulo.length);
    hoja.getColumn(i + 1).width = Math.min(Math.max(mayor + 5, 12), 60);
  });

  hoja.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };
  hoja.views = [{ state: 'frozen', ySplit: 4 }];

  cabeceras(res, 'xlsx', nombreArchivo);
  await libro.xlsx.write(res);
  res.end();
}

// ---------------------------------------------------------------------
// PDF (tabla dibujada a mano, horizontal, con encabezado repetido en cada pagina)
// ---------------------------------------------------------------------
function enviarPdf(res, reporte, nombreArchivo) {
  const { titulo, subtitulo, columnas, filas } = reporte;
  const margen = 36;
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: margen,
    bufferPages: true,
    info: { Title: titulo, Author: 'SCCVI' },
  });

  cabeceras(res, 'pdf', nombreArchivo);
  doc.pipe(res);

  const anchoUtil = doc.page.width - margen * 2;
  const sumaPesos = columnas.reduce((suma, c) => suma + (c.ancho || 1), 0);
  const anchos = columnas.map((c) => ((c.ancho || 1) / sumaPesos) * anchoUtil);
  const relleno = 4;
  const limiteInferior = () => doc.page.height - margen - 20; // deja espacio para el pie de pagina

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1F4E79').text(titulo, margen, margen);
  doc.font('Helvetica').fontSize(9).fillColor('#555555').text(subtitulo, margen, doc.y + 2);
  doc.moveDown(0.8);

  function dibujarEncabezado() {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(8);
    const alto =
      Math.max(...columnas.map((c, i) => doc.heightOfString(c.titulo, { width: anchos[i] - relleno * 2 }))) +
      relleno * 2;
    doc.rect(margen, y, anchoUtil, alto).fill('#1F4E79');
    let x = margen;
    columnas.forEach((c, i) => {
      doc.fillColor('#FFFFFF').text(c.titulo, x + relleno, y + relleno, { width: anchos[i] - relleno * 2 });
      x += anchos[i];
    });
    doc.y = y + alto;
  }

  if (filas.length === 0) {
    doc.font('Helvetica').fontSize(11).fillColor('#333333').text('No hay resultados para este reporte.', margen, doc.y + 10);
  } else {
    dibujarEncabezado();
    doc.font('Helvetica').fontSize(8);

    filas.forEach((fila, numero) => {
      const celdas = columnas.map((c) => texto(fila[c.clave]));
      const alto =
        Math.max(...celdas.map((t, i) => doc.heightOfString(t, { width: anchos[i] - relleno * 2 }))) + relleno * 2;

      if (doc.y + alto > limiteInferior()) {
        doc.addPage();
        doc.y = margen;
        dibujarEncabezado();
        doc.font('Helvetica').fontSize(8);
      }

      const y = doc.y;
      if (numero % 2 === 0) {
        doc.rect(margen, y, anchoUtil, alto).fill('#F2F6FA');
      }
      let x = margen;
      celdas.forEach((t, i) => {
        doc.fillColor('#222222').text(t, x + relleno, y + relleno, { width: anchos[i] - relleno * 2 });
        x += anchos[i];
      });
      doc.y = y + alto;
    });
  }

  // Pie de pagina: numero de pagina (se escribe al final, cuando ya se sabe el total)
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i += 1) {
    doc.switchToPage(paginas.start + i);
    doc.page.margins.bottom = 0; // evita que escribir en el margen cree una pagina nueva
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#777777')
      .text(`SCCVI - Página ${i + 1} de ${paginas.count}`, margen, doc.page.height - margen, {
        width: anchoUtil,
        align: 'right',
        lineBreak: false,
      });
  }

  doc.end();
}

module.exports = { enviarExcel, enviarPdf };
