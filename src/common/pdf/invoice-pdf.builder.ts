type PdfTextStyle = 'heading' | 'subheading' | 'normal' | 'small';

interface PdfTextLine {
  text: string;
  style: PdfTextStyle;
}

type PdfTextAlignment = 'left' | 'right';

interface PdfTableLine {
  cells: string[];
  widths: number[];
  alignments: PdfTextAlignment[];
  style: 'tableHeader' | 'tableCell';
}

interface PdfKeyValueLine {
  label: string;
  value: string;
}

interface PdfPageBreakLine {
  pageBreak: true;
}

type PdfLine = PdfTextLine | PdfTableLine | PdfKeyValueLine | PdfPageBreakLine;

export interface InvoicePdfTable {
  columns: Array<{
    header: string;
    width?: number;
    align?: PdfTextAlignment;
  }>;
  rows: string[][];
}

export interface InvoicePdfSection {
  title?: string;
  rows?: string[];
  tables?: InvoicePdfTable[];
  pageBreakBefore?: boolean;
}

export interface InvoicePdfInput {
  title: string;
  subtitle?: string;
  invoiceNumber: string;
  issuedAt: Date;
  brandName?: string;
  direction?: 'ltr' | 'rtl';
  headerLines?: string[];
  labels?: {
    invoiceNumber?: string;
    issued?: string;
    footer?: string;
    page?: string;
    of?: string;
  };
  meta?: Array<{ label: string; value: string | number | null | undefined }>;
  sections: InvoicePdfSection[];
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const HEADER_HEIGHT = 92;
const HEADER_BOTTOM = PAGE_HEIGHT - HEADER_HEIGHT;
const CONTENT_TOP = HEADER_BOTTOM - 32;
const LINE_HEIGHT = 14;
const TABLE_ROW_HEIGHT = 18;
const BOTTOM = 54;
const MAX_CHARS = 92;
const TABLE_WIDTH = PAGE_WIDTH - LEFT * 2;

export class InvoicePdfBuilder {
  static build(input: InvoicePdfInput) {
    const pages = this.paginate(this.toLines(input));
    const objects: string[] = [];
    const pageObjectIds: number[] = [];
    const fontRegularId = 3;
    const fontBoldId = 4;

    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    objects.push('2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n');
    objects.push(
      '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    );
    objects.push(
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    );

    for (const [index, lines] of pages.entries()) {
      const pageId = objects.length + 1;
      const contentId = pageId + 1;
      pageObjectIds.push(pageId);
      const stream = this.buildPageStream(
        input,
        lines,
        index + 1,
        pages.length,
      );
      objects.push(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      );
      objects.push(
        `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
      );
    }

    objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`;

    return this.serialize(objects);
  }

  private static toLines(input: InvoicePdfInput) {
    const lines: PdfLine[] = [{ text: input.title, style: 'heading' }];

    if (input.subtitle) {
      lines.push({ text: input.subtitle, style: 'subheading' });
    }

    lines.push(
      {
        text: `${input.labels?.invoiceNumber ?? 'Invoice #'}: ${input.invoiceNumber}`,
        style: 'small',
      },
      {
        text: `${input.labels?.issued ?? 'Issued'}: ${this.formatDate(input.issuedAt)}`,
        style: 'normal',
      },
    );

    if (input.meta?.length) {
      lines.push({ text: '', style: 'normal' });
      for (const item of input.meta) {
        lines.push({ label: item.label, value: String(item.value ?? 'N/A') });
      }
    }

    for (const section of input.sections) {
      if (section.pageBreakBefore) {
        lines.push({ pageBreak: true });
      }
      lines.push({ text: '', style: 'normal' });
      if (section.title) {
        lines.push({ text: section.title, style: 'subheading' });
      }
      for (const table of section.tables ?? []) {
        const widths = this.normalizeTableWidths(table.columns);
        const defaultAlignment = input.direction === 'rtl' ? 'right' : 'left';
        lines.push({
          cells: table.columns.map((column) => column.header),
          widths,
          alignments: table.columns.map(
            (column) => column.align ?? defaultAlignment,
          ),
          style: 'tableHeader',
        });
        for (const row of table.rows) {
          lines.push({
            cells: row,
            widths,
            alignments: table.columns.map(
              (column) => column.align ?? defaultAlignment,
            ),
            style: 'tableCell',
          });
        }
      }
      for (const row of section.rows ?? []) {
        const keyValue = this.toKeyValue(row);
        if (keyValue) {
          lines.push(keyValue);
          continue;
        }

        for (const wrapped of this.wrap(row)) {
          lines.push({ text: wrapped, style: 'normal' });
        }
      }
    }

    return lines;
  }

  private static paginate(lines: PdfLine[]) {
    const pages: PdfLine[][] = [[]];
    let y = CONTENT_TOP;

    for (const line of lines) {
      if ('pageBreak' in line) {
        if (pages[pages.length - 1].length > 0) {
          pages.push([]);
        }
        y = CONTENT_TOP;
        continue;
      }
      if (y < BOTTOM) {
        pages.push([]);
        y = CONTENT_TOP;
      }
      pages[pages.length - 1].push(line);
      y -= this.lineHeight(line);
    }

    return pages;
  }

  private static buildPageStream(
    input: InvoicePdfInput,
    lines: PdfLine[],
    pageNumber: number,
    totalPages: number,
  ) {
    const isRtl = input.direction === 'rtl';
    const deliveryWayX = isRtl
      ? PAGE_WIDTH - LEFT - this.estimateTextWidth('DeliveryWay', 23)
      : LEFT;
    const brandName = input.brandName ?? 'Restaurant Commerce Platform';
    const brandX = isRtl
      ? PAGE_WIDTH - LEFT - this.estimateTextWidth(brandName, 10)
      : LEFT;
    const commands: string[] = [
      '0.95 0.22 0.09 rg',
      `0 ${HEADER_BOTTOM} ${PAGE_WIDTH} ${HEADER_HEIGHT} re f`,
      '1 1 1 rg',
      `BT /F2 23 Tf ${deliveryWayX} ${PAGE_HEIGHT - 38} Td (DeliveryWay) Tj ET`,
      `BT /F1 10 Tf ${brandX} ${PAGE_HEIGHT - 58} Td (${this.escape(brandName)}) Tj ET`,
    ];
    for (const [index, line] of (input.headerLines ?? [])
      .slice(0, 3)
      .entries()) {
      const size = 8.5;
      const x = isRtl
        ? Math.max(LEFT, PAGE_WIDTH - LEFT - this.estimateTextWidth(line, size))
        : LEFT;
      commands.push(
        `BT /F1 ${size} Tf ${x} ${PAGE_HEIGHT - 76 - index * 11} Td (${this.escape(line)}) Tj ET`,
      );
    }
    commands.push('0.12 0.12 0.12 rg');
    let y = CONTENT_TOP;

    for (const line of lines) {
      if ('pageBreak' in line) {
        continue;
      }
      if ('cells' in line) {
        this.pushTableRow(commands, line, y);
      } else if ('label' in line) {
        this.pushKeyValue(commands, line, y, input.direction ?? 'ltr');
      } else {
        const font = line.style === 'subheading' ? 'F2' : 'F1';
        const size = this.fontSize(line.style);
        const textWidth = this.estimateTextWidth(line.text, size);
        const textX =
          input.direction === 'rtl' ? PAGE_WIDTH - LEFT - textWidth : LEFT;
        commands.push(
          `BT /${font} ${size} Tf ${Math.max(LEFT, textX)} ${y} Td (${this.escape(line.text)}) Tj ET`,
        );
      }
      y -= this.lineHeight(line);
    }

    const footer = `${input.labels?.footer ?? 'Generated by DeliveryWay'} · ${input.labels?.page ?? 'Page'} ${pageNumber} ${input.labels?.of ?? 'of'} ${totalPages}`;
    const footerX = isRtl
      ? PAGE_WIDTH - LEFT - this.estimateTextWidth(footer, 9)
      : LEFT;
    commands.push(
      '0.45 0.45 0.45 rg',
      `BT /F1 9 Tf ${Math.max(LEFT, footerX)} 32 Td (${this.escape(footer)}) Tj ET`,
    );

    return commands.join('\n');
  }

  private static estimateTextWidth(text: string, fontSize: number) {
    return text.length * fontSize * 0.48;
  }

  private static lineHeight(line: PdfLine) {
    if ('pageBreak' in line) return 0;
    if ('cells' in line) return TABLE_ROW_HEIGHT;
    if ('label' in line) return 15;
    const { style } = line;
    return style === 'heading' ? 18 : style === 'subheading' ? 18 : LINE_HEIGHT;
  }

  private static fontSize(style: PdfTextStyle) {
    switch (style) {
      case 'heading':
        return 13;
      case 'subheading':
        return 12;
      case 'small':
        return 9;
      default:
        return 10;
    }
  }

  private static normalizeTableWidths(
    columns: Array<{ header: string; width?: number }>,
  ) {
    const explicitTotal = columns.reduce(
      (total, column) => total + (column.width ?? 0),
      0,
    );
    const unspecifiedCount = columns.filter(
      (column) => column.width === undefined,
    ).length;
    const fallbackWidth =
      unspecifiedCount > 0
        ? Math.max((TABLE_WIDTH - explicitTotal) / unspecifiedCount, 40)
        : TABLE_WIDTH / Math.max(columns.length, 1);

    const widths = columns.map((column) => column.width ?? fallbackWidth);
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (total <= TABLE_WIDTH) return widths;

    const scale = TABLE_WIDTH / total;
    return widths.map((width) => width * scale);
  }

  private static pushTableRow(
    commands: string[],
    line: PdfTableLine,
    y: number,
  ) {
    let x = LEFT;
    const font = line.style === 'tableHeader' ? 'F2' : 'F1';
    const defaultSize = line.style === 'tableHeader' ? 8.5 : 8;
    const rowBottom = y - 5;
    const fill = line.style === 'tableHeader' ? '0.93 0.94 0.96' : '1 1 1';

    for (const [index, cell] of line.cells.entries()) {
      const width = line.widths[index] ?? 60;
      const size =
        line.style === 'tableHeader'
          ? this.fitTextSize(cell, width - 8, defaultSize, 5.5)
          : defaultSize;
      const text = this.truncateForWidth(cell, width - 8, size);
      const textX =
        line.alignments[index] === 'right'
          ? x + width - 4 - this.estimateTextWidth(text, size)
          : x + 4;
      commands.push(
        '0.78 0.78 0.78 RG',
        `${fill} rg`,
        `0.5 w ${x} ${rowBottom} ${width} ${TABLE_ROW_HEIGHT} re B`,
        '0.12 0.12 0.12 rg',
        `BT /${font} ${size} Tf ${Math.max(x + 4, textX)} ${y} Td (${this.escape(text)}) Tj ET`,
      );
      x += width;
    }
  }

  private static pushKeyValue(
    commands: string[],
    line: PdfKeyValueLine,
    y: number,
    direction: 'ltr' | 'rtl',
  ) {
    if (direction === 'rtl') {
      const text = this.truncateForWidth(
        `${line.label}: ${line.value}`,
        TABLE_WIDTH,
      );
      const x = PAGE_WIDTH - LEFT - this.estimateTextWidth(text, 9.5);
      commands.push(
        `BT /F1 9.5 Tf ${Math.max(LEFT, x)} ${y} Td (${this.escape(text)}) Tj ET`,
      );
      return;
    }

    const labelWidth = 210;
    const valueX = LEFT + labelWidth;
    const valueWidth = TABLE_WIDTH - labelWidth;
    const valueSize = this.fitTextSize(line.value, valueWidth, 9.5, 5.5);

    commands.push(
      `BT /F2 9.5 Tf ${LEFT} ${y} Td (${this.escape(
        this.truncateForWidth(`${line.label}:`, labelWidth - 12, 9.5),
      )}) Tj ET`,
      `BT /F1 ${valueSize} Tf ${valueX} ${y} Td (${this.escape(
        this.truncateForWidth(line.value, valueWidth, valueSize),
      )}) Tj ET`,
    );
  }

  private static toKeyValue(text: string): PdfKeyValueLine | null {
    const separator = text.indexOf(':');
    if (separator <= 0 || separator > 42) {
      return null;
    }

    const label = text.slice(0, separator).trim();
    const value = text.slice(separator + 1).trim();
    if (!label || !value || label.split(' ').length > 5) {
      return null;
    }

    return { label, value };
  }

  private static fitTextSize(
    text: string,
    width: number,
    preferredSize: number,
    minimumSize: number,
  ) {
    if (!text.length) return preferredSize;
    return Math.max(
      minimumSize,
      Math.min(preferredSize, width / (text.length * 0.48)),
    );
  }

  private static truncateForWidth(text: string, width: number, fontSize = 10) {
    const maxChars = Math.max(Math.floor(width / (fontSize * 0.48)), 4);
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 3)}...`;
  }

  private static formatDate(value: Date) {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(value);
  }

  private static wrap(text: string) {
    if (text.length <= MAX_CHARS) return [text];
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > MAX_CHARS) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }

    if (current) lines.push(current);
    return lines;
  }

  private static escape(text: string) {
    const winAnsiOverrides: Record<string, number> = {
      '€': 128,
      '‚': 130,
      '„': 132,
      '…': 133,
      '“': 147,
      '”': 148,
      '•': 149,
      '–': 150,
      '—': 151,
      '™': 153,
    };

    return [...text]
      .map((character) => {
        if (character === '\\') return '\\\\';
        if (character === '(') return '\\(';
        if (character === ')') return '\\)';

        const code = winAnsiOverrides[character] ?? character.charCodeAt(0);
        if (code >= 32 && code <= 126) return character;
        if (code >= 128 && code <= 255) {
          return `\\${code.toString(8).padStart(3, '0')}`;
        }
        return '?';
      })
      .join('');
  }

  private static serialize(objects: string[]) {
    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += object;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const offset of offsets.slice(1)) {
      pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, 'utf8');
  }
}
